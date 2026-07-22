// ── Pure uploaded-model obstacle geometry ───────────────────────────────────

import { Box3, Vector3 } from "three"
import type { AssemblyBody } from "@dreamer/schemas"
import type { Object3D } from "three"
import type { PartObstacle } from "./part-obstacles"

/** Build conservative wire obstacles for each visible root in the assembly
 * hierarchy. Descendants are already measured inside their root's Box3, so
 * emitting them again only causes duplicate route constraints. */
export function assemblyObstacles(
  bodies: Record<string, AssemblyBody>,
  rootForBody?: (id: string) => Object3D | undefined,
): PartObstacle[] {
  const obstacles: PartObstacle[] = []
  for (const body of Object.values(bodies)) {
    if (body.hidden || body.parent.kind === "body") continue
    // A root appears only after its model has mounted. Treat a transient
    // missing resolver the same way, rather than crashing the whole canvas.
    const root = rootForBody?.(body.id)
    if (!root) continue
    root.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(root)
    if (box.isEmpty()) continue
    const center = box.getCenter(new Vector3())
    const halfX = Math.max(0.1, (box.max.x - box.min.x) / 2)
    const halfZ = Math.max(0.1, (box.max.z - box.min.z) / 2)
    obstacles.push({
      kind: "obb",
      // Uploaded bodies are not wire endpoints, so never exempt an endpoint
      // from clearing them. A zero pin spread gives endpointOnObstacle false.
      x: center.x,
      z: center.z,
      coreRadius: 0,
      obb: {
        cx: center.x,
        cz: center.z,
        ux: halfX,
        uz: 0,
        vx: 0,
        vz: halfZ,
        topY: box.max.y,
      },
    })
  }
  return obstacles
}
