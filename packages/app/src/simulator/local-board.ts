// ── Local Board ───────────────────────────────────────────────────────────
//
// WebSocket client that talks to the API server's /api/boards/:path endpoint.
// Exposes the same interface as the old web-serial.ts so existing consumers
// need minimal changes. The API server owns the actual serial port.
//
// Incoming WS messages are JSON objects:
//   { type: "data",         text }      → user serial output → onData
//   { type: "telemetry",    frame }     → debug frames      → onTelemetry
//   { type: "connected" }               → onConnect
//   { type: "disconnected" }            → onDisconnect
//   { type: "reconnecting" }            → onReconnecting (board reset after flash)
//   { type: "error",        error }     → onError

import { API_ORIGIN } from "@dreamer/config"

const API_BASE = API_ORIGIN

type TelemetryFrame = {
  ts: number
  wallTime: number
  digital: number[]
  analog: number[]
}

export type LocalBoardCallbacks = {
  onData: (text: string) => void
  onTelemetry?: (frame: TelemetryFrame) => void
  onConnect: () => void
  onDisconnect: () => void
  onReconnecting?: () => void
  onError: (error: string) => void
}

export type LocalBoardConnection = {
  isConnected: () => boolean
  connect: (portPath: string, baudRate: number) => Promise<void>
  disconnect: () => Promise<void>
  write: (data: string) => void
  getPortPath: () => string | null
}

const WS_BASE = API_BASE.replace(/^http/, "ws")

export function createLocalBoard(callbacks: LocalBoardCallbacks): LocalBoardConnection {
  let ws: WebSocket | null = null
  let connected = false
  let portPath: string | null = null

  async function connect(path: string, baudRate: number): Promise<void> {
    if (connected) await disconnect()

    portPath = path
    const url = `${WS_BASE}/api/boards/${encodeURIComponent(path)}?baud=${baudRate}`

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      ws = socket

      const timeout = setTimeout(() => {
        socket.close()
        reject(new Error(`Connection to ${path} timed out`))
      }, 8_000)

      socket.onopen = () => {
        clearTimeout(timeout)
        connected = true
        callbacks.onConnect()
        resolve()
      }

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>
          handleMessage(msg)
        } catch {
          // raw text (shouldn't happen with our protocol)
          callbacks.onData(event.data as string)
        }
      }

      socket.onerror = () => {
        clearTimeout(timeout)
        callbacks.onError(`WebSocket error connecting to ${path}`)
        reject(new Error(`WebSocket error connecting to ${path}`))
      }

      socket.onclose = () => {
        clearTimeout(timeout)
        if (connected) {
          connected = false
          portPath = null
          callbacks.onDisconnect()
        }
      }
    })
  }

  function handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "data":
        callbacks.onData(msg.text as string)
        break
      case "telemetry":
        callbacks.onTelemetry?.(msg.frame as TelemetryFrame)
        break
      case "connected":
        connected = true
        callbacks.onConnect()
        break
      case "disconnected":
        connected = false
        portPath = null
        callbacks.onDisconnect()
        break
      case "reconnecting":
        connected = false
        callbacks.onReconnecting?.()
        break
      case "error":
        callbacks.onError(msg.error as string ?? "unknown board error")
        break
    }
  }

  async function disconnect(): Promise<void> {
    connected = false
    portPath = null
    ws?.close()
    ws = null
    callbacks.onDisconnect()
  }

  function write(data: string): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  return {
    isConnected: () => connected,
    connect,
    disconnect,
    write,
    getPortPath: () => portPath,
  }
}
