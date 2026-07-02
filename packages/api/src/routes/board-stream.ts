// ── Board Stream Route ────────────────────────────────────────────────────
//
// WS  /api/project/:id/board-stream
//
// Pushes the current board state to open browser tabs whenever a project's
// file changes out-of-band — e.g. when the `dreamer mcp` server (a separate
// process driven by Claude) writes board ops to disk. This is the live bridge
// that lets a user *watch* the canvas update as Claude builds the circuit,
// instead of having to reload.
//
// How it works:
//   - On WS open we register the connection under its projectId and (if not
//     already running) start a per-project poller.
//   - The poller re-reads the project file every POLL_MS and broadcasts
//     `{ type:"board", version, boardState }` only when `project.version`
//     increased since the last broadcast. The browser's own autosave does NOT
//     bump `project.version` (only applyBoardOps does), so it never triggers a
//     broadcast — no feedback loop.
//   - A freshly-connected tab also receives the current snapshot immediately,
//     so it catches any edit that landed between load and subscribe; the
//     client ignores it when the version is one it already has.
//   - When the last subscriber for a project disconnects, its poller stops.
//
// Disabled in hosted mode (multi-user) — this is a local/desktop
// feature only.

import { Elysia } from "elysia"
import { createLogger } from "../logger"
import { readBoardStateForWatch } from "../db/adapters/file/project-repo"
import { IS_HOSTED } from "../env"

const log = createLogger("board-stream")

const POLL_MS = 500

type Subscriber = { id: string; send: (data: string) => void }

const subscribers = new Map<string, Set<Subscriber>>()
const pollers = new Map<string, ReturnType<typeof setInterval>>()
const lastBroadcastVersion = new Map<string, number>()

function broadcast(projectId: string, payload: unknown): void {
  const subs = subscribers.get(projectId)
  if (!subs || subs.size === 0) return
  const data = JSON.stringify(payload)
  for (const sub of subs) {
    try {
      sub.send(data)
    } catch {
      /* socket closed between iterations — close() will reap it */
    }
  }
}

async function poll(projectId: string): Promise<void> {
  try {
    const snap = await readBoardStateForWatch(projectId)
    if (!snap) return
    const seen = lastBroadcastVersion.get(projectId)
    if (seen !== undefined && snap.version <= seen) return
    lastBroadcastVersion.set(projectId, snap.version)
    broadcast(projectId, {
      type: "board",
      version: snap.version,
      boardState: snap.boardState,
    })
  } catch (err) {
    log.warn(
      `poll failed for ${projectId}: ${err instanceof Error ? err.message : err}`
    )
  }
}

function ensurePoller(projectId: string): void {
  if (pollers.has(projectId)) return
  // Baseline the version immediately so the first real change is broadcast.
  void poll(projectId)
  const handle = setInterval(() => void poll(projectId), POLL_MS)
  pollers.set(projectId, handle)
}

function stopPoller(projectId: string): void {
  const handle = pollers.get(projectId)
  if (handle) clearInterval(handle)
  pollers.delete(projectId)
  lastBroadcastVersion.delete(projectId)
}

export const boardStreamRoutes = new Elysia().ws("/api/project/:id/board-stream", {
  open(ws) {
    if (IS_HOSTED) {
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Live board sync is only available in local mode.",
          })
        )
        ws.close()
      } catch {
        /* already closed */
      }
      return
    }

    const projectId = decodeURIComponent(ws.data.params.id)
    const sub: Subscriber = {
      id: ws.id,
      send: (data) => {
        try {
          ws.send(data)
        } catch {
          /* closed */
        }
      },
    }

    let set = subscribers.get(projectId)
    if (!set) {
      set = new Set()
      subscribers.set(projectId, set)
    }
    set.add(sub)
    log.info(`WS open — project: ${projectId}, id: ${ws.id}, subs: ${set.size}`)

    ensurePoller(projectId)

    // Catch-up: hand the just-connected tab the current snapshot. The client
    // ignores it when the version isn't newer than what it already holds.
    void readBoardStateForWatch(projectId).then((snap) => {
      if (snap) {
        sub.send(
          JSON.stringify({
            type: "board",
            version: snap.version,
            boardState: snap.boardState,
          })
        )
      }
    })
  },

  close(ws) {
    const projectId = decodeURIComponent(ws.data.params.id)
    const set = subscribers.get(projectId)
    if (!set) return
    for (const sub of set) {
      if (sub.id === ws.id) {
        set.delete(sub)
        break
      }
    }
    if (set.size === 0) {
      subscribers.delete(projectId)
      stopPoller(projectId)
    }
    log.info(`WS close — project: ${projectId}, id: ${ws.id}, subs: ${set.size}`)
  },
})
