// ── Sim-driven kinematic followers ───────────────────────────────────────────
//
// A servo horn, a motor shaft, or a signal-driven imported joint is moved by
// the simulator (the animation loop writes those Object3Ds imperatively). To
// let that motion push the dynamic bodies around — a spinning motor batting a
// loose part across the desk — each moving node gets a kinematic collider proxy
// that copies the node's live world transform every frame. Kinematic bodies are
// never moved by the solver, only by us, so they act as immovable drivers.
//
// The collider is a rough box measured once from the node's bounds, centered on
// the node origin — enough to shove neighbours, not a faithful mesh. Followers
// piggyback on the frames the animation loop already requests, and only keep
// the solver awake while their node is actually moving.

import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { Object3D } from "three"
import { Box3, Quaternion, Vector3 } from "three"
import { useFrame } from "@react-three/fiber"
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier"
import { useBoardSelector } from "@/store/board-context"
import { useAssemblyDoc } from "./use-assembly"
import { assemblyBodyPhysicsKind } from "./physics-model"
import { GROUP_DRIVER } from "./physics-groups"
import { wakePhysics } from "./physics-activity"
import {
  getBodyJoint,
  getBodyRoot,
  getPartNodes,
  getRegistryVersion,
  subscribeRegistry,
} from "./scene-registry"

type FollowerTarget = { key: string; getNode: () => Object3D | undefined }

function KinematicProxy({ getNode }: { getNode: () => Object3D | undefined }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const [half, setHalf] = useState<[number, number, number] | null>(null)
  const pos = useMemo(() => new Vector3(), [])
  const quat = useMemo(() => new Quaternion(), [])
  const box = useMemo(() => new Box3(), [])
  const lastPos = useRef(new Vector3())

  useFrame(() => {
    const node = getNode()
    if (!node) return
    // Measure the collider once the node exists; the RigidBody then mounts on
    // the next render and starts following.
    if (!half) {
      box.setFromObject(node)
      if (box.isEmpty()) return
      const size = box.getSize(new Vector3())
      setHalf([
        Math.max(0.5, size.x / 2),
        Math.max(0.5, size.y / 2),
        Math.max(0.5, size.z / 2),
      ])
      return
    }
    const body = bodyRef.current
    if (!body) return
    node.getWorldPosition(pos)
    node.getWorldQuaternion(quat)
    body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z })
    body.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
    // Keep the solver awake only while the driver is actually moving.
    if (pos.distanceToSquared(lastPos.current) > 1e-4) {
      wakePhysics()
      lastPos.current.copy(pos)
    }
  })

  if (!half) return null
  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} collisionGroups={GROUP_DRIVER}>
      <CuboidCollider args={half} />
    </RigidBody>
  )
}

export function PhysicsFollowers() {
  const components = useBoardSelector((ctx) => ctx.components)
  const assembly = useAssemblyDoc()
  // Re-render as moving nodes register/unregister so proxies attach on time.
  useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion)

  const targets = useMemo<FollowerTarget[]>(() => {
    const list: FollowerTarget[] = []
    for (const component of Object.values(components)) {
      if (component.type === "servo") {
        list.push({ key: `${component.id}:angle`, getNode: () => getPartNodes(component.id)?.angleNode })
      }
      if (component.type === "dc_motor") {
        list.push({ key: `${component.id}:spin`, getNode: () => getPartNodes(component.id)?.spinNode })
      }
    }
    for (const body of Object.values(assembly.bodies)) {
      if (assemblyBodyPhysicsKind(body) !== "kinematic") continue
      list.push({
        key: `body:${body.id}`,
        getNode: () => getBodyJoint(body.id) ?? getBodyRoot(body.id),
      })
    }
    return list
  }, [components, assembly])

  return (
    <group name="physics-followers">
      {targets.map((target) => (
        <KinematicProxy key={target.key} getNode={target.getNode} />
      ))}
    </group>
  )
}
