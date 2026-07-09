// ── Physics activity signal ──────────────────────────────────────────────────
//
// The 3D canvas runs frameloop="demand" so an idle scene costs no GPU. A
// physics solver needs a continuous loop to integrate, so this store tracks
// whether physics is "awake": while awake the canvas switches to
// frameloop="always" and steps every frame; when the world settles (no awake
// bodies and no drag) the stepper flips it back to "demand". Waking is always
// explicit — a drag, a spawn, or an external state change pokes it awake — so
// the loop can never perpetuate itself once everything has come to rest.

import { useSyncExternalStore } from "react"

let active = false
let dragging = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function isPhysicsActive(): boolean {
  return active
}

/** Wake the solver: the canvas goes to frameloop="always" until it settles. */
export function wakePhysics(): void {
  if (active) return
  active = true
  notify()
}

/** Called by the stepper once the world has settled — never call directly from
 *  event code (use {@link wakePhysics} to wake). */
export function sleepPhysics(): void {
  if (!active) return
  active = false
  notify()
}

/** A drag keeps the solver awake regardless of whether bodies are asleep. */
export function setPhysicsDragging(next: boolean): void {
  dragging = next
  if (next) wakePhysics()
}

export function isPhysicsDragging(): boolean {
  return dragging
}

export function subscribePhysicsActive(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePhysicsActive(): boolean {
  return useSyncExternalStore(subscribePhysicsActive, isPhysicsActive, isPhysicsActive)
}
