import { describe, expect, test } from "bun:test"
import { SERVO_HORN_HOLE_POSITIONS, servoHornHoleOffsets } from "@/components/catalog/servo/servo-horn-geometry"

describe("servo horn geometry", () => {
  test("uses five mounting holes on each mirrored arm", () => {
    expect(SERVO_HORN_HOLE_POSITIONS).toHaveLength(5)

    const holes = servoHornHoleOffsets()
    expect(holes).toHaveLength(10)
    expect(holes.filter((hole) => hole.side === "left")).toHaveLength(5)
    expect(holes.filter((hole) => hole.side === "right")).toHaveLength(5)
    expect(holes.slice(0, 5).map((hole) => hole.fraction)).toEqual(
      holes.slice(5).map((hole) => -hole.fraction),
    )
  })
})
