// ── Button Press Store ────────────────────────────────────────────────────
//
// Tracks which buttons are currently physically pressed by the user.
// Compatible with useSyncExternalStore for tear-free React rendering.

import { useSyncExternalStore } from "react"

type Listener = () => void

let pressedButtons = new Set<string>()
const listeners = new Set<Listener>()

function getSnapshot(): ReadonlySet<string> {
  return pressedButtons
}

function notifyListeners() {
  listeners.forEach((l) => l())
}

export const buttonPressStore = {
  press(componentId: string): void {
    pressedButtons = new Set(pressedButtons)
    pressedButtons.add(componentId)
    notifyListeners()
  },
  release(componentId: string): void {
    pressedButtons = new Set(pressedButtons)
    pressedButtons.delete(componentId)
    notifyListeners()
  },
  isPressed(componentId: string): boolean {
    return pressedButtons.has(componentId)
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot,
}

/** React hook — re-renders the calling component synchronously on press/release. */
export function useButtonPressed(componentId: string): boolean {
  const pressed = useSyncExternalStore(
    buttonPressStore.subscribe,
    () => buttonPressStore.getSnapshot().has(componentId),
  )
  return pressed
}
