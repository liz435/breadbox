// ── Wires clear what they can, and never launch comedy loops ────────────────
//
// Two failure modes bracket this solver. The original bug capped the rise at
// `clearance + 4` (a clearance bounding a *rise*), which silently under-cut
// the requirement for any part taller than ~12 mm — the wire computed the
// right hop and then clamped it away, into the part. Removing the cap
// entirely swung to the other failure: an oversized uploaded model (a 50 mm
// decorative GLB) demanded a half-circle over the whole board.
//
// The contract now: obstacles the ceiling can genuinely clear ARE cleared
// (checked on the reconstructed curve height, the property a viewer sees);
// anything demanding more than `maxRiseMm` saturates exactly there.
//
import { describe, expect, test } from "bun:test"
import { Vector3 } from "three"
import { bezierArcFactor, resolveWireArcRise, type WireRouteProfile } from "../wire-routing"
import type { PartObstacle } from "../part-obstacles"

const BOARD_Y = 8.5
const SPAN = 60

const PROFILE: WireRouteProfile = {
  baseRise: Math.min(16, 4 + SPAN * 0.1),
  clearanceMm: 2,
  maxRiseMm: 26,
  sideMarginMm: 1.5,
  plugToleranceMm: 0.5,
  minArcFactor: 0.3,
  arcFactor: bezierArcFactor,
}

/** Height of the drawn curve above the chord, at a fraction along the chord.
 *  Mirrors buildCurve: a cubic Bézier with both controls raised by `rise`. */
function curveHeightAt(rise: number, chordFraction: number): number {
  return bezierArcFactor(chordFraction) * rise
}

type DiscObstacle = Extract<PartObstacle, { kind: "disc" }>

function discAt(chordFraction: number, heightMm: number): DiscObstacle {
  return {
    kind: "disc",
    x: SPAN * chordFraction,
    z: 0,
    radius: 6,
    coreRadius: 2,
    topY: BOARD_Y + heightMm,
  }
}

describe("wire arcs clear the parts the ceiling allows", () => {
  const start = new Vector3(0, BOARD_Y, 0)
  const end = new Vector3(SPAN, BOARD_Y, 0)

  test("a mid-span part within the ceiling is actually cleared", () => {
    // 16 mm part at mid-span needs rise = (16+2)/0.75 = 24 ≤ maxRiseMm.
    const obstacle = discAt(0.5, 16)
    const rise = resolveWireArcRise(start, end, [obstacle], PROFILE)
    const wireY = BOARD_Y + curveHeightAt(rise, 0.5)
    expect(rise).toBeLessThanOrEqual(PROFILE.maxRiseMm)
    expect(wireY).toBeGreaterThanOrEqual(obstacle.topY + PROFILE.clearanceMm - 1e-6)
  })

  test("a clear span keeps the low aesthetic baseline", () => {
    const rise = resolveWireArcRise(start, end, [], PROFILE)
    expect(rise).toBe(PROFILE.baseRise)
  })

  for (const [label, fraction, heightMm] of [
    ["a mid-span part just past the ceiling", 0.5, 24],
    ["a tall part off-centre", 0.25, 24],
    ["an oversized upload near an endpoint", 0.12, 40],
  ] as const) {
    test(`${label} saturates at maxRiseMm instead of looping`, () => {
      const rise = resolveWireArcRise(start, end, [discAt(fraction, heightMm)], PROFILE)
      expect(rise).toBe(PROFILE.maxRiseMm)
    })
  }

  test("the cap never pulls the arc below a clearable part", () => {
    // Sweep heights up to the tallest the ceiling can clear mid-span
    // (factor 0.75 × 26 − 2 = 17.5 mm) and check each is genuinely cleared.
    for (let heightMm = 4; heightMm <= 17; heightMm += 1) {
      const obstacle = discAt(0.5, heightMm)
      const rise = resolveWireArcRise(start, end, [obstacle], PROFILE)
      const wireY = BOARD_Y + curveHeightAt(rise, 0.5)
      expect(wireY).toBeGreaterThanOrEqual(obstacle.topY + PROFILE.clearanceMm - 1e-6)
    }
  })

  test("the part a wire plugs into is not treated as an obstacle", () => {
    // Its own destination can't be arced away — the arc height at the terminus
    // is ~0, so treating it as an obstacle only forces a spike that dives back
    // through the body.
    const atEndpoint = discAt(0, 20)
    expect(resolveWireArcRise(start, end, [atEndpoint], PROFILE)).toBe(PROFILE.baseRise)
  })

  test("a baseRise above the ceiling is honoured, not clamped", () => {
    const tallBase = { ...PROFILE, baseRise: PROFILE.maxRiseMm + 10 }
    expect(resolveWireArcRise(start, end, [], tallBase)).toBe(tallBase.baseRise)
  })
})

describe("bezierArcFactor", () => {
  // Horizontal progress along the chord is the smoothstep 3t²-2t³, not t.
  // Feeding the chord fraction in as t is what under-reported the height
  // off-centre and made the router ask for far taller arcs than needed.
  test("peaks at mid-span with the cubic's 0.75", () => {
    expect(bezierArcFactor(0.5)).toBeCloseTo(0.75, 6)
  })

  test("is zero at both endpoints", () => {
    expect(bezierArcFactor(0)).toBeCloseTo(0, 6)
    expect(bezierArcFactor(1)).toBeCloseTo(0, 6)
  })

  test("reports a higher factor than the naive t would, off-centre", () => {
    const naive = 3 * 0.25 * (1 - 0.25)
    expect(bezierArcFactor(0.25)).toBeGreaterThan(naive)
  })

  test("is symmetric about mid-span", () => {
    expect(bezierArcFactor(0.3)).toBeCloseTo(bezierArcFactor(0.7), 6)
  })
})
