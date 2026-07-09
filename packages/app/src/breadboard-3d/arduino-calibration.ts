// ── Arduino header-pin alignment ─────────────────────────────────────────────
//
// The 3D Arduino is an imported GLB (arduino-uno.glb) whose header sockets don't
// line up with the schematic pin layout that wire endpoints key off. These baked
// offsets — produced once with an interactive drag calibrator (since removed) —
// correct each pin's in-plane world x/z, plus one shared plug-depth height, so
// jumper wires attach on the model's real sockets. `calibratedPinXZ()` is what
// wire endpoint resolution calls; every pin was hand-anchored at each strip's
// two ends and linearly interpolated in between, so each header is a straight,
// evenly-spaced line.

/** Corrected in-plane position of one header socket (world mm). */
export type PinOverride = { x: number; z: number }

export type Calibration = {
  /** Shared height of the header sockets where wires plug in (world mm). */
  headerY: number
  /** Per-pin in-plane overrides, keyed by the pin's unique numeric id. */
  overrides: Record<number, PinOverride>
}

const BAKED_CALIBRATION: Calibration = {
  // Plug depth: where jumper wire ends meet the header sockets (world mm).
  headerY: 5.6,
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
