// ── Serialport Bridge (arduino-cli monitor edition) ─────────────────────
//
// Previous implementation spawned a Node subprocess hosting the
// `serialport` native addon. That required Node on PATH, shipped 30MB+
// of native prebuilds per platform, and crashed in Bun-compiled binaries
// because the .cjs worker wasn't embedded.
//
// This version shells out to `arduino-cli monitor` per open port. One
// monitor process per unique port; stdout → onData; stdin ← writePort.
// Availability follows arduino-cli (lazy-installed via toolchain resolver).
//
// One monitor per port means the underlying serial driver is owned by
// a single process, so multiple WS subscribers multiplex through our
// board-manager just like before.

import { spawn, execFile } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { resolveArduinoCli } from "../toolchain"
import { createLogger } from "../logger"

const log = createLogger("serial-bridge")

// Kill a child process and, on Windows, its entire subtree.
//
// Node's kill (and execFile's built-in `timeout`) terminates only the direct
// child. On Unix that's enough for arduino-cli's helper tools — e.g. the
// rp2040 core's `pqt-python3` discovery processes: when arduino-cli dies they
// get EOF on their pipes and exit on their own, then init reaps them. Windows
// has no such signal and no process-group kill, so those grandchildren are
// orphaned and accumulate (one per 3s `board list` poll that hits the timeout)
// until they starve the machine. `taskkill /T` reaps the whole tree.
//
// CONTAINMENT: the `win32` branch is the ONLY behavioral change in this file.
// On every other platform this reduces to the exact previous `proc.kill()`.
function killProcessTree(proc: ChildProcess): void {
  if (process.platform !== "win32" || proc.pid == null) {
    try { proc.kill() } catch { /* best-effort */ }
    return
  }
  // Fire-and-forget: /T kills the tree, /F forces it. The callback swallows
  // "process not found" races (arduino-cli may have already exited).
  execFile("taskkill", ["/PID", String(proc.pid), "/T", "/F"], () => {})
}

// Run a short-lived command to completion, collecting stdout. On timeout, kill
// the whole process tree (see killProcessTree) instead of leaving arduino-cli's
// slow child helpers orphaned. Replaces promisified execFile, whose built-in
// `timeout` only kills the direct child — the root cause of the Windows leak.
function runToCompletion(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let timedOut = false

    proc.stdout?.setEncoding("utf8")
    proc.stdout?.on("data", (c: string) => { stdout += c })
    proc.stderr?.setEncoding("utf8")
    proc.stderr?.on("data", (c: string) => { stderr += c })

    const timer = setTimeout(() => {
      timedOut = true
      killProcessTree(proc)
    }, timeoutMs)

    proc.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on("close", (code) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error(`\`${cmd} board list\` timed out after ${timeoutMs}ms`))
      else if (code !== 0 && code !== null) reject(new Error(`exited ${code}: ${stderr.trim()}`))
      else resolve(stdout)
    })
  })
}

