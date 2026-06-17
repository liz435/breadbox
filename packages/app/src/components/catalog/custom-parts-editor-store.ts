// ── Custom Parts editor state ───────────────────────────────────────────────
//
// Drives the inline custom-part editor that lives *inside* the component panel
// (project-panel) — not a separate dockview tab. The palette opens it (New /
// Edit), the panel renders it reactively, and a Back button closes it.

import { useSyncExternalStore } from "react"

export type CustomPartEditTarget =
  | { kind: "new"; format: "code" | "dsl" }
  | { kind: "edit"; id: string }
export type CustomPartEditorState = { open: boolean; target: CustomPartEditTarget | null }

let state: CustomPartEditorState = { open: false, target: null }
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** Open the inline editor on a target (a new part, or an existing one to edit). */
export function openCustomPartEditor(target: CustomPartEditTarget): void {
  state = { open: true, target }
  emit()
}

/** Close the inline editor (return the component panel to the palette). */
export function closeCustomPartEditor(): void {
  if (!state.open) return
  state = { open: false, target: null }
  emit()
}

function getState(): CustomPartEditorState {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCustomPartEditor(): CustomPartEditorState {
  return useSyncExternalStore(subscribe, getState, getState)
}
