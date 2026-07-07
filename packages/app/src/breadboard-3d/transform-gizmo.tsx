// ── Transform gizmo ─────────────────────────────────────────────────────────
//
// drei's TransformControls attached to the selected body's transform-root
// group. The drag mutates the Object3D directly (drei disables the camera
// controls while dragging); the final pose is committed to the assembly doc
// on mouse-up, so each drag is exactly one undo entry.

import { useSyncExternalStore } from "react"
import { TransformControls } from "@react-three/drei"
import { useAssemblyActions } from "./use-assembly"
import { useEditor } from "./editor-state"
import { getBodyRoot, getRegistryVersion, subscribeRegistry } from "./scene-registry"

export function TransformGizmo() {
  const { selectedBodyId, mode } = useEditor()
  const { updateBody } = useAssemblyActions()
  // Re-render when scene nodes change so the gizmo attaches/detaches as
  // bodies mount and unmount.
  useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion)

  const target = selectedBodyId ? getBodyRoot(selectedBodyId) : undefined
  if (!target || !selectedBodyId) return null

  return (
    <TransformControls
      object={target}
      mode={mode}
      onMouseUp={() => {
        // Collapse to a single factor when the axes agree (the common case),
        // else keep the per-axis triple the scale gizmo produced.
        const { x, y, z } = target.scale
        const uniform = Math.abs(x - y) < 1e-4 && Math.abs(x - z) < 1e-4
        updateBody(selectedBodyId, {
          transform: {
            position: [target.position.x, target.position.y, target.position.z],
            rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
            scale: uniform ? x : [x, y, z],
          },
        })
      }}
    />
  )
}
