import { BOARD_TARGETS, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"
import type { ProjectFile, CustomLibrary } from "@dreamer/schemas"
import { resolveArduinoCli, ensureArduinoCliCore, ArduinoCliMissingError } from "@dreamer/api/toolchain"
import { attemptAutoInstall, extractMissingHeader, writeCustomLibraries } from "@dreamer/api/libraries"
import { tmpdir } from "os"
import { join } from "path"
import { rm } from "fs/promises"

type ExecResult = { stdout: string; stderr: string; exitCode: number }

async function exec(cmd: string[]): Promise<ExecResult> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { stdout, stderr, exitCode: await proc.exited }
}

// Track temp paths created mid-compile/flash. On SIGINT, Bun's process.exit
// fires `finally` blocks *before* exit only for normally-returning code — if
// arduino-cli is blocked on spawn, the finally never runs. This cleans them
// up explicitly on signal.
const activeTempPaths = new Set<string>()
let cleanupHandlerRegistered = false

function registerCleanupOnce(): void {
  if (cleanupHandlerRegistered) return
  cleanupHandlerRegistered = true
  const cleanup = () => {
    for (const path of activeTempPaths) {
      try {
        // Synchronous removal via fs — platform-neutral (works on Windows).
        // Use require to avoid top-level import cycle if this module is
        // loaded early; fs.rmSync is always available.
        const { rmSync } = require("fs") as typeof import("fs")
        rmSync(path, { recursive: true, force: true })
      } catch {
        // best-effort
      }
    }
    activeTempPaths.clear()
  }
  process.on("SIGINT", () => {
    cleanup()
    process.exit(130) // 128 + SIGINT(2)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(143) // 128 + SIGTERM(15)
  })
  process.on("exit", cleanup)
}

function normalizeCompileError(stderr: string): string {
  return stderr.replace(
    /sketch\.ino:(\d+):(\d+):/g,
    (_match, line, col) => {
      const corrected = Math.max(1, parseInt(line, 10) - 1)
      return `sketch.ino:${corrected}:${col}:`
    },
  )
}

export type CompileResult = {
  success: boolean
  hex?: string
  error?: string
  sizeInfo?: {
    flashUsed: number
    flashMax: number
    flashPercent: number
    ramUsed: number
    ramMax: number
    ramPercent: number
  }
}

