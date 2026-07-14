// ── Part placement frame ─────────────────────────────────────────────────────
//
// Shared helpers for where a component sits on the board, split out so both the
// part renderer (part-models.tsx) and the GLB pin-fit (glb-parts.tsx) can use
// them without a circular import.
//
// `footprintCenter`/`rotationYaw` drive the PartMesh group placement (warped
// centroid + 90° yaw). `footprintPinTargets` returns each pin's *warped* world
// hole — the target the pin calibration fits the model's pins onto.

import type { BoardComponent } from "@dreamer/schemas"
import { getComponentFootprint, type GridPoint } from "@/breadboard/breadboard-grid"
import type { WorldPoint } from "./layout"
import { warpedGridXZ } from "./breadboard-grid-calibration"
import { fitSimilarity2D, type P2, type Similarity2D } from "./similarity-2d"

export function componentFootprint(component: BoardComponent) {
  return getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  )
}

/** World-space centroid of the holes a component occupies, on the *warped*
 *  (calibrated) grid — so a non-pin-fitted part (e.g. the LED, sized by heightMm)
 *  seats on the same holes the pin fit targets. For pin-fitted parts this centroid
 *  cancels out of the fit (the fit subtracts it and PartMesh adds it back), so it
 *  is only load-bearing for the non-fit placement. */
export function footprintCenter(component: BoardComponent): WorldPoint {
  const fp = componentFootprint(component)
  if (fp.points.length === 0) {
    const w = warpedGridXZ(component.y, component.x)
    return { x: w.x, z: w.z }
  }
  let sx = 0
  let sz = 0
  for (const point of fp.points) {
    const w = warpedGridXZ(point.row, point.col)
    sx += w.x
    sz += w.z
  }
  return { x: sx / fp.points.length, z: sz / fp.points.length }
}

/** Yaw for the component's 90°-step rotation (2D rotates CW; world y is CCW). */
export function rotationYaw(rotation: number): number {
  const steps = ((rotation % 4) + 4) % 4
  return -steps * (Math.PI / 2)
}

/** Warped world (x,z) target for each footprint pin/hole, in footprint order.
 *  These are the holes the pin calibration aligns a GLB model's pins onto. */
export function footprintPinTargets(component: BoardComponent): WorldPoint[] {
  const fp = componentFootprint(component)
  return fp.points.map((p) => {
    const w = warpedGridXZ(p.row, p.col)
    return { x: w.x, z: w.z }
  })
}

/** Which grid axis the pins run along (row vs col) and the step direction. */
function pinAxis(points: GridPoint[]): { alongRow: boolean; sign: number } {
  const first = points[0]
  const last = points[points.length - 1]
  const dR = last.row - first.row
  const dC = last.col - first.col
  const alongRow = Math.abs(dR) >= Math.abs(dC)
  const sign = (alongRow ? Math.sign(dR) : Math.sign(dC)) || 1
  return { alongRow, sign }
}

/** Default (footprint) hole gaps between consecutive pins of a nominal
 *  placement — what the panel shows before the user overrides them. */
export function footprintGaps(type: string): number[] {
  const pts = getComponentFootprint(type, 0, 0, 0).points
  if (pts.length < 2) return []
  const { alongRow } = pinAxis(pts)
  const gaps: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const cur = pts[i]
    gaps.push(Math.abs(alongRow ? cur.row - prev.row : cur.col - prev.col))
  }
  return gaps
}

/** Warped world targets with the footprint spacing replaced by explicit hole
 *  `gaps` between consecutive pins. Pins step along the footprint's pin axis
 *  from pin 0; the perpendicular coordinate is kept from the footprint. */
export function footprintPinTargetsWithGaps(
  component: BoardComponent,
  gaps: number[],
): WorldPoint[] {
  const fp = componentFootprint(component)
  const pts = fp.points
  if (pts.length < 2) return footprintPinTargets(component)
  const { alongRow, sign } = pinAxis(pts)
  const base = pts[0]
  let cum = 0
  return pts.map((p, i) => {
    if (i > 0) cum += gaps[i - 1] ?? 1
    const row = alongRow ? base.row + sign * cum : p.row
    const col = alongRow ? p.col : base.col + sign * cum
    const w = warpedGridXZ(row, col)
    return { x: w.x, z: w.z }
  })
}

/** Fit that maps a type's captured model pins (normalized frame) onto this
 *  instance's warped footprint holes — the calibration transform glb-parts
 *  renders with. Expressed in the PartMesh-local frame (footprint centroid + yaw
 *  undone) so it composes under the PartMesh group. Null when uncalibrated or
 *  the anchor count doesn't match the footprint. Shared by the renderer and the
 *  wire-obstacle volume so both place a part identically. */
export function computePinFit(
  component: BoardComponent,
  cal: { pins: P2[]; gaps?: number[] } | undefined,
): Similarity2D | null {
  if (!cal || cal.pins.length < 2) return null
  const targets = cal.gaps
    ? footprintPinTargetsWithGaps(component, cal.gaps)
    : footprintPinTargets(component)
  if (targets.length !== cal.pins.length) return null
  const center = footprintCenter(component)
  const yaw = rotationYaw(component.rotation)
  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const dst = targets.map((t) => {
    const rx = t.x - center.x
    const rz = t.z - center.z
    // R_y(-yaw) · rel — undo PartMesh's yaw so the fit is in its local frame.
    return { x: rx * cosY - rz * sinY, z: rx * sinY + rz * cosY }
  })
  const fit = fitSimilarity2D(cal.pins, dst)
  // A degenerate calibration (targets collapsed onto one hole, junk pins)
  // fits to a near-zero or absurd scale, rendering the part invisible or
  // enormous. An honest model→holes fit is near 1; outside a generous band,
  // fall back to the uncalibrated (visible) placement instead.
  const sane =
    Number.isFinite(fit.scale) &&
    Number.isFinite(fit.tx) &&
    Number.isFinite(fit.tz) &&
    fit.scale > 0.2 &&
    fit.scale < 5
  return sane ? fit : null
}
