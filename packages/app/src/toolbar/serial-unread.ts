// ── Serial output unread store ──────────────────────────────────────────
//
// Tracks whether serial output has arrived since the Serial Monitor was last
// surfaced. The toolbar shows a small dot on the Simulate mode button (where
// the Serial Monitor lives) so new output is noticeable from any mode, and
// clears it when you switch into a mode that shows the monitor.

import { useSyncExternalStore } from "react"

let hasUnread = false
const unreadListeners = new Set<() => void>()

function notifyUnread(): void {
  for (const fn of unreadListeners) fn()
}

export function markSerialUnread(): void {
  if (!hasUnread) {
    hasUnread = true
    notifyUnread()
  }
}

export function clearSerialUnread(): void {
  if (hasUnread) {
    hasUnread = false
    notifyUnread()
  }
}

export function useSerialUnread(): boolean {
  return useSyncExternalStore(
    (cb) => {
      unreadListeners.add(cb)
      return () => {
        unreadListeners.delete(cb)
      }
    },
    () => hasUnread,
  )
}
