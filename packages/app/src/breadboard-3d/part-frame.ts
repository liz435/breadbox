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
import { getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid"
import { pixelToWorld, type WorldPoint } from "./layout"
import { warpedGridXZ } from "./breadboard-grid-calibration"

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
