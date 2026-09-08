// ── Shared Arduino placement ────────────────────────────────────────────────
//
// Keep the visual model, PCB collider, fallback model, and pin/wire anchors on
// the same board-plane offset. Pin calibration values stay in the unnudged
// layout coordinate space, so the offset is applied when those values render.

/** Orientation and fine placement applied after the Arduino GLB is auto-fit. */
export const ARDUINO_MODEL = {
  yawTurns: 0,
  flip: false,
  // Negative x is left in the 3D scene. Keep the board about 2 cm clear of
  // the breadboard edge at the current scene scale.
  nudge: { x: -20, z: 0 },
  liftY: 0,
  scale: 1,
} as const

export type ArduinoPlanePoint = { x: number; z: number }

/** Apply the shared Arduino board-plane nudge to an absolute world point. */
export function shiftArduinoPoint<T extends ArduinoPlanePoint>(point: T): T {
  return {
    ...point,
    x: point.x + ARDUINO_MODEL.nudge.x,
    z: point.z + ARDUINO_MODEL.nudge.z,
  }
}

/** Convert a rendered Arduino point back to the calibration store's base space. */
export function unshiftArduinoPoint<T extends ArduinoPlanePoint>(point: T): T {
  return {
    ...point,
    x: point.x - ARDUINO_MODEL.nudge.x,
    z: point.z - ARDUINO_MODEL.nudge.z,
  }
}
