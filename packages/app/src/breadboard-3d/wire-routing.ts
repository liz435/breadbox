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
  arcFactor: (t: number) => number
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
  for (const obstacle of obstacles) {
    const startPlug = plugsInto(start, obstacle, profile.plugToleranceMm)
    const endPlug = plugsInto(end, obstacle, profile.plugToleranceMm)
    if (obstacle.kind === "disc") {
      if (startPlug || endPlug) continue
      const { distance, t } = segmentClosest(obstacle.x, obstacle.z, start.x, start.z, end.x, end.z)
      if (distance > obstacle.radius + profile.sideMarginMm) continue
      const factor = Math.max(profile.minArcFactor, profile.arcFactor(t))
      const clearance = obstacle.topY + profile.clearanceMm - avgY
      rise = Math.max(rise, Math.min(clearance / factor, Math.max(profile.maxRiseMm, clearance + 4)))
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
    rise = Math.max(rise, Math.min(clearance / factor, Math.max(profile.maxRiseMm, clearance + 4)))
  }
  return rise
}
