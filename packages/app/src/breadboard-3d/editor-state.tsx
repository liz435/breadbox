// ── 3D editor UI state ──────────────────────────────────────────────────────
//
// Selection + gizmo mode shared between the scene (gizmo, click handlers) and
// DOM UI. A module-level store rather than React context because the scene
// manager now lives in the Components sidebar — a separate dockview panel that
// a context provider mounted inside the 3D view could never reach.

import { useSyncExternalStore } from "react"

export type GizmoMode = "translate" | "rotate" | "scale"

type EditorState = {
  selectedBodyId: string | null
  select: (id: string | null) => void
  mode: GizmoMode
  setMode: (mode: GizmoMode) => void
}

const listeners = new Set<() => void>()

// Snapshot object rebuilt on every change so useSyncExternalStore sees a new
// reference; `select`/`setMode` are stable module functions (hoisted).
let state: EditorState = {
  selectedBodyId: null,
  select,
  mode: "translate",
  setMode,
}

function emit(): void {
  for (const listener of listeners) listener()
}

function select(id: string | null): void {
  if (id === state.selectedBodyId) return
  state = { ...state, selectedBodyId: id }
  emit()
}

function setMode(mode: GizmoMode): void {
  if (mode === state.mode) return
  state = { ...state, mode }
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getState(): EditorState {
  return state
}

export function useEditor(): EditorState {
  return useSyncExternalStore(subscribe, getState, getState)
}
