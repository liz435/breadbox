// ── "3D tab is front" store ──────────────────────────────────────────────────
//
// Tracks whether the 3D Breadboard panel is the visible tab of its Dockview
// group. The Components sidebar swaps its content on this flag (3D scene
// actions instead of the 2D placement palette), so it lives as a small
// subscribable store fed from app.tsx — consumers must not need the Dockview
// API themselves (it is held in a non-reactive ref).

import { useEffect, useSyncExternalStore } from "react"
import type { DockviewApi } from "dockview-react"

const PANEL_ID = "breadboard3d"

let active = false
const listeners = new Set<() => void>()

function setActive(next: boolean): void {
  if (next === active) return
  active = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getActive(): boolean {
  return active
}

export function useBreadboard3dTabActive(): boolean {
  return useSyncExternalStore(subscribe, getActive, getActive)
}

/**
 * Feed the store from the Dockview API: true while the 3D panel is its
 * group's front tab. `isVisible` (front-of-group) rather than `activePanel`
 * (globally focused) — clicking into the sidebar or serial monitor must not
 * flip the Components tab back to the 2D palette while the 3D view stays
 * on screen.
 */
export function useBreadboard3dTabSync(api: DockviewApi | null): void {
  useEffect(() => {
    if (!api) return
    const sync = () => {
      setActive(api.getPanel(PANEL_ID)?.api.isVisible ?? false)
    }
    sync()
    const disposables = [
      // Layout changes cover tab switches, panel add/remove, and drags;
      // active-panel changes catch focus-only transitions between groups.
      api.onDidLayoutChange(sync),
      api.onDidActivePanelChange(sync),
    ]
    return () => {
      for (const disposable of disposables) disposable.dispose()
      setActive(false)
    }
  }, [api])
}
