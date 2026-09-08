// ── Physics showcase box ────────────────────────────────────────────────────
//
// A procedural, asset-free prop for demonstrating the 3D physics layer. It is
// deliberately an AssemblyBody so it uses the same dynamic-body, drag,
// selection, persistence, and collision paths as an imported model.

import type { AssemblyBody, BoardComponent } from "@dreamer/schemas"
import { BOARD_SURFACE_Y } from "./layout"
import { partBoardOffset, offsetToWorld, surfaceBoardsOf } from "./board-offsets"
import { partColliderBox } from "./physics-model"
import { partPlacement } from "./part-models"
import { uniqueBodyId } from "./assembly-edits"

export const SHOWCASE_BOX_SIZE_MM = 26
export const SHOWCASE_BOX_DROP_HEIGHT_MM = 150

/** Create a box above and just beside the first servo, ready to fall. */
export function createShowcaseBox(
  bodies: Record<string, AssemblyBody>,
  components: Record<string, BoardComponent>,
): AssemblyBody {
  const servo = Object.values(components).find((component) => component.type === "servo")
  let x = 0
  let z = 0
  let yaw = 0

  if (servo) {
    const surfaces = surfaceBoardsOf(components)
    const boardOffset = offsetToWorld(partBoardOffset(servo, surfaces))
    const placement = partPlacement(servo, boardOffset)
    const servoHalfWidth = partColliderBox(servo).halfExtents[0]
    // Offset along the servo's local X axis so the box lands next to the
    // housing and can still make contact with it, instead of spawning on top.
    const lateral = servoHalfWidth + SHOWCASE_BOX_SIZE_MM / 2 + 4
    x = placement.x + Math.cos(placement.yaw) * lateral
    z = placement.z - Math.sin(placement.yaw) * lateral
    yaw = placement.yaw
  }

  return {
    id: uniqueBodyId(bodies, "showcase-box"),
    name: "Physics showcase box",
    primitive: "box",
    parent: { kind: "world" },
    transform: {
      position: [x, BOARD_SURFACE_Y + SHOWCASE_BOX_DROP_HEIGHT_MM, z],
      // A small tilt makes the free-fall and final contact visibly physical.
      rotation: [0.2, yaw + 0.3, -0.12],
      scale: 1,
    },
    importScale: 1,
    upAxis: "y",
  }
}
