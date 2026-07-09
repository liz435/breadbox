// ── Arduino header-pin calibration ───────────────────────────────────────────
//
// The 3D Arduino is now an imported GLB whose header sockets don't line up
// exactly with the schematic pin layout that wire endpoints key off. Rather
// than guess a transform, this store lets the user drag a handle onto each real
// socket (see arduino-calibration.tsx) and records the corrected world x/z per
// pin plus one shared header height. Wire endpoint resolution reads it live, so
// jumper wires follow the calibrated sockets. Persisted to localStorage so a
// calibration survives reloads; `getCalibration()` seeds from BAKED_CALIBRATION
// (filled in once a good pass is exported via the panel's "Copy JSON").

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
 *  here to ship it as the out-of-the-box alignment. Empty = uncalibrated. */
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

export function clearCalibration(): void {
  commit({ headerY: BAKED_CALIBRATION.headerY, overrides: {} })
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
