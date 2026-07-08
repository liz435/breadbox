// ── Physics feature flag ─────────────────────────────────────────────────────
//
// Rapier physics is an opt-in, interactive layer over the 3D scene. It is OFF
// by default so the deterministic grid-driven scene (headless verify, export,
// the exact positions the 2D canvas agrees with) is completely unaffected —
// flag off means not a single RigidBody is created. The flag is a small
// subscribable store so a menu toggle flips physics live without a reload; the
// initial value is read once from localStorage.

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "dreamer:physics"

function readInitial(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

let enabled = readInitial()
const listeners = new Set<() => void>()

export function isPhysicsEnabled(): boolean {
  return enabled
}

export function setPhysicsEnabled(next: boolean): void {
  if (next === enabled) return
  enabled = next
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next ? "1" : "0")
  } catch {
    // Non-browser / storage-denied: keep the in-memory value.
  }
  for (const listener of listeners) listener()
}

export function subscribePhysicsEnabled(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePhysicsEnabled(): boolean {
  return useSyncExternalStore(subscribePhysicsEnabled, isPhysicsEnabled, isPhysicsEnabled)
}
