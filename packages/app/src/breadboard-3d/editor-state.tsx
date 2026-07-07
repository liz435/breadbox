// ── 3D editor UI state ──────────────────────────────────────────────────────
//
// Selection + gizmo mode shared between the DOM overlay (assembly panel,
// toolbar) and the scene (gizmo, click handlers). Plain React context — r3f's
// Canvas bridges parent contexts into the 3D tree, so both sides see it.

import { createContext, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"

export type GizmoMode = "translate" | "rotate" | "scale"

type EditorState = {
  selectedBodyId: string | null
  select: (id: string | null) => void
  mode: GizmoMode
  setMode: (mode: GizmoMode) => void
}

const EditorContext = createContext<EditorState | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [selectedBodyId, select] = useState<string | null>(null)
  const [mode, setMode] = useState<GizmoMode>("translate")
  const value = useMemo(
    () => ({ selectedBodyId, select, mode, setMode }),
    [selectedBodyId, mode],
  )
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

export function useEditor(): EditorState {
  const ctx = useContext(EditorContext)
  if (ctx === null) throw new Error("useEditor must be used within <EditorProvider>")
  return ctx
}
