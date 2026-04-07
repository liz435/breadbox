import { useCallback, useEffect, useRef } from "react"
import { useProject } from "./project-context"
import { useBoard } from "@/store/board-context"
import { saveBoardState, saveProjectGraph } from "./api-client"
import { BoardContext } from "@/store/board-context"
import { GraphContext } from "@/store/graph-context"
import { saveRef, editorContentRef, notifySaveFlash } from "./save-ref"

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

  const boardActor = BoardContext.useActorRef()
  const graphActor = GraphContext.useActorRef()

  // Auto-save: debounced, skips the first 3 seconds to let LOAD_BOARD settle
  useEffect(() => {
    // Don't auto-save during the hydration grace period
    if (Date.now() - mountTimeRef.current < HYDRATION_GRACE_MS) return

    const persistable = {
      components: state.components,
      wires: state.wires,
      sketchCode: state.sketchCode,
    }
    const snapshot = JSON.stringify(persistable)

    if (snapshot === lastSavedRef.current) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lastSavedRef.current = snapshot
      saveBoardState(projectId, persistable).catch(() => {})
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [state.components, state.wires, state.sketchCode, projectId])

  /** Immediately save board + graph state. Flushes editor content first. */
  const saveNow = useCallback(() => {
    clearTimeout(debounceRef.current)

    // Flush CodeMirror editor content to board state if mounted
    if (editorContentRef.current) {
      const liveCode = editorContentRef.current()
      boardActor.send({ type: "UPDATE_SKETCH", code: liveCode })
    }

    const boardSnap = boardActor.getSnapshot().context
    const graphSnap = graphActor.getSnapshot().context

    const persistable = {
      components: boardSnap.components,
      wires: boardSnap.wires,
      sketchCode: boardSnap.sketchCode,
    }
    lastSavedRef.current = JSON.stringify(persistable)
    notifySaveFlash()
    saveBoardState(projectIdRef.current, persistable).catch(() => {})
    saveProjectGraph(projectIdRef.current, {
      nodes: graphSnap.nodes,
      edges: graphSnap.edges,
    }).catch(() => {})
  }, [boardActor, graphActor])

  saveRef.current = saveNow

  return { saveNow }
}
