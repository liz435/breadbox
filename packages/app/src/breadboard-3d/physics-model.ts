// ── Physics model (pure) ─────────────────────────────────────────────────────
//
// The deterministic core of the Rapier layer, kept free of three.js/React so
// it can be unit-tested: how an imported body maps to a Rapier body type, the
// collider box for a placed part, and where a dragged part snaps back onto the
// grid. The r3f/rapier glue (physics-parts, physics-imports, physics-context)
// builds on these.

import type { AssemblyBody, BoardComponent } from "@dreamer/schemas"
import { getComponentFootprint, pixelToGrid } from "@/breadboard/breadboard-grid"
import { boardAtPoint } from "@/breadboard/use-breadboard-drag"
import { BOARD_SURFACE_Y, pxToMm, worldToPixel } from "./layout"
import { partHeightMm } from "./part-obstacles"

/**
 * How an imported assembly body participates in the physics world:
 *  - `dynamic`   — free prop (world-parented, no joint): falls, collides, is
 *                  draggable, tumbles freely.
 *  - `attached`  — bolted onto another body: contributes its collider to the
 *                  parent's rigid body and inherits its motion.
 *  - `kinematic` — driven by the simulator (parented onto a component's moving
 *                  node, or moved by a signal-bound joint): an immovable driver
 *                  that shoves dynamic bodies but is never moved by physics.
 */
export type PhysicsKind = "dynamic" | "attached" | "kinematic"

export function assemblyBodyPhysicsKind(body: AssemblyBody): PhysicsKind {
  // A signal-bound joint means the sim moves it — kinematic regardless of how
  // it is parented.
  if (body.joint) return "kinematic"
  if (body.parent.kind === "component") return "kinematic"
  if (body.parent.kind === "body") return "attached"
  return "dynamic"
}

/** A placed part's collider: a box sitting on the board surface. Half-extents
 *  in mm; `offsetY` places the box centre above the body origin (the base,
 *  which rests on the surface), matching how PartMesh draws the body upward
 *  from y=0. */
export type PartColliderBox = {
  halfExtents: [number, number, number]
  offsetY: number
}

export function partColliderBox(component: BoardComponent): PartColliderBox {
  const fp = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  )
  const halfWidth = Math.max(1, pxToMm(fp.width) / 2)
  const halfDepth = Math.max(1, pxToMm(fp.height) / 2)
  const height = partHeightMm(component.type)
  return {
    halfExtents: [halfWidth, height / 2, halfDepth],
    offsetY: height / 2,
  }
}

/** Y of a part's base (where its RigidBody origin sits when at rest). */
export const PART_REST_Y = BOARD_SURFACE_Y

/** Grid + parent a dragged part resolves to when released at a world position.
 *  Mirrors the 2D canvas drop: whichever surface board's footprint the release
 *  point lands on owns the part, and its grid coords are stored local to that
 *  board's origin; off every board it falls back to the global grid, no parent. */
export type PartDropTarget = { x: number; y: number; parentId: string | null }

export function resolvePartDrop(
  worldX: number,
  worldZ: number,
  surfaceBoards: BoardComponent[],
): PartDropTarget {
  const px = worldToPixel(worldX, worldZ)
  const overBoard = boardAtPoint(px.x, px.y, surfaceBoards)
  if (overBoard) {
    const local = pixelToGrid(px.x - (overBoard.worldX ?? 0), px.y - (overBoard.worldY ?? 0))
    return { x: local.col, y: local.row, parentId: overBoard.id }
  }
  const grid = pixelToGrid(px.x, px.y)
  return { x: grid.col, y: grid.row, parentId: null }
}
