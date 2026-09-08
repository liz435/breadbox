// ── Pending 3D model import ──────────────────────────────────────────────────
//
// Holds the model file (.glb/.gltf/.stl) waiting to be imported into the 3D
// scene. A store rather than view-local state so the Components sidebar's 3D
// actions panel can start an import even though the ImportModelDialog (which
// parses files with three's loaders) is owned by the lazily-loaded 3D view.

import { useSyncExternalStore } from "react"

let pending: File | null = null
const listeners = new Set<() => void>()

export function setPendingModelFile(file: File | null): void {
  if (file === pending) return
  pending = file
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getPendingModelFile(): File | null {
  return pending
}

export function usePendingModelFile(): File | null {
  return useSyncExternalStore(subscribe, getPendingModelFile, getPendingModelFile)
}
