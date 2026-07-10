// ── Component pin calibration ────────────────────────────────────────────────
//
// GLB part models are authored at arbitrary real sizes; scaling them by height
// alone (see glb-parts.tsx) leaves their pins landing between holes. This store
// fixes that the same way the breadboard grid calibration does: the user drags
// one anchor onto each pin of a type's model, and we record the pin positions in
// the model's *normalized frame* (the frame glb-parts renders in — upright,
// height-normalized, centred). At render, glb-parts fits those captured pins
// onto the instance's actual footprint holes (a 2D similarity: uniform scale +
// rotation + translation), so the model is sized and seated by its pins.
//
// The grid side needs no input — the app already knows each part's footprint
// holes. Calibration is per component *type* (all LEDs share one model), stored
// in localStorage, and "Copy JSON" bakes it into BAKED_PIN_CALIBRATION.

import { useSyncExternalStore } from "react"
import type { P2 } from "./similarity-2d"

/** Captured model-frame pin positions per component type, in footprint order. */
export type PinCalibrations = Record<string, P2[]>

/** Baked defaults — dialed in via the calibrator and pasted here with Copy JSON.
 *  Empty until the first type is calibrated. */
const BAKED_PIN_CALIBRATION: PinCalibrations = {}

const STORAGE_KEY = "dreamer:component-pin-calibration"

function isP2(v: unknown): v is P2 {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as P2).x === "number" &&
    typeof (v as P2).z === "number"
  )
}

function load(): PinCalibrations {
  const base = { ...BAKED_PIN_CALIBRATION }
  if (typeof localStorage === "undefined") return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: PinCalibrations = { ...base }
    for (const [type, pins] of Object.entries(parsed)) {
      if (Array.isArray(pins) && pins.every(isP2)) out[type] = pins.map((p) => ({ x: p.x, z: p.z }))
    }
    return out
  } catch {
    return base
  }
}

let state: PinCalibrations = load()
const listeners = new Set<() => void>()

function commit(next: PinCalibrations) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Non-fatal: calibration just won't persist across reloads.
  }
  for (const fn of listeners) fn()
}

export function getPinCalibrations(): PinCalibrations {
  return state
}

export function getPinCalibration(type: string): P2[] | undefined {
  return state[type]
}

/** Seed `count` anchors for a type if absent or the wrong length — spread along
 *  x so they're visible and draggable before the user places them. */
export function ensurePinAnchors(type: string, count: number): void {
  const existing = state[type]
  if (existing && existing.length === count) return
  const pins: P2[] = Array.from({ length: count }, (_, i) => ({
    x: (i - (count - 1) / 2) * 4,
    z: 0,
  }))
  commit({ ...state, [type]: pins })
}

export function setPinAnchor(type: string, index: number, xz: P2): void {
  const pins = state[type] ? [...state[type]] : []
  pins[index] = { x: xz.x, z: xz.z }
  commit({ ...state, [type]: pins })
}

export function getPinAnchor(type: string, index: number): P2 | undefined {
  return state[type]?.[index]
}

/** Nudge one pin anchor by a delta in the model's board plane (fine-tune). */
export function nudgePinAnchor(type: string, index: number, dx: number, dz: number): void {
  const cur = state[type]?.[index] ?? { x: 0, z: 0 }
  setPinAnchor(type, index, { x: cur.x + dx, z: cur.z + dz })
}

export function clearPinCalibration(type: string): void {
  const next = { ...state }
  delete next[type]
  commit(next)
}

export function resetPinCalibrations(): void {
  commit({ ...BAKED_PIN_CALIBRATION })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePinCalibrations(): PinCalibrations {
  return useSyncExternalStore(subscribe, getPinCalibrations, getPinCalibrations)
}

// ── Calibration mode + selected type ─────────────────────────────────────────

let mode: { on: boolean; type: string | null } = { on: false, type: null }
const modeListeners = new Set<() => void>()

export function getPinCalibrationMode(): { on: boolean; type: string | null } {
  return mode
}

export function setPinCalibrating(on: boolean, type?: string | null): void {
  const nextType = type !== undefined ? type : mode.type
  if (nextType !== mode.type) setSelectedPin(null)
  mode = { on, type: nextType }
  for (const fn of modeListeners) fn()
}

export function setPinCalibrationType(type: string | null): void {
  if (type !== mode.type) setSelectedPin(null)
  mode = { ...mode, type }
  for (const fn of modeListeners) fn()
}

function subscribeMode(fn: () => void): () => void {
  modeListeners.add(fn)
  return () => modeListeners.delete(fn)
}

export function usePinCalibrationMode(): { on: boolean; type: string | null } {
  return useSyncExternalStore(subscribeMode, getPinCalibrationMode, getPinCalibrationMode)
}

// ── Selected pin (for fine-tune) ─────────────────────────────────────────────

let selectedPin: number | null = null
const selPinListeners = new Set<() => void>()

export function getSelectedPin(): number | null {
  return selectedPin
}

export function setSelectedPin(index: number | null): void {
  if (selectedPin === index) return
  selectedPin = index
  for (const fn of selPinListeners) fn()
}

function subscribeSelPin(fn: () => void): () => void {
  selPinListeners.add(fn)
  return () => selPinListeners.delete(fn)
}

export function useSelectedPin(): number | null {
  return useSyncExternalStore(subscribeSelPin, getSelectedPin, getSelectedPin)
}
