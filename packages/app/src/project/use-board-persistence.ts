import { useCallback, useEffect, useRef } from "react"
import { useProject } from "./project-context"
import { useBoard, BoardContext } from "@/store/board-context"
import { useGraph, GraphContext } from "@/store/graph-context"
import { ApiError, saveProjectState } from "./api-client"
import { saveRef, editorContentRef, notifySaveFlash } from "./save-ref"
import { boardSlice } from "./board-slice"
import { toast } from "@/components/ui/toast"
import { API_ORIGIN } from "@dreamer/config"
import { isAnonymousPreview } from "@/auth/use-current-user"
import { BoardSession } from "./board-session"
import { physicalDocumentStore, usePhysicalDocument } from "@/physical-scene/document-store"

const SAVE_DEBOUNCE_MS = 2000
const HYDRATION_GRACE_MS = 3000

type PersistenceController = {
  save: () => void
  schedule: () => void
  version: number
  projectId: string
}

export function useBoardPersistence(): { saveNow: () => void } {
  const { projectId, projectFile, version, setVersion } = useProject()
  const { state: boardState } = useBoard()
  const { state: graphState } = useGraph()
  const physical = usePhysicalDocument()
  const boardActor = BoardContext.useActorRef()
  const graphActor = GraphContext.useActorRef()
  const controllerRef = useRef<PersistenceController | null>(null)

  // Hydrate once per project, preserving edits/history on version rerenders.
  useEffect(() => {
    physicalDocumentStore.open(projectId, projectFile.physicalScene)
  }, [projectId, projectFile.physicalScene])

  useEffect(() => {
    const session = new BoardSession()
    session.open(projectId)
    let disposed = false
    let saving = false
    let retryDelay = SAVE_DEBOUNCE_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    const readyAt = Date.now() + HYDRATION_GRACE_MS

    function prepare() {
      if (editorContentRef.current) {
        const code = editorContentRef.current()
        if (code !== boardActor.getSnapshot().context.sketchCode) {
          boardActor.send({ type: "UPDATE_SKETCH", code })
        }
      }
      const graph = graphActor.getSnapshot().context
      const document = physicalDocumentStore.getState()
      return session.prepareSave(
        boardSlice(boardActor.getSnapshot().context),
        { nodes: graph.nodes, edges: graph.edges },
        controller.version,
        document.projectId === projectId ? physicalDocumentStore.getPersistableScene() : undefined,
      )
    }

    function schedule(delay = SAVE_DEBOUNCE_MS) {
      if (disposed || isAnonymousPreview()) return
      clearTimeout(timer)
      timer = setTimeout(save, Math.max(delay, readyAt - Date.now()))
    }

    function save() {
      clearTimeout(timer)
      if (disposed || saving || isAnonymousPreview()) return
      // Build at execution time. Success drains newer edits made in flight.
      const plan = prepare()
      if (!plan) return
      saving = true
      void saveProjectState(plan.projectId, plan.payload, plan.expectedVersion)
        .then(result => {
          session.markSaved(plan)
          if (plan.payload.physicalScene !== undefined) {
            physicalDocumentStore.markSaved(plan.payload.physicalScene ?? null)
          }
          if (disposed) return
          controller.version = result.newVersion
          setVersion(result.newVersion)
          retryDelay = SAVE_DEBOUNCE_MS
          saving = false
          save()
        })
        .catch((error: unknown) => {
          session.markFailed(plan)
          if (disposed) return
          saving = false
          toast.error(error instanceof ApiError && error.status === 409
            ? "Project changed elsewhere. Reopen it before saving again."
            : "Failed to save project")
          // Retry transient failures even without another edit.
          if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429) {
            schedule(retryDelay)
            retryDelay = Math.min(retryDelay * 2, 30_000)
          }
        })
    }

    const controller: PersistenceController = { projectId, version, save, schedule }
    controllerRef.current = controller

    function beforeUnload(event: BeforeUnloadEvent) {
      if (isAnonymousPreview()) return
      const plan = prepare()
      if (!plan) return
      // Another write using the outstanding request's version would conflict.
      if (saving) {
        event.preventDefault()
        event.returnValue = ""
        return
      }
      try {
        const queued = navigator.sendBeacon(
          `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/state`,
          new Blob([JSON.stringify({ expectedVersion: plan.expectedVersion, ...plan.payload })], { type: "application/json" }),
        )
        // Beacon acceptance is not an acknowledgement; retain dirty state.
        if (!queued) { event.preventDefault(); event.returnValue = "" }
      } catch {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    schedule()
    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener("beforeunload", beforeUnload)
      if (controllerRef.current === controller) controllerRef.current = null
    }
    // Version rerenders must not dispose the queue or acknowledged hashes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, boardActor, graphActor, setVersion])

  useEffect(() => {
    const controller = controllerRef.current
    if (controller?.projectId === projectId) controller.version = Math.max(controller.version, version)
  }, [projectId, version])

  useEffect(() => {
    controllerRef.current?.schedule()
  }, [boardState.components, boardState.wires, boardState.sketchCode,
    boardState.customLibraries, boardState.boardTarget, boardState.environment,
    boardState.realismProfile, boardState.assembly, graphState.nodes, graphState.edges,
    physical.projectId, physical.revision, projectId])

  const saveNow = useCallback(() => {
    notifySaveFlash()
    controllerRef.current?.save()
  }, [])

  useEffect(() => {
    saveRef.current = saveNow
    return () => { if (saveRef.current === saveNow) saveRef.current = null }
  }, [saveNow])
  return { saveNow }
}
