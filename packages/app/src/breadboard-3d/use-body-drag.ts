// ── Drag a physics body across the board ─────────────────────────────────────
//
// Grabbing a body makes it kinematic and slides it along a horizontal plane at
// its current height (so it rides over other bodies rather than shoving through
// them); on release the caller decides where it lands and the body goes dynamic
// again. Pointer-move/up are bound to the canvas + window for the duration of
// the drag — NOT to the body's mesh — because r3f only fires mesh pointer
// events while the cursor is actually over that mesh, and a dragged part spends
// most of the gesture off its own tiny footprint. The move ray is rebuilt from
// the camera each event. `dragging` is returned so the caller can flip the
// RigidBody's `type` prop to `kinematicPosition`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import { Plane, Vector2, Vector3 } from "three"
import { useThree } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
import type { RapierRigidBody } from "@react-three/rapier"
import { setPhysicsDragging, wakePhysics } from "./physics-activity"

const UP = new Vector3(0, 1, 0)

/** The active camera controls expose `enabled`; we flip it off during a drag so
 *  grabbing a part doesn't also orbit the camera. */
type ToggleableControls = { enabled: boolean }
function isToggleable(controls: unknown): controls is ToggleableControls {
  return !!controls && typeof (controls as { enabled?: unknown }).enabled === "boolean"
}

export function useBodyDrag(
  bodyRef: RefObject<RapierRigidBody | null>,
  onRelease: (position: { x: number; y: number; z: number }) => void,
): { dragging: boolean; onPointerDown: (event: ThreeEvent<PointerEvent>) => void } {
  const [dragging, setDragging] = useState(false)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const raycaster = useThree((state) => state.raycaster)
  const controls = useThree((state) => state.controls)
  const plane = useMemo(() => new Plane(), [])
  const hit = useMemo(() => new Vector3(), [])
  const ndc = useMemo(() => new Vector2(), [])
  const planeY = useRef(0)
  const cleanup = useRef<(() => void) | null>(null)
  /** Did the pointer actually move the body? A bare click must not commit. */
  const moved = useRef(false)

  const endDrag = useCallback(() => {
    cleanup.current?.()
    cleanup.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const body = bodyRef.current
      if (!body) return
      event.stopPropagation()
      // A second pointerdown before the first gesture ended would overwrite
      // cleanup.current and strand the previous move listener.
      endDrag()
      setDragging(true)
      setPhysicsDragging(true)
      moved.current = false
      planeY.current = body.translation().y
      // Stop the camera from orbiting while we drag the part.
      if (isToggleable(controls)) controls.enabled = false

      const dom = gl.domElement
      const move = (native: PointerEvent) => {
        const dragged = bodyRef.current
        if (!dragged) return
        const rect = dom.getBoundingClientRect()
        ndc.set(
          ((native.clientX - rect.left) / rect.width) * 2 - 1,
          -((native.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        plane.set(UP, -planeY.current)
        if (raycaster.ray.intersectPlane(plane, hit)) {
          moved.current = true
          dragged.setNextKinematicTranslation({ x: hit.x, y: planeY.current, z: hit.z })
          wakePhysics()
        }
      }
      const up = () => {
        const dragged = bodyRef.current
        const dragMoved = moved.current
        // Reads the kinematic pose: endDrag only schedules the React state
        // change that flips the body back to dynamic.
        const t = dragged?.translation()
        endDrag()
        // A click that never moved the pointer is a selection, not a drag.
        // Committing here would persist wherever gravity happened to settle
        // the body, overwriting the user's authored transform.
        if (dragged && t && dragMoved) onRelease({ x: t.x, y: t.y, z: t.z })
        wakePhysics()
      }

      dom.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up, { once: true })
      // A cancelled pointer (touch cancel, window losing the pointer) never
      // fires pointerup. Without this the body stays kinematic mid-air, the
      // camera stays disabled, and the drag flag pins physics awake forever.
      window.addEventListener("pointercancel", endDrag, { once: true })
      cleanup.current = () => {
        dom.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", endDrag)
        setDragging(false)
        // MUST clear the global flag here, not only in `up`: the sleep watcher
        // refuses to sleep while a drag is in flight, so an unmount or a
        // cancelled pointer mid-drag would pin frameloop="always" for the rest
        // of the session.
        setPhysicsDragging(false)
        // Hand control of the camera back — also covers unmount mid-drag.
        if (isToggleable(controls)) controls.enabled = true
      }
    },
    [bodyRef, camera, gl, raycaster, controls, plane, hit, ndc, onRelease, endDrag],
  )

  // Drop listeners and clear the drag flag if the body unmounts mid-drag.
  useEffect(() => endDrag, [endDrag])

  return { dragging, onPointerDown }
}
