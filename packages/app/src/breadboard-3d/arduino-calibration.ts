// ── Arduino header-pin alignment ─────────────────────────────────────────────
//
// The 3D Arduino is an imported GLB (arduino-uno.glb) whose header sockets may
// not line up with the schematic pin layout that wire endpoints key off. This
// store lets the user drag a handle onto each real socket (see
// arduino-calibrator.tsx) and records the corrected world x/z per pin plus one
// shared plug-depth height. Wire endpoint resolution reads it live through
// `calibratedPinXZ()`, so jumper wires follow the calibrated sockets. Persisted
// to localStorage and seeded from BAKED_CALIBRATION.
//
// BAKED is currently empty: the shipped Uno model is accurately scaled, so wires
// fall back to the true schematic pin positions. Drag to fine-tune the current
// model, then "Copy JSON" from the panel to bake a new default in here.

import { useSyncExternalStore } from "react"
import { ARDUINO_HEADER_TOP_Y } from "./layout"

/** Corrected in-plane position of one header socket (world mm). */
export type PinOverride = { x: number; z: number }

export type Calibration = {
  /** Shared height of the header sockets where wires plug in (world mm). */
  headerY: number
  /** Per-pin in-plane overrides, keyed by the pin's unique numeric id. */
  overrides: Record<number, PinOverride>
}

/** Baked defaults from a completed calibration pass — paste an exported map
 *  here to ship it as the out-of-the-box alignment. Empty overrides = wires use
 *  the true schematic pin positions (the current model is accurately scaled). */
const BAKED_CALIBRATION: Calibration = {
  headerY: ARDUINO_HEADER_TOP_Y,
  overrides: {},
}

const STORAGE_KEY = "dreamer:arduino-pin-calibration"

function load(): Calibration {
  if (typeof localStorage === "undefined") return BAKED_CALIBRATION
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return BAKED_CALIBRATION
    const parsed = JSON.parse(raw) as Partial<Calibration>
    return {
      headerY: typeof parsed.headerY === "number" ? parsed.headerY : BAKED_CALIBRATION.headerY,
      overrides: parsed.overrides ?? {},
    }
  } catch {
    return BAKED_CALIBRATION
  }
}

let state: Calibration = load()
const listeners = new Set<() => void>()

function commit(next: Calibration) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Non-fatal: calibration just won't persist across reloads.
  }
  for (const fn of listeners) fn()
}

export function getCalibration(): Calibration {
  return state
}

export function setPinOverride(pin: number, override: PinOverride): void {
  commit({ ...state, overrides: { ...state.overrides, [pin]: override } })
}

export function setHeaderY(headerY: number): void {
  commit({ ...state, headerY })
}

/** Restore the shipped baked alignment (not an empty map — that would drop every
 *  wire back onto the raw schematic pinout if a baked map is ever present). */
export function clearCalibration(): void {
  commit({
    headerY: BAKED_CALIBRATION.headerY,
    overrides: { ...BAKED_CALIBRATION.overrides },
  })
}

export function subscribeCalibration(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useCalibration(): Calibration {
  return useSyncExternalStore(subscribeCalibration, getCalibration, getCalibration)
}

/** World position a wire should attach to for an Arduino pin: the calibrated
 *  override when present, else the supplied schematic fallback, at headerY. */
export function calibratedPinXZ(
  pinId: number,
  fallback: { x: number; z: number },
): { x: number; y: number; z: number } {
  const override = state.overrides[pinId]
  return {
    x: override?.x ?? fallback.x,
    y: state.headerY,
    z: override?.z ?? fallback.z,
  }
}

// ── Calibration mode toggle ──────────────────────────────────────────────────

const MODE_KEY = "dreamer:arduino-calibrate"
let calibrating =
  typeof localStorage !== "undefined" && localStorage.getItem(MODE_KEY) === "1"
const modeListeners = new Set<() => void>()

export function isCalibrating(): boolean {
  return calibrating
}

export function setCalibrating(on: boolean): void {
  calibrating = on
  try {
    localStorage.setItem(MODE_KEY, on ? "1" : "0")
  } catch {
    // ignore
  }
  for (const fn of modeListeners) fn()
}

function subscribeCalibrating(fn: () => void): () => void {
  modeListeners.add(fn)
  return () => modeListeners.delete(fn)
}

export function useCalibrating(): boolean {
  return useSyncExternalStore(subscribeCalibrating, isCalibrating, isCalibrating)
}
