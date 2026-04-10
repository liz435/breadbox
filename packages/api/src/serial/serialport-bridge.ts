// ── Serialport Bridge ─────────────────────────────────────────────────────
//
// Manages a Node.js child process that owns the serialport native addon.
// Bun's native addon support for serialport is fragile, so we run it in
// a separate `node` process and communicate over stdio with JSON lines.

import { spawn } from "node:child_process"
import path from "node:path"

export type SerialPortInfo = {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

type WorkerMessage = Record<string, unknown> & { id?: string; type: string }

// ── Worker lifecycle ────────────────────────────────────────────────────

let worker: ReturnType<typeof spawn> | null = null
let inputBuffer = ""
const pending = new Map<string, {
  resolve: (v: WorkerMessage) => void
  reject: (e: Error) => void
}>()
const dataCallbacks = new Map<string, (text: string) => void>()
const closeCallbacks = new Map<string, () => void>()

function ensureWorker(): ReturnType<typeof spawn> {
  if (worker) return worker

  const workerScript = path.join(import.meta.dirname, "serial-worker.cjs")
  // cwd = workspace root so Node can resolve node_modules/serialport
  const repoRoot = path.resolve(import.meta.dirname, "../../../../")

  worker = spawn("node", [workerScript], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "inherit"],
  })

  worker.stdout!.setEncoding("utf8")
  worker.stdout!.on("data", (chunk: string) => {
    inputBuffer += chunk
    const lines = inputBuffer.split("\n")
    inputBuffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as WorkerMessage
        dispatchMessage(msg)
      } catch { /* malformed — ignore */ }
    }
  })

  worker.on("exit", (code) => {
    worker = null
    // Reject all pending requests
    for (const [, { reject }] of pending) {
      reject(new Error(`serial worker exited with code ${code}`))
    }
    pending.clear()
  })

  return worker
}

function dispatchMessage(msg: WorkerMessage) {
  if (msg.type === "data" && typeof msg.path === "string") {
    dataCallbacks.get(msg.path)?.(msg.data as string)
    return
  }
  if (msg.type === "closed" && typeof msg.path === "string") {
    closeCallbacks.get(msg.path)?.()
    closeCallbacks.delete(msg.path)
    dataCallbacks.delete(msg.path)
  }
  if (msg.id && pending.has(msg.id as string)) {
    const entry = pending.get(msg.id as string)!
    pending.delete(msg.id as string)
    if (msg.type === "error") {
      entry.reject(new Error(msg.error as string ?? "serial worker error"))
    } else {
      entry.resolve(msg)
    }
  }
}

function sendToWorker(msg: Record<string, unknown>): Promise<WorkerMessage> {
  const id = crypto.randomUUID()
  const w = ensureWorker()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.stdin!.write(JSON.stringify({ ...msg, id }) + "\n")
  })
}

// ── Public API ──────────────────────────────────────────────────────────

export async function listPorts(): Promise<SerialPortInfo[]> {
  const result = await sendToWorker({ type: "list" })
  return (result.ports as SerialPortInfo[]) ?? []
}

export async function openPort(
  portPath: string,
  baudRate: number,
  onData: (text: string) => void,
  onClose?: () => void,
): Promise<void> {
  dataCallbacks.set(portPath, onData)
  if (onClose) closeCallbacks.set(portPath, onClose)
  await sendToWorker({ type: "open", path: portPath, baudRate })
}

export function writePort(portPath: string, data: string): void {
  // Fire-and-forget write
  sendToWorker({ type: "write", path: portPath, data }).catch(() => {})
}

export async function closePort(portPath: string): Promise<void> {
  dataCallbacks.delete(portPath)
  closeCallbacks.delete(portPath)
  await sendToWorker({ type: "close", path: portPath })
}

/** Stop the worker process entirely. Called on server shutdown. */
export function stopWorker(): void {
  worker?.kill()
  worker = null
}
