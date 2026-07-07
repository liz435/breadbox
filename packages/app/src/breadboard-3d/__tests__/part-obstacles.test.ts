import { describe, expect, test } from "bun:test"
import { distanceToSegment, partHeightMm } from "../part-obstacles"

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
