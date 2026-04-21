import { useCallback, useEffect, useRef } from "react"
import { useProject } from "./project-context"
import { useBoard } from "@/store/board-context"
import { useGraph } from "@/store/graph-context"
import { saveProjectState } from "./api-client"
import { BoardContext } from "@/store/board-context"
import { GraphContext } from "@/store/graph-context"
import { saveRef, editorContentRef, notifySaveFlash } from "./save-ref"
import { toast } from "@/components/ui/toast"
import { API_ORIGIN } from "@dreamer/config"
import { isAnonymousPreview } from "@/auth/use-current-user"
import type {
  BoardComponent,
  Wire,
  CustomLibrary,
  BoardTarget,
  GraphNode,
  Edge,
} from "@dreamer/schemas"

const SAVE_DEBOUNCE_MS = 2000
const HYDRATION_GRACE_MS = 3000

type BoardPersistable = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  sketchCode: string
  customLibraries: Record<string, CustomLibrary>
  boardTarget?: BoardTarget
}

type GraphPersistable = {
  nodes: Record<string, GraphNode>
  edges: Record<string, Edge>
}

// Helper: extract just the persistable subset of board context.
// Centralizing this prevents the dirty-check and the save payload from
// drifting apart — both must read from the same shape.
function boardSlice(ctx: BoardPersistable): BoardPersistable {
  return {
    components: ctx.components,
    wires: ctx.wires,
    sketchCode: ctx.sketchCode,
    customLibraries: ctx.customLibraries,
    boardTarget: ctx.boardTarget,
  }
}

function graphSlice(ctx: GraphPersistable): GraphPersistable {
  return { nodes: ctx.nodes, edges: ctx.edges }
}

export function useBoardPersistence(): { saveNow: () => void } {
  const { projectId } = useProject()
  const { state: boardState } = useBoard()
  const { state: graphState } = useGraph()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Independent dirty hashes per half — graph-only edits must NOT be skipped
  // just because the board hash is unchanged, and vice versa.
  const lastSavedBoardRef = useRef<string>("")
  const lastSavedGraphRef = useRef<string>("")
  const mountTimeRef = useRef(Date.now())
  const projectIdRef = useRef(projectId)
  const savingRef = useRef(false)

  const boardActor = BoardContext.useActorRef()
  const graphActor = GraphContext.useActorRef()

  // Reset dirty-tracking when the project changes so an unrelated save can't
  // be elided after switchProject(). Also re-arms the hydration grace window
  // so the new project's first hydration tick isn't autosaved as a "change".
  useEffect(() => {
    projectIdRef.current = projectId
    lastSavedBoardRef.current = ""
    lastSavedGraphRef.current = ""
    mountTimeRef.current = Date.now()
  }, [projectId])

  /** Build current persistable payload from live actor state. */
  const buildPayload = useCallback((): {
    board: BoardPersistable
    graph: GraphPersistable
  } => {
    if (editorContentRef.current) {
      boardActor.send({ type: "UPDATE_SKETCH", code: editorContentRef.current() })
    }
    return {
      board: boardSlice(boardActor.getSnapshot().context),
      graph: graphSlice(graphActor.getSnapshot().context),
    }
  }, [boardActor, graphActor])

  /** Save immediately — Cmd+S and beforeunload (via saveNow). */
  const saveNow = useCallback(() => {
    clearTimeout(debounceRef.current)
    // Always flash to confirm Cmd+S was received, even if nothing changed.
    notifySaveFlash()

    // Anonymous preview: nothing to persist, don't fire a request whose
    // only purpose would be to 401 and surface a "Failed to save" toast.
    if (isAnonymousPreview()) return

    if (savingRef.current) return

    const { board, graph } = buildPayload()
    const boardHash = JSON.stringify(board)
    const graphHash = JSON.stringify(graph)

    const boardDirty = boardHash !== lastSavedBoardRef.current
    const graphDirty = graphHash !== lastSavedGraphRef.current
    if (!boardDirty && !graphDirty) return

    // Optimistically mark clean BEFORE the request lands so a fast follow-up
    // edit during the in-flight save still wins on the next dirty check.
    if (boardDirty) lastSavedBoardRef.current = boardHash
    if (graphDirty) lastSavedGraphRef.current = graphHash

    savingRef.current = true
    saveProjectState(projectIdRef.current, {
      ...(boardDirty ? { boardState: board } : {}),
      ...(graphDirty ? { graph } : {}),
    })
      .catch(() => {
        toast.error("Failed to save project")
        // Roll back so the next save retries the dirty halves.
        if (boardDirty) lastSavedBoardRef.current = ""
        if (graphDirty) lastSavedGraphRef.current = ""
      })
      .finally(() => {
        savingRef.current = false
      })
  }, [buildPayload])

  // Debounced auto-save — re-runs on board OR graph change.
  useEffect(() => {
    if (isAnonymousPreview()) return
    if (Date.now() - mountTimeRef.current < HYDRATION_GRACE_MS) return

    const board = boardSlice(boardState)
    const graph = graphSlice(graphState)
    const boardHash = JSON.stringify(board)
    const graphHash = JSON.stringify(graph)

    const boardDirty = boardHash !== lastSavedBoardRef.current
    const graphDirty = graphHash !== lastSavedGraphRef.current
    if (!boardDirty && !graphDirty) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (savingRef.current) return
      if (boardDirty) lastSavedBoardRef.current = boardHash
      if (graphDirty) lastSavedGraphRef.current = graphHash
      savingRef.current = true
      saveProjectState(projectIdRef.current, {
        ...(boardDirty ? { boardState: board } : {}),
        ...(graphDirty ? { graph } : {}),
      })
        .catch(() => {
          toast.error("Failed to auto-save project")
          if (boardDirty) lastSavedBoardRef.current = ""
          if (graphDirty) lastSavedGraphRef.current = ""
        })
        .finally(() => {
          savingRef.current = false
        })
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [
    boardState.components,
    boardState.wires,
    boardState.sketchCode,
    boardState.customLibraries,
    boardState.boardTarget,
    graphState.nodes,
    graphState.edges,
    projectId,
  ])

  // Flush on tab close / navigation via sendBeacon. sendBeacon doesn't
  // support custom routes well in all browsers but the unified /state
  // endpoint accepts the same JSON shape, so one beacon covers both halves.
  useEffect(() => {
    function handleBeforeUnload() {
      // Preview-mode visitors have nothing to persist; a beacon would just
      // 401 silently at the server and waste a cross-tab request.
      if (isAnonymousPreview()) return
      const { board, graph } = buildPayload()
      const boardHash = JSON.stringify(board)
      const graphHash = JSON.stringify(graph)
      const boardDirty = boardHash !== lastSavedBoardRef.current
      const graphDirty = graphHash !== lastSavedGraphRef.current
      if (!boardDirty && !graphDirty) return

      const pid = projectIdRef.current
      const payload: Record<string, unknown> = {}
      if (boardDirty) payload.boardState = board
      if (graphDirty) payload.graph = graph
      try {
        navigator.sendBeacon(
          `${API_ORIGIN}/project/${encodeURIComponent(pid)}/state`,
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        )
      } catch {
        /* best effort */
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [buildPayload])

  saveRef.current = saveNow
  return { saveNow }
}
