// ── Canonical wire-route facts ─────────────────────────────────────────────
// Both visible Bezier wires and physics ropes start from this clearance solve.
// Their curve adapters may sample it differently, but no adapter decides which
// part a wire must clear.

import type { Vector3 } from "three"
import { obbSegmentInterval } from "./part-volume"
import { segmentClosest, type PartObstacle } from "./part-obstacles"

export type WireRouteProfile = {
  baseRise: number
  clearanceMm: number
  maxRiseMm: number
  sideMarginMm: number
  plugToleranceMm: number
  minArcFactor: number
  /**
   * Fraction of the control-point rise the curve actually reaches, given a
   * position expressed as a fraction ALONG THE STRAIGHT CHORD (which is what
   * the obstacle tests produce).
   *
   * Curves whose horizontal progress is not linear in their own parameter must
   * account for that here — see `bezierArcFactor`.
   */
  arcFactor: (chordFraction: number) => number
}

/**
 * Arc factor for a cubic Bézier whose two control points sit directly above the
 * endpoints — the shape both wire renderers build.
 *
 * Height above the chord is `3t(1-t)·rise` in the curve's own parameter t, but
 * horizontal progress is the smoothstep `3t²-2t³`, not t. Feeding the chord
 * fraction straight in as t therefore reads the height at the wrong place: it
 * under-reports the factor off-centre and demands a much taller arc than the
 * geometry needs. Inverting the smoothstep first makes the answer exact.
 */
export function bezierArcFactor(chordFraction: number): number {
  const s = Math.min(1, Math.max(0, chordFraction))
  // Newton on 3t²-2t³ = s. Monotonic on [0,1] and well-conditioned away from
  // the endpoints, where the caller's minArcFactor floor takes over anyway.
  let t = s
  for (let i = 0; i < 12; i++) {
    const f = 3 * t * t - 2 * t * t * t - s
    const d = 6 * t - 6 * t * t
    if (Math.abs(d) < 1e-9) break
    t -= f / d
  }
  return 3 * t * (1 - t)
}

function plugsInto(point: Vector3, obstacle: PartObstacle, tolerance: number): boolean {
  return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) <= obstacle.coreRadius + tolerance
}

export function resolveWireArcRise(
  start: Vector3,
  end: Vector3,
  obstacles: PartObstacle[],
  profile: WireRouteProfile,
): number {
  const span = start.distanceTo(end)
  const avgY = (start.y + end.y) / 2
  let rise = profile.baseRise
  // Control-point rise that puts the arc `clearance` above the board at an
  // obstacle sitting where the arc reaches `factor` of its rise. Note the old
  // `clearance + 4` cap is gone — it bounded a *rise* by a *clearance* and so
  // silently under-cut the requirement for any part taller than ~12 mm.
  const riseFor = (clearance: number, factor: number): number => clearance / factor
  for (const obstacle of obstacles) {
    const startPlug = plugsInto(start, obstacle, profile.plugToleranceMm)
    const endPlug = plugsInto(end, obstacle, profile.plugToleranceMm)
    if (obstacle.kind === "disc") {
      if (startPlug || endPlug) continue
      const { distance, t } = segmentClosest(obstacle.x, obstacle.z, start.x, start.z, end.x, end.z)
      if (distance > obstacle.radius + profile.sideMarginMm) continue
      const factor = Math.max(profile.minArcFactor, profile.arcFactor(t))
      const clearance = obstacle.topY + profile.clearanceMm - avgY
      rise = Math.max(rise, riseFor(clearance, factor))
      continue
    }
    const interval = obbSegmentInterval(obstacle.obb, start.x, start.z, end.x, end.z, profile.sideMarginMm)
    if (!interval) continue
    let { t0, t1 } = interval
    if (startPlug || endPlug) {
      const clamp = span > 1e-6 ? Math.min(0.49, (obstacle.coreRadius + profile.plugToleranceMm) / span) : 0.49
      if (startPlug) t0 = Math.max(t0, clamp)
      if (endPlug) t1 = Math.min(t1, 1 - clamp)
      if (t0 >= t1) continue
    }
    const t = Math.abs(t0 - 0.5) >= Math.abs(t1 - 0.5) ? t0 : t1
    const factor = Math.max(profile.minArcFactor, profile.arcFactor(t))
    const clearance = obstacle.obb.topY + profile.clearanceMm - avgY
    rise = Math.max(rise, riseFor(clearance, factor))
  }
  // A single hop only reads as a jumper wire up to a point: past `maxRiseMm`
  // the "clearing" arc turns into a comedy loop, so the solve saturates there
  // and accepts passing close to (or through) anything taller — an uploaded
  // model twice the board's height must not launch a wire to the ceiling.
  // Unlike the old formula this cap binds the solved rise directly, so it can
  // never under-cut a part the ceiling is genuinely tall enough to clear.
  return Math.min(rise, Math.max(profile.maxRiseMm, profile.baseRise))
}
