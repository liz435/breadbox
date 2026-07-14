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
 *  still being tuned (potentiometer, relay, temperature_sensor, servo) are
 *  intentionally absent until their anchors are finalised. */
const BAKED_PIN_CALIBRATION: PinCalibrations = {
  buzzer: {
    pins: [
      { x: 3.7649682495641343, z: 0.03303914149344678 },
      { x: -3.939751215526556, z: 0.31981413803300995 },
    ],
    gaps: [2],
  },
  // led is intentionally NOT pin-calibrated. Its two legs are one hole apart, so
  // fitting them onto the footprint holes pins the whole-model scale to that ~2.5
  // mm span — and because the led.glb is ~84% leg by height, that leaves a tiny
  // ~1.5 mm dome on a long stalk. Sizing it by heightMm (see GLB_PARTS.led) and
  // sinking the legs into the board reads far better; the pin fit adds nothing but
  // a bad scale for this leg-dominated model.
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
  // Derived from the GLB's 16-pin header line (mesh "metal", +z edge) in the
  // model's normalized frame at rotation [0, π, 0]: 16 sockets evenly spaced
  // across the detected 24.8 mm header span at z≈10.2 mm (the header sits on one
  // long edge, offset from centre — which is why the flat 4 mm default spread
  // looked far too wide). Pin 0 (vss) is the −x end; if the module ends up
  // flipped end-for-end, reverse this array. Real HD44780 pins are evenly
  // pitched, so even spacing across the span is faithful.
  lcd_16x2: {
    pins: [
      { x: -4.16, z: 10.23 }, // pin 0 · vss
      { x: -2.51, z: 10.23 },
      { x: -0.86, z: 10.23 },
      { x: 0.79, z: 10.23 },
      { x: 2.44, z: 10.23 },
      { x: 4.09, z: 10.23 },
      { x: 5.74, z: 10.23 },
      { x: 7.39, z: 10.23 },
      { x: 9.04, z: 10.23 },
      { x: 10.69, z: 10.23 },
      { x: 12.34, z: 10.23 },
      { x: 13.99, z: 10.23 },
      { x: 15.64, z: 10.23 },
      { x: 17.29, z: 10.23 },
      { x: 18.94, z: 10.23 },
      { x: 20.59, z: 10.23 }, // pin 15 · k
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
  // VIRTUAL pins (the SG90 has no board pins — its cable ends in a connector):
  // three points under the body's base centre at true 2.54mm pitch, in the
  // normalized frame (heightMm 67 ≈ scale 1). glbNormalize centres on the full
  // bbox, and the bundled cable (z→92mm) drags that centre ~35mm off the body —
  // this fit puts the BODY back over its 3 footprint holes at real scale, with
  // the cable draping down-board. Derived from per-node GLB bounds, not dropped
  // by hand.
  servo: {
    pins: [
      { x: 0, z: -43.3 },
      { x: 0, z: -40.8 },
      { x: 0, z: -38.3 },
    ],
  },
  // Derived from the GLB's pin-tip vertex clusters (not hand-dropped): a 2×2
  // pin group per side, rows ~9.9mm apart — exactly the 4-hole gap of the
  // footprint's rail-block rows (block hole 1 and 5), so the fit uses the
  // true geometry on both axes. Top row (smaller z) is the footprint's first
  // row; the body bulk extends toward −z, overhanging the board end.
  power_supply: {
    pins: [
      { x: -22.6, z: 3.11 },
      { x: -20.1, z: 3.1 },
      { x: 20.32, z: 3.23 },
      { x: 22.83, z: 3.23 },
      { x: -22.6, z: 12.98 },
      { x: -20.12, z: 13 },
      { x: 20.32, z: 12.98 },
      { x: 22.83, z: 12.99 },
    ],
  },
}

// Bump the version suffix whenever BAKED_PIN_CALIBRATION is re-baked against
// new models: older keys hold a snapshot of the baked data of their era, and
// letting that stale copy shadow the fresh bake mis-fits (or zero-scales)
// every instance of the affected types.
const STORAGE_KEY = "dreamer:component-pin-calibration:v2"

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
  if (!pins.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))) return null
  // A gap is the hole count between consecutive pins along the pin axis — a
  // value below 1 collapses fit targets onto one hole, which zero-scales the
  // model (invisible part). Drop the whole entry rather than guess.
  const gaps =
    Array.isArray(v.gaps) && v.gaps.every((n) => typeof n === "number")
      ? (v.gaps as number[]).slice()
      : undefined
  if (gaps && !gaps.every((n) => Number.isFinite(n) && n >= 1)) return null
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
    // Persist only entries that differ from the baked data. Writing the whole
    // merged state would snapshot today's bake into localStorage, where it
    // shadows every future re-bake (the exact staleness the version suffix
    // exists to escape).
    const overrides: PinCalibrations = {}
    for (const [type, entry] of Object.entries(next)) {
      if (JSON.stringify(entry) !== JSON.stringify(BAKED_PIN_CALIBRATION[type])) {
        overrides[type] = entry
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
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

/** Drop the user's localStorage anchors for a type, reverting to the baked
 *  calibration when one exists (a stale local override otherwise shadows a
 *  newer baked default until the next full reload). */
export function clearPinCalibration(type: string): void {
  const next = { ...state }
  const baked = BAKED_PIN_CALIBRATION[type]
  if (baked) next[type] = baked
  else delete next[type]
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
