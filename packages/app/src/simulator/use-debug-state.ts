// ── useDebugState ───────────────────────────────────────────────────────────
//
// React binding for the debug-state store, mirroring `use-pin-state.ts`.
// Components re-render when breakpoints, status, or the halt snapshot change.

import { useCallback, useSyncExternalStore } from "react"
import {
  debugStateStore,
  DebugStateStore,
  type DebugStateSnapshot,
} from "./debug-state-store"

export function useDebugState(
  store: DebugStateStore = debugStateStore,
): DebugStateSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  )
  const getSnapshot = useCallback(() => store.getSnapshot(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