export type SerialPortInfo = {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

export class SerialUnavailableError extends Error {
  constructor(reason: string) {
    super(`serial subsystem unavailable: ${reason}`)
    this.name = "SerialUnavailableError"
  }
}

// ── arduino-cli availability (cached) ─────────────────────────────────

let cachedPath: string | null | undefined

async function arduinoCliPath(): Promise<string | null> {
  if (cachedPath !== undefined) return cachedPath
  try {
    cachedPath = await resolveArduinoCli({ install: false })
  } catch {
    cachedPath = null
    log.warn("arduino-cli not found — serial features disabled. Run `dreamer setup` to install.")
  }
  return cachedPath
}

export function isSerialAvailable(): boolean {
  // Best-effort sync probe — callers that care about real availability
  // should attempt an op and handle SerialUnavailableError.
  return cachedPath !== null && cachedPath !== undefined
}

// ── Per-port monitor process ────────────────────────────────────────

type MonitorSession = {
  proc: ChildProcess
  onData: (text: string) => void
  onClose?: () => void
  lineBuffer: string
}

const monitors = new Map<string, MonitorSession>()

// ── Public API ──────────────────────────────────────────────────────

/**
 * List available serial ports via `arduino-cli board list`. Returns []
 * if arduino-cli is missing rather than throwing — the UI then shows
 * no ports instead of erroring.
 *
 * In-flight coalescing: overlapping callers share a single arduino-cli
 * invocation. `board list` does a full `LoadHardware` on every run
 * (~30–40 OS threads while AVR + rp2040 cores load), and with multiple
 * UI consumers polling at 3s the naive path stacks processes and can
 * exhaust the pids cgroup on small replicas.
 */
let inflightListPorts: Promise<SerialPortInfo[]> | null = null
export function listPorts(): Promise<SerialPortInfo[]> {
  if (inflightListPorts) return inflightListPorts
  inflightListPorts = doListPorts().finally(() => {
    inflightListPorts = null
  })
  return inflightListPorts
}

async function doListPorts(): Promise<SerialPortInfo[]> {
  const cli = await arduinoCliPath()
  if (!cli) return []
  try {
    const stdout = await runToCompletion(cli, ["board", "list", "--format", "json"], 5_000)
    const data = JSON.parse(stdout) as {
      detected_ports?: Array<{
        port?: {
          address?: string
          properties?: Record<string, string>
        }
      }>
    } | Array<{ port?: { address?: string; properties?: Record<string, string> } }>

    // arduino-cli 1.x wraps ports under detected_ports; older versions return an array.
    const rawPorts = Array.isArray(data) ? data : (data.detected_ports ?? [])
    const ports: SerialPortInfo[] = []
    for (const entry of rawPorts) {
      const p = entry.port
      if (!p?.address) continue
      const info: SerialPortInfo = { path: p.address }
      if (p.properties?.manufacturer) info.manufacturer = p.properties.manufacturer
      if (p.properties?.serialNumber) info.serialNumber = p.properties.serialNumber
      if (p.properties?.vid) info.vendorId = p.properties.vid
      if (p.properties?.pid) info.productId = p.properties.pid
      ports.push(info)
    }
    return ports
  } catch (err) {
    log.warn(`listPorts failed: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

/**
 * Open a port. Spawns an `arduino-cli monitor` subprocess and pipes
 * its stdout to `onData` (line-buffered). Writes via writePort go to
 * its stdin.
 */
export async function openPort(
  portPath: string,
  baudRate: number,
  onData: (text: string) => void,
  onClose?: () => void,
): Promise<void> {
  if (monitors.has(portPath)) {
    throw new Error(`port ${portPath} already open`)
  }

  const cli = await arduinoCliPath()
  if (!cli) throw new SerialUnavailableError("arduino-cli not found")

  const proc = spawn(cli, [
    "monitor",
    "-p", portPath,
    "-c", `baudrate=${baudRate}`,
    "--quiet",
    "--raw",
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  })

  const session: MonitorSession = { proc, onData, onClose, lineBuffer: "" }
  monitors.set(portPath, session)

  proc.stdout!.setEncoding("utf8")
  proc.stdout!.on("data", (chunk: string) => {
    // Forward incoming serial data verbatim. The monitor itself is raw;
    // board-manager handles line splitting + telemetry parsing.
    session.onData(chunk)
  })

  proc.stderr!.setEncoding("utf8")
  proc.stderr!.on("data", (chunk: string) => {
    // arduino-cli writes errors to stderr; relay through onData as an
    // error frame so the UI sees "can't open port" etc.
    const text = chunk.trim()
    if (text) log.warn(`monitor[${portPath}]: ${text}`)
  })

  proc.on("exit", (code) => {
    monitors.delete(portPath)
    if (code !== 0 && code !== null) {
      log.info(`monitor for ${portPath} exited with code ${code}`)
    }
    session.onClose?.()
  })

  proc.on("error", (err) => {
    log.warn(`monitor spawn failed for ${portPath}: ${err.message}`)
    monitors.delete(portPath)
    session.onClose?.()
  })

  // arduino-cli monitor is ready to stream once the process is running.
  // It doesn't send a "ready" signal, so we return immediately.
  // If the port is invalid, the exit handler will fire within ms.
}

export function writePort(portPath: string, data: string): void {
  const session = monitors.get(portPath)
  if (!session) return
  try {
    session.proc.stdin!.write(data)
  } catch {
    // Stream might have closed between check and write — ignore.
  }
}

export async function closePort(portPath: string): Promise<void> {
  const session = monitors.get(portPath)
  if (!session) return
  monitors.delete(portPath)
  try {
    killProcessTree(session.proc)
    // Wait briefly for exit (bounded)
    await Promise.race([
      new Promise<void>((resolve) => session.proc.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ])
  } catch {
    // best-effort
  }
}

/** Stop all monitor processes. Called on server shutdown. */
export function stopWorker(): void {
  for (const [path, session] of monitors) {
    killProcessTree(session.proc)
    monitors.delete(path)
  }
}
