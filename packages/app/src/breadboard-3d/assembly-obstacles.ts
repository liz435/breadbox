// ── Uploaded-model wire obstacles ────────────────────────────────────────────
//
// Imported assembly bodies live outside BoardState.components, so the regular
// part-obstacle builder cannot see them. Convert the live roots of visible
// assembly-body trees into conservative world-space boxes for the wire router.
// The boxes deliberately use world AABBs: they may make a wire arc a little
// wider around a rotated upload, but they can never let it pass through it.

import { useMemo, useSyncExternalStore } from "react"
import { useAssemblyDoc } from "./use-assembly"
import { getBodyVolumeRoot, getRegistryVersion, subscribeRegistry } from "./scene-registry"
import type { PartObstacle } from "./part-obstacles"
import { assemblyObstacles } from "./assembly-obstacle-model"

export { assemblyObstacles } from "./assembly-obstacle-model"

/** Live uploaded-model obstacles. Registry updates cover model load/unload;
 * assembly updates cover transforms, visibility, parenting, and deletion. */
export function useAssemblyObstacles(): PartObstacle[] {
  const assembly = useAssemblyDoc()
  const registryVersion = useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion)
  const resolveBodyVolumeRoot =
    typeof getBodyVolumeRoot === "function" ? getBodyVolumeRoot : undefined
  return useMemo(
    () => assemblyObstacles(assembly.bodies, resolveBodyVolumeRoot),
    [assembly.bodies, registryVersion, resolveBodyVolumeRoot],
  )
}