export async function compileSketch(project: ProjectFile): Promise<CompileResult> {
  const code = project.boardState?.sketchCode
  if (!code || code.trim() === "") {
    return { success: false, error: "No sketch code to compile." }
  }

  let arduinoCli: string
  try {
    arduinoCli = await resolveArduinoCli()
    await ensureArduinoCliCore("arduino:avr")
  } catch (err) {
    if (err instanceof ArduinoCliMissingError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: String(err) }
  }

  const boardTarget = project.boardState?.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = BOARD_TARGETS[boardTarget].fqbn
  const sketchId = crypto.randomUUID()
  const sketchDir = join(tmpdir(), `arduino-sketch-${sketchId}`)
  const sketchFile = join(sketchDir, "sketch", "sketch.ino")
  const outputDir = join(sketchDir, "output")

  registerCleanupOnce()
  activeTempPaths.add(sketchDir)

  try {
    await Bun.write(sketchFile, code)

    // Custom libraries live in the project file. Write each to
    // `libs/<Name>/<Name>.h` so arduino-cli can resolve them via
    // `--libraries <libsDir>`.
    const customLibs = project.boardState?.customLibraries ?? {}
    const customLibsEntries = Object.entries(customLibs)
    let libsDir: string | null = null
    if (customLibsEntries.length > 0) {
      libsDir = join(sketchDir, "libs")
      const payload: Record<string, { name: string; code: string; description?: string }> = {}
      for (const [key, lib] of customLibsEntries) {
        const typed = lib as CustomLibrary
        payload[key] = { name: typed.name, code: typed.code, description: typed.description }
      }
      await writeCustomLibraries(libsDir, payload)
    }

    // Try compile, retry up to MAX_RETRIES times with auto-install of
    // missing third-party libraries from the Arduino index.
    const compileArgs = (): string[] => {
      const args = [
        arduinoCli, "compile",
        "--fqbn", fqbn,
        "--output-dir", outputDir,
      ]
      if (libsDir) args.push("--libraries", libsDir)
      args.push(join(sketchDir, "sketch"))
      return args
    }

    const MAX_RETRIES = 3
    const autoInstalled: string[] = []
    let result = await exec(compileArgs())
    for (let attempt = 0; attempt < MAX_RETRIES && result.exitCode !== 0; attempt++) {
      const missing = extractMissingHeader(result.stderr + result.stdout)
      if (!missing || autoInstalled.includes(missing)) break
      const install = await attemptAutoInstall(missing)
      if ("reason" in install) break
      autoInstalled.push(missing)
      result = await exec(compileArgs())
    }

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: normalizeCompileError(result.stderr || result.stdout || "Compilation failed"),
      }
    }

    const hexFile = join(outputDir, "sketch.ino.hex")
    let hex: string
    try {
      hex = await Bun.file(hexFile).text()
    } catch {
      try {
        hex = await Bun.file(join(outputDir, "sketch.ino.with_bootloader.hex")).text()
      } catch {
        return { success: false, error: "Compilation succeeded but hex file not found." }
      }
    }

    // Parse size info
    const combined = result.stderr + result.stdout
    const flashMatch = combined.match(
      /Sketch uses (\d+) bytes \((\d+)%\) of program storage space\. Maximum is (\d+) bytes/,
    )
    const ramMatch = combined.match(
      /Global variables use (\d+) bytes \((\d+)%\) of dynamic memory.*Maximum is (\d+) bytes/,
    )
    const sizeInfo =
      flashMatch && ramMatch
        ? {
            flashUsed: parseInt(flashMatch[1], 10),
            flashMax: parseInt(flashMatch[3], 10),
            flashPercent: parseInt(flashMatch[2], 10),
            ramUsed: parseInt(ramMatch[1], 10),
            ramMax: parseInt(ramMatch[3], 10),
            ramPercent: parseInt(ramMatch[2], 10),
          }
        : undefined

    return { success: true, hex, sizeInfo }
  } finally {
    activeTempPaths.delete(sketchDir)
    rm(sketchDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function flashSketch(
  project: ProjectFile,
  port: string,
): Promise<{ success: boolean; error?: string }> {
  const compiled = await compileSketch(project)
  if (!compiled.success || !compiled.hex) {
    return { success: false, error: compiled.error ?? "Compilation failed." }
  }

  let arduinoCli: string
  try {
    arduinoCli = await resolveArduinoCli()
  } catch (err) {
    if (err instanceof ArduinoCliMissingError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: String(err) }
  }

  const boardTarget = project.boardState?.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = BOARD_TARGETS[boardTarget].fqbn
  const hexId = crypto.randomUUID()
  const hexFile = join(tmpdir(), `arduino-flash-${hexId}.hex`)

  registerCleanupOnce()
  activeTempPaths.add(hexFile)

  try {
    await Bun.write(hexFile, compiled.hex)

    const result = await exec([
      arduinoCli, "upload",
      "-p", port,
      "--fqbn", fqbn,
      "--input-file", hexFile,
    ])

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: result.stderr || result.stdout || "Upload failed.",
      }
    }

    return { success: true }
  } finally {
    activeTempPaths.delete(hexFile)
    rm(hexFile, { force: true }).catch(() => {})
  }
}

export async function listPorts(): Promise<string[]> {
  let arduinoCli: string
  try {
    arduinoCli = await resolveArduinoCli({ install: false })
  } catch {
    return []
  }
  const result = await exec([arduinoCli, "board", "list", "--format", "json"])
  if (result.exitCode !== 0) return []
  try {
    const data = JSON.parse(result.stdout) as Array<{ port?: { address?: string } }>
    return data
      .map((b) => b.port?.address)
      .filter((p): p is string => !!p)
  } catch {
    return []
  }
}
