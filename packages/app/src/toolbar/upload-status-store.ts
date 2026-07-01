// ── Upload Status Store ───────────────────────────────────────────────────
//
// Module-level store for the current Arduino flash/upload status. Mirrors the
// pattern in `use-board-connection.ts` so multiple toolbar components (the
// Upload button in `play-controls.tsx` and the consolidated `StatusDisplay`)
// can read and write the same state without prop drilling or a React context.

import { useSyncExternalStore } from "react"

type UploadStatus =
  | "idle"
  | "compiling"
  | "flashing"
  | "reconnecting"
  | "done"
  | "error"

export type UploadState = {
  status: UploadStatus
  error: string | null
}

let _state: UploadState = { status: "idle", error: null }
const _listeners = new Set<() => void>()

function emit() {
  for (const fn of _listeners) fn()
}

export function setUploadState(next: Partial<UploadState>): void {
  _state = { ..._state, ...next }
  emit()
}

export function getUploadState(): UploadState {
  return _state
}

export function useUploadState(): UploadState {
  return useSyncExternalStore(
    (cb) => {
      _listeners.add(cb)
      return () => {
        _listeners.delete(cb)
      }
    },
    () => _state,
    () => _state,
  )
}
