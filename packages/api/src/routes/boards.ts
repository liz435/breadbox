// ── Board Routes ──────────────────────────────────────────────────────────
//
// GET  /api/boards              List available serial ports
// WS   /api/boards/:path        Stream data to/from a port (path is URL-encoded)

import { Elysia } from "elysia"
import { createLogger } from "../logger"
import {
  getAvailablePorts,
  subscribe,
  unsubscribe,
  write,
} from "../serial/board-manager"
import { resolveArduinoCli } from "../toolchain"

const log = createLogger("boards")

async function checkCliAvailable(): Promise<boolean> {
  try {
    await resolveArduinoCli({ install: false })
    return true
  } catch {
    return false
  }
}

export const boardRoutes = new Elysia()

  // ── List available ports ──────────────────────────────────────────────
  .get("/api/boards", async () => {
    const [ports, cliAvailable] = await Promise.all([
      getAvailablePorts().catch(() => []),
      checkCliAvailable(),
    ])
    return { ports, cliAvailable }
  })

  // ── WebSocket stream ──────────────────────────────────────────────────
  .ws("/api/boards/:path", {
    open(ws) {
      const portPath = decodeURIComponent(ws.data.params.path)
      const baudRate = Number(new URL(`ws://x${ws.data.request.url}`).searchParams.get("baud") ?? "9600")

      log.info(`WS open — port: ${portPath}, baud: ${baudRate}, id: ${ws.id}`)

      subscribe(portPath, baudRate, {
        id: ws.id,
        send: (data) => {
          try { ws.send(data) } catch { /* closed */ }
        },
      }).catch((err) => {
        log.error(`failed to open port ${portPath}`, err)
        try {
          ws.send(JSON.stringify({
            type: "error",
            error: `Cannot open ${portPath}: ${err instanceof Error ? err.message : err}`,
          }))
        } catch { /* already closed */ }
      })
    },

    message(ws, msg) {
      const portPath = decodeURIComponent(ws.data.params.path)
      if (typeof msg === "string") {
        write(portPath, msg)
      }
    },

    close(ws) {
      const portPath = decodeURIComponent(ws.data.params.path)
      log.info(`WS close — port: ${portPath}, id: ${ws.id}`)
      unsubscribe(portPath, ws.id)
    },
  })
