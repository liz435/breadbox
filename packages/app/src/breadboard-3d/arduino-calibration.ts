// ── Arduino header-pin alignment ─────────────────────────────────────────────
//
// The 3D Arduino is an imported GLB (arduino-uno.glb) whose header sockets may
// not line up with the schematic pin layout that wire endpoints key off. This
// map corrects each pin's in-plane world x/z (plus one shared plug-depth height)
// so jumper wires attach on the model's real sockets. `calibratedPinXZ()` is
// what wire endpoint resolution calls.
//
// Currently empty: the model was swapped for an accurately-scaled Uno, so wires
// fall back to the true schematic pin positions (derived from the real Arduino
// Uno pin coordinates). If the new model's headers sit off from those, re-derive
// per-pin overrides here (or wire the drag calibrator back in) and bake them.

import { ARDUINO_HEADER_TOP_Y } from "./layout"

/** Corrected in-plane position of one header socket (world mm). */
export type PinOverride = { x: number; z: number }

export type Calibration = {
  /** Shared height of the header sockets where wires plug in (world mm). */
  headerY: number
  /** Per-pin in-plane overrides, keyed by the pin's unique numeric id. */
  overrides: Record<number, PinOverride>
}

const BAKED_CALIBRATION: Calibration = {
  headerY: ARDUINO_HEADER_TOP_Y,
  overrides: {},
}

/** World position a wire should attach to for an Arduino pin: the baked
 *  override when present, else the supplied schematic fallback, at plug depth. */
export function calibratedPinXZ(
  pinId: number,
  fallback: { x: number; z: number },
): { x: number; y: number; z: number } {
  const override = BAKED_CALIBRATION.overrides[pinId]
  return {
    x: override?.x ?? fallback.x,
    y: BAKED_CALIBRATION.headerY,
    z: override?.z ?? fallback.z,
  }
}
