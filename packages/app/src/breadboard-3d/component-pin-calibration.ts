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

/** Per-type calibration: captured pin positions (normalized frame, footprint
 *  order) plus an optional pin-gap override — the number of holes between
 *  consecutive pins. No gaps → the fit targets the footprint's own spacing. */
export type PinCalibration = { pins: P2[]; gaps?: number[] }
export type PinCalibrations = Record<string, PinCalibration>

/** Baked defaults — dialed in via the calibrator and pasted here with Copy JSON.
 *  A user's own localStorage entries (see load) override these per type. Types
 *  still being tuned (lcd_16x2, potentiometer, relay, temperature_sensor, servo)
 *  are intentionally absent until their anchors are finalised. */
const BAKED_PIN_CALIBRATION: PinCalibrations = {
  buzzer: {
    pins: [
      { x: 3.7649682495641343, z: 0.03303914149344678 },
      { x: -3.939751215526556, z: 0.31981413803300995 },
    ],
    gaps: [2],
  },
  led: {
    pins: [
      { x: 0.036950692634412974, z: 1.7058775912822817 },
      { x: -0.3597704037698719, z: -1.4620880982067863 },
    ],
  },
  rgb_led: {
    pins: [
      { x: -1, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
  },
  oled_display: {
    pins: [
      { x: -4.75, z: -16 },
      { x: -1.75, z: -16 },
      { x: 1.5, z: -16 },
      { x: 4.75, z: -16 },
    ],
  },
  ultrasonic_sensor: {
    pins: [
      { x: -3, z: -7 },
      { x: -1, z: -7 },
      { x: 1, z: -7 },
      { x: 3, z: -7 },
    ],
  },
  // Derived from the GLB's pin-tip vertex clusters (not hand-dropped): the
  // model has a 2×2 pin group per side whose rows sit ~9.8mm apart, but the
  // footprint's warped rail targets collapse both rows onto one z — so each
  // side's rows are averaged to their mean z. Keeps the similarity fit's scale
  // driven by the rail-to-rail x span (pins land within ~0.8mm of the holes)
  // instead of being dragged down by the unmatchable z spread.
  power_supply: {
    pins: [
      { x: -22.83, z: -8.11 },
      { x: -20.32, z: -8.11 },
      { x: 20.11, z: -8.05 },
      { x: 22.6, z: -8.05 },
      { x: -22.83, z: -8.11 },
      { x: -20.32, z: -8.11 },
      { x: 20.11, z: -8.05 },
      { x: 22.6, z: -8.05 },
    ],
  },
}

const STORAGE_KEY = "dreamer:component-pin-calibration"

function isP2(v: unknown): v is P2 {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as P2).x === "number" &&
    typeof (v as P2).z === "number"
  )
}

function parseEntry(value: unknown): PinCalibration | null {
  // Legacy shape: a bare P2[] (pins only, no gaps).
  if (Array.isArray(value) && value.every(isP2)) {
    return { pins: value.map((p) => ({ x: p.x, z: p.z })) }
  }
  if (typeof value !== "object" || value === null) return null
  const v = value as { pins?: unknown; gaps?: unknown }
  if (!Array.isArray(v.pins) || !v.pins.every(isP2)) return null
  const pins = v.pins.map((p) => ({ x: p.x, z: p.z }))
  const gaps =
    Array.isArray(v.gaps) && v.gaps.every((n) => typeof n === "number")
      ? (v.gaps as number[]).slice()
      : undefined
  return gaps ? { pins, gaps } : { pins }
}

function load(): PinCalibrations {
  const base = { ...BAKED_PIN_CALIBRATION }
  if (typeof localStorage === "undefined") return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: PinCalibrations = { ...base }
    for (const [type, value] of Object.entries(parsed)) {
      const entry = parseEntry(value)
      if (entry) out[type] = entry
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

export function getPinCalibration(type: string): PinCalibration | undefined {
  return state[type]
}

/** Seed `count` anchors for a type if absent or the wrong length — spread along
 *  x so they're visible before the user places them. Preserves any gaps. */
export function ensurePinAnchors(type: string, count: number): void {
  const existing = state[type]
  if (existing && existing.pins.length === count) return
  const pins: P2[] = Array.from({ length: count }, (_, i) => ({
    x: (i - (count - 1) / 2) * 4,
    z: 0,
  }))
  commit({ ...state, [type]: { ...existing, pins } })
}

export function setPinAnchor(type: string, index: number, xz: P2): void {
  const existing = state[type]
  const pins = existing ? [...existing.pins] : []
  pins[index] = { x: xz.x, z: xz.z }
  commit({ ...state, [type]: { ...existing, pins } })
}

export function getPinAnchor(type: string, index: number): P2 | undefined {
  return state[type]?.pins[index]
}

/** Nudge one pin anchor by a delta in the model's board plane (fine-tune). */
export function nudgePinAnchor(type: string, index: number, dx: number, dz: number): void {
  const cur = state[type]?.pins[index] ?? { x: 0, z: 0 }
  setPinAnchor(type, index, { x: cur.x + dx, z: cur.z + dz })
}

/** Override the hole gaps between consecutive pins; undefined clears the
 *  override so the fit falls back to the footprint's own spacing. */
export function setPinGaps(type: string, gaps: number[] | undefined): void {
  const existing = state[type] ?? { pins: [] }
  const next: PinCalibration = gaps ? { pins: existing.pins, gaps } : { pins: existing.pins }
  commit({ ...state, [type]: next })
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
