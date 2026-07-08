import { describe, expect, test } from "bun:test"
import { boardComponentSchema } from "@dreamer/schemas"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { pixelToWorld } from "../layout"
import { distanceToSegment, partHeightMm, partObstacles } from "../part-obstacles"

/** World-space xz of a breadboard grid hole, via the same path wires use. */
function holeWorld(row: number, col: number): { x: number; z: number } {
  const px = gridToPixel({ row, col })
  return pixelToWorld(px.x, px.y)
}

describe("distanceToSegment", () => {
  test("point beside the middle of a horizontal segment", () => {
    // Segment along x from (0,0) to (10,0); point at (5,4) is 4 away.
    expect(distanceToSegment(5, 4, 0, 0, 10, 0)).toBeCloseTo(4, 5)
  })

  test("clamps to the nearer endpoint when past the segment end", () => {
    // Point (14,3) projects beyond x=10, so distance is to (10,0).
    expect(distanceToSegment(14, 3, 0, 0, 10, 0)).toBeCloseTo(5, 5)
  })

  test("zero-length segment falls back to point distance", () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 5)
  })
})

describe("partHeightMm", () => {
  test("known tall parts report their datasheet-ish height", () => {
    expect(partHeightMm("servo")).toBeGreaterThan(partHeightMm("resistor"))
    expect(partHeightMm("relay")).toBeGreaterThan(10)
  })

  test("unknown types get a nominal height", () => {
    expect(partHeightMm("something-unknown")).toBeGreaterThan(0)
  })
})

describe("partObstacles coreRadius", () => {
  // A servo's footprint is three holes down a column (rows y..y+2). Its 3D body
  // sits over them, so its own wires terminate inside the obstacle disc. The
  // wire router uses coreRadius (the pin spread) to tell "the wire plugs into
  // this part" from "the wire passes over it"; this guards that discrimination.
  const servo = boardComponentSchema.parse({
    id: "servo-1",
    type: "servo",
    name: "Servo",
    x: 5,
    y: 7,
    pins: {},
    properties: {},
  })
  const [obstacle] = partObstacles({ "servo-1": servo })

  test("coreRadius is the pin spread, radius pads it for the body", () => {
    expect(obstacle).toBeDefined()
    expect(obstacle.coreRadius).toBeGreaterThan(0)
    expect(obstacle.radius).toBeGreaterThan(obstacle.coreRadius)
  })

  test("every one of the part's own pin holes falls within coreRadius", () => {
    // Rows 7, 8, 9 are the servo's three pins (centroid at row 8).
    for (const row of [7, 8, 9]) {
      const hole = holeWorld(row, 5)
      const d = Math.hypot(hole.x - obstacle.x, hole.z - obstacle.z)
      expect(d).toBeLessThanOrEqual(obstacle.coreRadius + 0.5)
    }
  })

  test("an adjacent hole the part merely sits near is outside coreRadius", () => {
    // Row 11 is two pitches past the footprint end — a wire ending here does not
    // plug into the servo, so it must NOT be excluded from arc-over.
    const hole = holeWorld(11, 5)
    const d = Math.hypot(hole.x - obstacle.x, hole.z - obstacle.z)
    expect(d).toBeGreaterThan(obstacle.coreRadius + 0.5)
  })
})
