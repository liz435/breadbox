import { describe, expect, test } from "bun:test"
import { boardComponentSchema } from "@dreamer/schemas"
import { BOARD_SURFACE_Y } from "../layout"
import { buildPartObb, obbSegmentInterval, type Obb2 } from "../part-volume"

/** Axis-aligned box: half-widths hu (along +x) and hv (along +z), centred at
 *  (cx,cz), top at `topY`. */
function aabb(cx: number, cz: number, hu: number, hv: number, topY = 10): Obb2 {
  return { cx, cz, ux: hu, uz: 0, vx: 0, vz: hv, topY }
}

describe("obbSegmentInterval", () => {
  test("segment crossing an axis-aligned box clips to the box faces", () => {
    // Box x∈[-2,2], z∈[-3,3]; segment along x from -5 to 5 through the centre.
    const hit = obbSegmentInterval(aabb(0, 0, 2, 3), -5, 0, 5, 0, 0)
    expect(hit).not.toBeNull()
    expect(hit?.t0).toBeCloseTo(0.3, 6) // x=-2 at t=0.3
    expect(hit?.t1).toBeCloseTo(0.7, 6) // x=+2 at t=0.7
  })

  test("a segment that misses the box returns null", () => {
    // Same box, but the segment runs along z=10 — well outside z∈[-3,3].
    expect(obbSegmentInterval(aabb(0, 0, 2, 3), -5, 10, 5, 10, 0)).toBeNull()
  })

  test("margin expands the box so a near-miss now overlaps", () => {
    const box = aabb(0, 0, 2, 3)
    expect(obbSegmentInterval(box, -5, 4, 5, 4, 0)).toBeNull() // z=4 outside [-3,3]
    expect(obbSegmentInterval(box, -5, 4, 5, 4, 1.5)).not.toBeNull() // within [-4.5,4.5]
  })

  test("a segment starting inside the box includes t=0", () => {
    const hit = obbSegmentInterval(aabb(0, 0, 2, 3), 0, 0, 10, 0, 0)
    expect(hit?.t0).toBeCloseTo(0, 6)
    expect(hit?.t1).toBeCloseTo(0.2, 6) // exits at x=2 → t=0.2
  })

  test("a rotated box clips on its own axes, not world axes", () => {
    // Box rotated 90°: u-axis points +z (half 2), v-axis points +x (half 3).
    const box: Obb2 = { cx: 0, cz: 0, ux: 0, uz: 2, vx: 3, vz: 0, topY: 10 }
    // Segment along x from -6 to 6 is clipped by the v-axis half (3): x∈[-3,3].
    const hit = obbSegmentInterval(box, -6, 0, 6, 0, 0)
    expect(hit?.t0).toBeCloseTo(0.25, 6) // x=-3 at t=0.25
    expect(hit?.t1).toBeCloseTo(0.75, 6) // x=+3 at t=0.75
  })
})

describe("buildPartObb (uncalibrated → PartMesh placement only)", () => {
  const bounds = { halfX: 6, halfZ: 9, height: 12 }
  function led(rotation: number) {
    return boardComponentSchema.parse({
      id: "led-1",
      type: "led",
      name: "LED",
      x: 5,
      y: 7,
      rotation,
      pins: {},
      properties: {},
    })
  }

  test("half-axes carry the normalized extents (unit scale, no calibration)", () => {
    const obb = buildPartObb(led(0), bounds, undefined)
    expect(Math.hypot(obb.ux, obb.uz)).toBeCloseTo(bounds.halfX, 4)
    expect(Math.hypot(obb.vx, obb.vz)).toBeCloseTo(bounds.halfZ, 4)
  })

  test("the two half-axes stay perpendicular", () => {
    const obb = buildPartObb(led(0), bounds, undefined)
    expect(obb.ux * obb.vx + obb.uz * obb.vz).toBeCloseTo(0, 4)
  })

  test("top face sits at the board surface plus the body height", () => {
    const obb = buildPartObb(led(0), bounds, undefined)
    expect(obb.topY).toBeCloseTo(BOARD_SURFACE_Y + bounds.height, 4)
  })

  test("a 90° part rotation preserves the box extents", () => {
    const obb = buildPartObb(led(1), bounds, undefined)
    expect(Math.hypot(obb.ux, obb.uz)).toBeCloseTo(bounds.halfX, 4)
    expect(Math.hypot(obb.vx, obb.vz)).toBeCloseTo(bounds.halfZ, 4)
    expect(obb.topY).toBeCloseTo(BOARD_SURFACE_Y + bounds.height, 4)
  })
})
