// ── React bindings for PinStateStore ───────────────────────────────────────
//
// The PinStateStore is the single source of truth for all 20 Arduino pins.
// React components subscribe via these hooks, which use `useSyncExternalStore`
// for concurrent-mode safety and reference-equality change detection.
//
// Two variants:
//   usePinStates()    — returns the full 20-pin snapshot, re-renders on any change
//   usePinState(n)    — returns one pin, re-renders only when that pin changes
//
// Prefer `usePinState(n)` in renderers that only care about one pin so you get
// fine-grained reactivity. Use `usePinStates()` in the circuit solver and
// inspector panels that need the whole array.

import { useSyncExternalStore, useCallback, useMemo } from "react"
import {
  pinStateStore,
  type PinStateStore,
  type PinSnapshot,
  type PinStateSnapshot,
} from "./pin-state-store"
import type { PinState } from "@dreamer/schemas"

/** Adapt a store PinSnapshot to the board-schema PinState shape that renderers expect. */
function toPinState(snap: PinSnapshot): PinState {
  return {
    pin: snap.pin,
    mode: snap.mode,
    digitalValue: snap.digitalValue,
    analogValue: snap.analogValue,
    pwmValue: snap.pwmValue,
    isPwm: snap.isPwm,
    pwmFrequency: snap.pwmFrequency,
    interruptMode: "NONE", // interrupt state lives in the store; not surfaced to React
  }
}

// ── Cached adapters ─────────────────────────────────────────────────
//
// The store hands out immutable PinSnapshot arrays, replacing the array on
// every change. We cache the transformed `PinState[]` keyed on the raw snapshot
// reference so useSyncExternalStore's reference-equality check bails out when
// nothing has changed.

const fullArrayCache = new WeakMap<PinStateSnapshot, PinState[]>()

function getFullSnapshot(store: PinStateStore): PinState[] {
  const raw = store.getSnapshot()
  let cached = fullArrayCache.get(raw)
  if (!cached) {
    cached = raw.map(toPinState)
    fullArrayCache.set(raw, cached)
  }
  return cached
}

// Per-pin cache: maps a raw pin snapshot to its transformed PinState.
// Because the store replaces individual PinSnapshot objects only when that
// pin actually changes, a single WeakMap entry is sufficient per pin lineage.
const singlePinCache = new WeakMap<PinSnapshot, PinState>()

function getSinglePinSnapshot(store: PinStateStore, pin: number): PinState | null {
  const raw = store.getPin(pin)
  if (!raw) return null
  let cached = singlePinCache.get(raw)
  if (!cached) {
    cached = toPinState(raw)
    singlePinCache.set(raw, cached)
  }
  return cached
}

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Subscribe to the full 20-pin state array.
 * Returns a board-schema `PinState[]` for compatibility with existing renderer props.
 */
export function usePinStates(store: PinStateStore = pinStateStore): PinState[] {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  )
  const getSnapshot = useCallback(() => getFullSnapshot(store), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Subscribe to a single pin. The component re-renders only when THAT pin changes.
 * Much more efficient for renderers that only care about one pin (e.g. LED anode).
 */
export function usePinState(
  pin: number,
  store: PinStateStore = pinStateStore,
): PinState | null {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  )
  const getSnapshot = useCallback(
    () => getSinglePinSnapshot(store, pin),
    [store, pin],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Subscribe and get a typed accessor for writing external values back to the store.
 * Used by UI components like the ButtonInspector.
 */
export function usePinStore(store: PinStateStore = pinStateStore): PinStateStore {
  return useMemo(() => store, [store])
}
