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

/** Corrected in-plane position of one header socket (world mm). */
export type PinOverride = { x: number; z: number }

export type Calibration = {
  /** Shared height of the header sockets where wires plug in (world mm). */
  headerY: number
  /** Per-pin in-plane overrides, keyed by the pin's unique numeric id. */
  overrides: Record<number, PinOverride>
}

/** Baked defaults from a completed calibration pass — paste an exported map here
 *  to ship it as the out-of-the-box alignment. Aligned to arduino-uno.glb: every
 *  socket in a header strip was hand-dragged roughly onto the model, then each
 *  strip was straightened — a least-squares line fit through its sockets with the
 *  pins re-spaced evenly between the strip's two ends. Re-run the "Calibrate
 *  Arduino" panel + "Copy JSON" to refresh. */
const BAKED_CALIBRATION: Calibration = {
  // Plug depth (world mm) where jumper ends meet the header sockets.
  headerY: 9.1,
  overrides: {
    // Digital header, left strip — SCL, SDA, AREF, GND, D13…D8 (top edge).
    [-11]: { x: -64.294, z: -81.546 }, // SCL
    [-10]: { x: -62.406, z: -81.552 }, // SDA
    [-7]: { x: -60.519, z: -81.557 }, // AREF
    [-6]: { x: -58.631, z: -81.562 }, // GND
    [13]: { x: -56.743, z: -81.568 },
    [12]: { x: -54.856, z: -81.573 },
    [11]: { x: -52.968, z: -81.579 },
    [10]: { x: -51.08, z: -81.584 },
    [9]: { x: -49.193, z: -81.589 },
    [8]: { x: -47.305, z: -81.595 },
    // Digital header, right strip — D7…D0 (top edge).
    [7]: { x: -44.012, z: -81.574 },
    [6]: { x: -42.117, z: -81.581 },
    [5]: { x: -40.221, z: -81.588 },
    [4]: { x: -38.326, z: -81.595 },
    [3]: { x: -36.431, z: -81.602 },
    [2]: { x: -34.536, z: -81.609 },
    [1]: { x: -32.64, z: -81.616 },
    [0]: { x: -30.745, z: -81.623 },
    // Power header — IOREF, 5V2, RESET, 3V3, 5V, GND, GND, VIN (bottom edge).
    [-8]: { x: -57.771, z: -45.286 }, // IOREF
    [-12]: { x: -55.842, z: -45.293 }, // 5V2 (second usable 5V, placed right of IOREF)
    [-9]: { x: -53.913, z: -45.299 }, // RESET
    [-2]: { x: -51.984, z: -45.305 }, // 3V3
    [-1]: { x: -50.054, z: -45.312 }, // 5V
    [-3]: { x: -48.125, z: -45.318 }, // GND
    [-4]: { x: -46.196, z: -45.324 }, // GND
    [-5]: { x: -44.267, z: -45.331 }, // VIN
    // Analog header — A0…A5 (bottom edge).
    [14]: { x: -40.19, z: -45.275 }, // A0
    [15]: { x: -38.251, z: -45.259 },
    [16]: { x: -36.312, z: -45.244 },
    [17]: { x: -34.372, z: -45.229 },
    [18]: { x: -32.433, z: -45.214 },
    [19]: { x: -30.494, z: -45.198 }, // A5
  },
}

const STORAGE_KEY = "dreamer:arduino-pin-calibration:v2"

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
