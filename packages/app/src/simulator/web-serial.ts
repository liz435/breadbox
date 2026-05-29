// ── Web Serial API Wrapper ─────────────────────────────────────────────────
//
// Connects to a real Arduino (or any USB serial device) via the Web Serial API.
// Chrome/Edge only. Requires HTTPS or localhost.
//
// Types live in `./web-serial-types` so this wrapper and the hosted
// upload/monitor paths share one Navigator augmentation.

import { isWebSerialSupported, type SerialPort } from "./web-serial-types"
export { isWebSerialSupported } from "./web-serial-types"

export type WebSerialCallbacks = {
  onData: (text: string) => void
  onConnect: () => void
  onDisconnect: () => void
  onError: (error: string) => void
}

export type WebSerialConnection = {
  isConnected: () => boolean
  connect: (baudRate: number) => Promise<void>
  disconnect: () => Promise<void>
  write: (data: string) => Promise<void>
  getPort: () => SerialPort | null
}

export function createWebSerial(callbacks: WebSerialCallbacks): WebSerialConnection {
  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writable: WritableStream<Uint8Array> | null = null
  let connected = false
  let readLoopRunning = false

  async function readLoop() {
    if (!port?.readable || readLoopRunning) return
    readLoopRunning = true
    const decoder = new TextDecoder()

    try {
      reader = port.readable.getReader()
      while (connected) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          callbacks.onData(decoder.decode(value))
        }
      }
    } catch (err) {
      if (connected) {
        callbacks.onError(err instanceof Error ? err.message : "Serial read error")
      }
    } finally {
      reader?.releaseLock()
      reader = null
      readLoopRunning = false
    }
  }

  async function connect(baudRate: number): Promise<void> {
    if (!isWebSerialSupported()) {
      callbacks.onError("Web Serial API is not supported in this browser")
      return
    }

    try {
      // Prompt user to select a serial port
      port = await navigator.serial!.requestPort()
      await port.open({ baudRate })
      writable = port.writable
      connected = true
      callbacks.onConnect()

      // Handle unexpected disconnect
      port.addEventListener("disconnect", () => {
        connected = false
        callbacks.onDisconnect()
      })

      // Start reading
      readLoop()
    } catch (err) {
      port = null
      connected = false
      if (err instanceof DOMException && err.name === "NotFoundError") {
        // User cancelled the port picker — not an error
        return
      }
      callbacks.onError(err instanceof Error ? err.message : "Failed to connect")
    }
  }

  async function disconnect(): Promise<void> {
    connected = false

    try {
      reader?.cancel()
    } catch { /* ignore */ }

    try {
      if (writable) {
        // Close the writer if open
        writable = null
      }
    } catch { /* ignore */ }

    try {
      await port?.close()
    } catch { /* ignore */ }

    port = null
    callbacks.onDisconnect()
  }

  async function write(data: string): Promise<void> {
    if (!connected || !writable) return

    const encoder = new TextEncoder()
    const writer = writable.getWriter()
    try {
      await writer.write(encoder.encode(data))
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : "Serial write error")
    } finally {
      writer.releaseLock()
    }
  }

  return {
    isConnected: () => connected,
    connect,
    disconnect,
    write,
    getPort: () => port,
  }
}
