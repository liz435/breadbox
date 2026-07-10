// ── Part placement frame ─────────────────────────────────────────────────────
//
// Shared helpers for where a component sits on the board, split out so both the
// part renderer (part-models.tsx) and the GLB pin-fit (glb-parts.tsx) can use
// them without a circular import.
//
// `footprintCenter`/`rotationYaw` drive the PartMesh group placement (unwarped
// centroid + 90° yaw). `footprintPinTargets` returns each pin's *warped* world
// hole — the target the pin calibration fits the model's pins onto.

import type { BoardComponent } from "@dreamer/schemas"
import { getComponentFootprint, gridToPixel, type GridPoint } from "@/breadboard/breadboard-grid"
import { pixelToWorld, type WorldPoint } from "./layout"
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

/** World-space centroid of the holes a component occupies (unwarped — matches
 *  the grid the PartMesh group is placed on). */
export function footprintCenter(component: BoardComponent): WorldPoint {
  const fp = componentFootprint(component)
  if (fp.points.length === 0) {
    const anchor = gridToPixel({ row: component.y, col: component.x })
    return pixelToWorld(anchor.x, anchor.y)
  }
  let sx = 0
  let sy = 0
  for (const point of fp.points) {
    const px = gridToPixel(point)
    sx += px.x
    sy += px.y
  }
  return pixelToWorld(sx / fp.points.length, sy / fp.points.length)
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
  return fitSimilarity2D(cal.pins, dst)
}
