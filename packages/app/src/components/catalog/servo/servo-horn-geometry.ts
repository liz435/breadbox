/** Fractions measured from the servo spline to each mounting hole. */
export const SERVO_HORN_HOLE_POSITIONS = [1, 0.82, 0.64, 0.46, 0.28] as const

export type ServoHornSide = "left" | "right"

/** Return the mirrored hole locations for both arms of a dual-sided horn. */
export function servoHornHoleOffsets(): Array<{ side: ServoHornSide; fraction: number }> {
  return [
    ...SERVO_HORN_HOLE_POSITIONS.map((fraction) => ({ side: "left" as const, fraction: -fraction })),
    ...SERVO_HORN_HOLE_POSITIONS.map((fraction) => ({ side: "right" as const, fraction })),
  ]
}
