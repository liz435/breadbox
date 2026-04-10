import { useCallback, useEffect, useRef } from "react"
import { useProject } from "./project-context"
import { useBoard } from "@/store/board-context"
import { saveBoardState, saveProjectGraph } from "./api-client"
import { BoardContext } from "@/store/board-context"
import { GraphContext } from "@/store/graph-context"
import { saveRef, editorContentRef, notifySaveFlash } from "./save-ref"
import { toast } from "@/components/ui/toast"
import { API_ORIGIN } from "@dreamer/config"

const SAVE_DEBOUNCE_MS = 2000
const HYDRATION_GRACE_MS = 3000

export function useBoardPersistence(): { saveNow: () => void } {
  const { projectId } = useProject()
  const { state } = useBoard()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastSavedRef = useRef<string>("")
  const mountTimeRef = useRef(Date.now())
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId
  const savingRef = useRef(false)

  const boardActor = BoardContext.useActorRef()
  const graphActor = GraphContext.useActorRef()

  /** Build persistable payload from live actor state */
  const buildPayload = useCallback(() => {
    if (editorContentRef.current) {
      boardActor.send({ type: "UPDATE_SKETCH", code: editorContentRef.current() })
    }
    const bs = boardActor.getSnapshot().context
    const gs = graphActor.getSnapshot().context
    return {
      board: {
        components: bs.components,
        wires: bs.wires,
        sketchCode: bs.sketchCode,
        customLibraries: bs.customLibraries,
      },
      graph: { nodes: gs.nodes, edges: gs.edges },
    }
  }, [boardActor, graphActor])

  /** Save immediately — Cmd+S and beforeunload */
  const saveNow = useCallback(() => {
    clearTimeout(debounceRef.current)

    // Always flash to confirm Cmd+S was received, even if nothing changed
    notifySaveFlash()

    if (savingRef.current) return

    const { board, graph } = buildPayload()
    const snapshot = JSON.stringify(board)
    if (snapshot === lastSavedRef.current) return
    lastSavedRef.current = snapshot

    savingRef.current = true
    Promise.all([
      saveBoardState(projectIdRef.current, board),
      saveProjectGraph(projectIdRef.current, graph),
    ])
      .catch(() => toast.error("Failed to save project"))
      .finally(() => { savingRef.current = false })
  }, [buildPayload])

  // Debounced auto-save
  useEffect(() => {
    if (Date.now() - mountTimeRef.current < HYDRATION_GRACE_MS) return

    const persistable = {
      components: state.components,
      wires: state.wires,
      sketchCode: state.sketchCode,
      customLibraries: state.customLibraries,
    }
    const snapshot = JSON.stringify(persistable)
    if (snapshot === lastSavedRef.current) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (savingRef.current) return
      lastSavedRef.current = snapshot
      savingRef.current = true
      saveBoardState(projectIdRef.current, persistable)
        .catch(() => toast.error("Failed to auto-save project"))
        .finally(() => { savingRef.current = false })
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [state.components, state.wires, state.sketchCode, state.customLibraries, projectId])

  // Flush pending save on tab close / navigation via sendBeacon
  useEffect(() => {
    function handleBeforeUnload() {
      const { board, graph } = buildPayload()
      const snapshot = JSON.stringify(board)
      if (snapshot === lastSavedRef.current) return
      const pid = projectIdRef.current
      try {
        navigator.sendBeacon(
          `${API_ORIGIN}/project/${encodeURIComponent(pid)}/board`,
          new Blob([JSON.stringify(board)], { type: "application/json" }),
        )
        navigator.sendBeacon(
          `${API_ORIGIN}/project/${encodeURIComponent(pid)}/graph`,
          new Blob([JSON.stringify(graph)], { type: "application/json" }),
        )
      } catch { /* best effort */ }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [buildPayload])

  saveRef.current = saveNow
  return { saveNow }
}
