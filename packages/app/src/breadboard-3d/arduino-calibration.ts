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

/** Corrected in-plane position of one header socket (world mm). */
export type PinOverride = { x: number; z: number }

export type Calibration = {
  /** Shared height of the header sockets where wires plug in (world mm). */
  headerY: number
  /** Per-pin in-plane overrides, keyed by the pin's unique numeric id. */
  overrides: Record<number, PinOverride>
}

/** Baked defaults from a completed calibration pass — paste an exported map
 *  here to ship it as the out-of-the-box alignment. Empty = uncalibrated.
 *
 *  Aligned to arduino-uno.glb: the user hand-placed each header strip's two end
 *  pins onto the model's real sockets (AREF/D8, D7/D0, IOREF/VIN, A0/A5); every
 *  pin in between is linearly interpolated along that straight, evenly-spaced
 *  header line. Re-run the "Calibrate pins" panel and "Copy JSON" to refresh. */
const BAKED_CALIBRATION: Calibration = {
  // Plug depth: where jumper wire ends meet the header sockets (world mm).
  headerY: 6.6,
  overrides: {
    // Digital header, left strip — AREF, GND, D13…D8 (top edge).
    [-7]: { x: -64.407, z: -39.041 }, // AREF
    [-6]: { x: -62.03, z: -39.106 }, // GND
    13: { x: -59.654, z: -39.171 },
    12: { x: -57.278, z: -39.236 },
    11: { x: -54.902, z: -39.302 },
    10: { x: -52.525, z: -39.367 },
    9: { x: -50.149, z: -39.432 },
    8: { x: -47.773, z: -39.497 },
    // Digital header, right strip — D7…D0 (top edge).
    7: { x: -44.729, z: -39.147 },
    6: { x: -42.744, z: -39.048 },
    5: { x: -40.76, z: -38.948 },
    4: { x: -38.775, z: -38.849 },
    3: { x: -36.79, z: -38.749 },
    2: { x: -34.805, z: -38.65 },
    1: { x: -32.821, z: -38.55 },
    0: { x: -30.836, z: -38.451 },
    // Analog header — A0…A5 (bottom edge).
    14: { x: -40.289, z: -4.447 }, // A0
    15: { x: -38.439, z: -4.304 },
    16: { x: -36.588, z: -4.161 },
    17: { x: -34.737, z: -4.018 },
    18: { x: -32.886, z: -3.875 },
    19: { x: -31.035, z: -3.732 }, // A5
    // Power header — IOREF, RESET, 3V3, 5V, GND, GND, VIN (bottom edge).
    [-8]: { x: -57.697, z: -4.136 }, // IOREF
    [-9]: { x: -55.48, z: -4.087 }, // RESET
    [-2]: { x: -53.262, z: -4.038 }, // 3V3
    [-1]: { x: -51.045, z: -3.989 }, // 5V
    [-3]: { x: -48.828, z: -3.939 }, // GND
    [-4]: { x: -46.61, z: -3.89 }, // GND
    [-5]: { x: -44.393, z: -3.841 }, // VIN
  },
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

/** Restore the shipped baked alignment (not an empty map — that would drop
 *  every wire back onto the raw schematic pinout the GLB doesn't match). */
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
