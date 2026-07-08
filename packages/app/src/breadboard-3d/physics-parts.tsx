// ── Physics parts ────────────────────────────────────────────────────────────
//
// The physics-mode replacement for <Parts>. Each placed part becomes a dynamic
// RigidBody that drops onto the board and settles (placement juice), and can be
// grabbed and dragged across the boards. On release it snaps to the nearest
// hole and commits back to the board state (MOVE_COMPONENT, plus a parentId
// UPDATE when it lands on a different breadboard) — so the 2D canvas, saves and
// the simulator only ever see settled grid positions. Rotation is locked (parts
// plug in pins-down at their grid orientation), so a dragged part slides rather
// than tipping over.

import { useCallback, useEffect, useMemo, useRef } from "react"
import type { Group } from "three"
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier"
import type { BoardComponent } from "@dreamer/schemas"
import { isBoardComponentType } from "@dreamer/schemas"
import { useBoard, useBoardSelector } from "@/store/board-context"
import type { BoardEvent } from "@/store/board-machine"
import { offsetToWorld, partBoardOffset, surfaceBoardsOf } from "./board-offsets"
import { PartBody, partPlacement } from "./part-models"
import { partColliderBox, PART_REST_Y, resolvePartDrop } from "./physics-model"
import { wakePhysics } from "./physics-activity"
import { useBodyDrag } from "./use-body-drag"
import { registerPartNodes } from "./scene-registry"

/** How far above its resting hole a part is spawned so it visibly drops in. */
const DROP_HEIGHT_MM = 14

function PhysicsPart({
  component,
  boardOffset,
  surfaceBoards,
  send,
}: {
  component: BoardComponent
  boardOffset: { x: number; z: number }
  surfaceBoards: BoardComponent[]
  send: (event: BoardEvent) => void
}) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const rootRef = useRef<Group>(null)
  const { x, z, yaw } = partPlacement(component, boardOffset)
  const collider = useMemo(() => partColliderBox(component), [component])

  // Register the part's root so the signal-driven animation loop and
  // component-parented bodies still find it (physics drives the body, the loop
  // drives child nodes — no conflict).
  useEffect(() => {
    if (!rootRef.current) return
    return registerPartNodes(component.id, { rootNode: rootRef.current })
  }, [component.id])

  const onRelease = useCallback(
    (position: { x: number; y: number; z: number }) => {
      const drop = resolvePartDrop(position.x, position.z, surfaceBoards)
      const currentParent = component.parentId ?? null
      if (drop.parentId !== currentParent) {
        send({ type: "UPDATE_COMPONENT", id: component.id, changes: { parentId: drop.parentId } })
      }
      send({ type: "MOVE_COMPONENT", id: component.id, x: drop.x, y: drop.y })
    },
    [component.id, component.parentId, surfaceBoards, send],
  )

  const { dragging, onPointerDown } = useBodyDrag(bodyRef, onRelease)

  // Snap the body to its committed grid position whenever the target moves —
  // our own drag-commit, a 2D-canvas edit, or an MCP tool. Skipped on the first
  // render (the initial spawn is the RigidBody's `position` prop) and while the
  // user is actively dragging.
  const lastTarget = useRef({ x, z })
  useEffect(() => {
    const body = bodyRef.current
    if (!body || dragging) return
    if (lastTarget.current.x === x && lastTarget.current.z === z) return
    lastTarget.current = { x, z }
    body.setTranslation({ x, y: PART_REST_Y + DROP_HEIGHT_MM * 0.5, z }, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    wakePhysics()
  }, [x, z, dragging])

  return (
    <RigidBody
      ref={bodyRef}
      type={dragging ? "kinematicPosition" : "dynamic"}
      colliders={false}
      position={[x, PART_REST_Y + DROP_HEIGHT_MM, z]}
      rotation={[0, yaw, 0]}
      enabledRotations={[false, false, false]}
      linearDamping={0.4}
    >
      <group ref={rootRef} onPointerDown={onPointerDown}>
        <PartBody component={component} />
      </group>
      <CuboidCollider args={collider.halfExtents} position={[0, collider.offsetY, 0]} />
    </RigidBody>
  )
}

export function PhysicsParts() {
  const components = useBoardSelector((ctx) => ctx.components)
  const { send } = useBoard()
  const surfaceBoards = useMemo(() => surfaceBoardsOf(components), [components])
  const parts = useMemo(
    () => Object.values(components).filter((c) => !isBoardComponentType(c.type)),
    [components],
  )

  // Any change to the placed set means something needs to (re)settle.
  useEffect(() => {
    wakePhysics()
  }, [parts.length])

  return (
    <group name="physics-parts">
      {parts.map((component) => (
        <PhysicsPart
          key={component.id}
          component={component}
          boardOffset={offsetToWorld(partBoardOffset(component, surfaceBoards))}
          surfaceBoards={surfaceBoards}
          send={send}
        />
      ))}
    </group>
  )
}
