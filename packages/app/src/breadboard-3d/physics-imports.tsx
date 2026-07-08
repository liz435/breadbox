// ── Physics imported bodies ──────────────────────────────────────────────────
//
// Free-standing imported props (world-parented, no signal-bound joint) become
// dynamic RigidBodies with an auto-generated convex-hull collider: they fall,
// collide with the boards and each other, tumble freely (full 6-DOF), and can
// be dragged. Unlike breadboard parts there is no grid to snap to, so a drag
// commits the body's free resting pose straight back to `body.transform`. The
// initial gravity settle is pure visual juice and is not persisted — only a
// user drag writes state, so saves stay stable.
//
// Component-parented, body-parented, and jointed bodies are NOT here: those
// keep rendering through <UploadedBodies> (for their portal/animation wiring)
// and get kinematic collider proxies from <PhysicsFollowers>.

import { Suspense, useCallback, useEffect, useRef } from "react"
import { Euler, Quaternion, type Group } from "three"
import { RigidBody, type RapierRigidBody } from "@react-three/rapier"
import { scaleToVec3, type AssemblyBody } from "@dreamer/schemas"
import { useAssemblyActions, useAssemblyDoc } from "./use-assembly"
import { assemblyBodyPhysicsKind } from "./physics-model"
import { wakePhysics } from "./physics-activity"
import { useBodyDrag } from "./use-body-drag"
import { useEditor } from "./editor-state"
import { BodyModel, BodyNode } from "./uploaded-bodies"

function PhysicsBody({
  body,
  childrenOf,
}: {
  body: AssemblyBody
  childrenOf: (id: string) => AssemblyBody[]
}) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const { updateBody } = useAssemblyActions()
  const { select } = useEditor()

  const onRelease = useCallback(() => {
    const rb = bodyRef.current
    if (!rb) return
    const t = rb.translation()
    const q = rb.rotation()
    const euler = new Euler().setFromQuaternion(new Quaternion(q.x, q.y, q.z, q.w))
    updateBody(body.id, {
      transform: {
        position: [t.x, t.y, t.z],
        rotation: [euler.x, euler.y, euler.z],
        // Physics never changes scale; keep the user's authored value.
        scale: body.transform.scale,
      },
    })
  }, [body.id, body.transform.scale, updateBody])

  const { onPointerDown } = useBodyDrag(bodyRef, onRelease)

  // Let the freshly-mounted body settle under gravity.
  useEffect(() => {
    wakePhysics()
  }, [])

  return (
    <RigidBody
      ref={bodyRef}
      colliders="hull"
      position={body.transform.position}
      rotation={body.transform.rotation}
      canSleep
    >
      <group
        scale={scaleToVec3(body.transform.scale)}
        onClick={(event) => {
          event.stopPropagation()
          select(body.id)
        }}
        onPointerDown={onPointerDown}
      >
        <BodyModel body={body} />
        {/* Bodies bolted onto this one ride inside the same RigidBody, so
            their meshes join the hull collider and they move rigidly with it. */}
        {childrenOf(body.id).map((child) => (
          <BodyNode key={child.id} body={child} childrenOf={childrenOf} />
        ))}
      </group>
    </RigidBody>
  )
}

export function PhysicsBodies() {
  const assembly = useAssemblyDoc()
  const bodies = Object.values(assembly.bodies)
  const childrenOf = (id: string) =>
    bodies.filter((b) => b.parent.kind === "body" && b.parent.bodyId === id)
  const dynamic = bodies.filter((body) => assemblyBodyPhysicsKind(body) === "dynamic")
  return (
    <group name="physics-bodies">
      {dynamic.map((body) => (
        // The model loads over Suspense; the RigidBody mounts once its meshes
        // exist so the hull collider is built from real geometry.
        <Suspense key={body.id} fallback={null}>
          <PhysicsBody body={body} childrenOf={childrenOf} />
        </Suspense>
      ))}
    </group>
  )
}
