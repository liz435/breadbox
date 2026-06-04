// ── useLiveBoardSync ─────────────────────────────────────────────────────
//
// Live bridge: subscribes to the API's per-project board-stream WebSocket and
// applies out-of-band board changes (e.g. edits made by the `dreamer mcp`
// server while the user chats with Claude) to the canvas in real time.
//
// The server only broadcasts when `project.version` increases, and we guard
// again on the client: a broadcast whose version isn't newer than what we
// already hold is ignored. The browser's own autosave doesn't bump the
// version, so there is no feedback loop with our own writes.
//
// Mount once, inside the Board + Project providers (see app.tsx → AppInner).

import { useEffect, useRef } from "react"
import { API_ORIGIN } from "@dreamer/config"
import type { BoardState } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { useProject } from "@/project/project-context"

const WS_BASE = API_ORIGIN.replace(/^http/, "ws")
const RECONNECT_MS = 1_500

type BoardStreamMessage =
  | { type: "board"; version: number; boardState: BoardState }
  | { type: "error"; error: string }

export function useLiveBoardSync(): void {
  const { send } = useBoard()
  const { projectId, version, setVersion } = useProject()

  // Keep the latest values in refs so the effect only re-subscribes when the
  // projectId changes — not on every version bump or render.
  const sendRef = useRef(send)
  sendRef.current = send
  const versionRef = useRef(version)
  versionRef.current = version
  const setVersionRef = useRef(setVersion)
  setVersionRef.current = setVersion

  useEffect(() => {
    if (!projectId) return

    let closed = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      const url = `${WS_BASE}/api/project/${encodeURIComponent(projectId)}/board-stream`
      const ws = new WebSocket(url)
      socket = ws

      ws.onmessage = (event) => {
        let msg: BoardStreamMessage
        try {
          msg = JSON.parse(event.data as string) as BoardStreamMessage
        } catch {
          return
        }
        if (msg.type !== "board") return
        if (msg.version <= versionRef.current) return
        sendRef.current({ type: "LOAD_BOARD", state: msg.boardState })
        setVersionRef.current(msg.version)
      }

      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          /* noop */
        }
      }

      ws.onclose = () => {
        if (closed) return
        reconnectTimer = setTimeout(connect, RECONNECT_MS)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
      socket = null
    }
  }, [projectId])
}
