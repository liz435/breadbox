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
import { IS_HOSTED } from "../env"

const log = createLogger("boards")

// Cached across the process lifetime: once arduino-cli is resolved (or
// definitively absent) the answer doesn't change without a restart, so
// every poll needn't re-probe the toolchain.
let cliAvailableCache: boolean | null = null
async function checkCliAvailable(): Promise<boolean> {
  if (cliAvailableCache !== null) return cliAvailableCache
  try {
    await resolveArduinoCli({ install: false })
    cliAvailableCache = true
  } catch {
    cliAvailableCache = false
  }
  return cliAvailableCache
}

export const boardRoutes = new Elysia()

  // ── List available ports ──────────────────────────────────────────────
  .get("/api/boards", async () => {
    // Hosted replicas have no USB. Returning empty synchronously avoids
    // spawning arduino-cli on every client poll — each spawn loads the
    // full toolchain (~40 OS threads) and exhausts the pids cgroup under
    // the 3s-per-tab poll cadence. See crashrailwaydreamer.json.
    if (IS_HOSTED) {
      return { ports: [], cliAvailable: false }
    }
    const [ports, cliAvailable] = await Promise.all([
      getAvailablePorts().catch(() => []),
      checkCliAvailable(),
    ])
    return { ports, cliAvailable }
  })

  // ── WebSocket stream ──────────────────────────────────────────────────
  .ws("/api/boards/:path", {
    open(ws) {
      if (IS_HOSTED) {
        try {
          ws.send(JSON.stringify({
            type: "error",
            error: "Serial ports are unavailable in hosted mode. Run the Dreamer CLI locally to connect a board.",
          }))
          ws.close()
        } catch { /* already closed */ }
        return
      }
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
