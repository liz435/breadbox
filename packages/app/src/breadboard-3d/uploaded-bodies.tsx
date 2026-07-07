// ── Uploaded assembly bodies ────────────────────────────────────────────────
//
// Renders the assembly doc's bodies: meshes the user uploaded, placed by
// their transform, nested by parenting. A body parented onto a component's
// moving node (servo horn, motor shaft) is portaled into that node's
// Object3D, so simulator-driven motion carries the body — and everything
// bolted to it — for free.

import { Component, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { createPortal, useLoader } from "@react-three/fiber"
import type { Group, Object3D } from "three"
import { GLTFLoader, STLLoader } from "three-stdlib"
import { API_ORIGIN } from "@dreamer/config"
import type { AssemblyBody, Vec3 } from "@dreamer/schemas"
import { useAssemblyDoc } from "./use-assembly"
import {
  getPartNodes,
  getRegistryVersion,
  registerBodyJoint,
  subscribeRegistry,
} from "./scene-registry"

/** Swallows loader failures (bad file, deleted asset) for a single body so
 * one broken mesh can't blank the whole scene. DOM fallbacks don't render
 * inside the Canvas, so the fallback is simply nothing. */
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: unknown): void {
    console.warn("[breadboard-3d] failed to load model:", error)
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

function StlModel({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url)
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#90a4ae" roughness={0.6} />
    </mesh>
  )
}

function GlbModel({ url, node }: { url: string; node?: string }) {
  const gltf = useLoader(GLTFLoader, url)
  // Clone so several bodies can reference the same cached file (or different
  // nodes of it) without fighting over one Object3D instance.
  const object = useMemo(() => {
    const source = node ? gltf.scene.getObjectByName(node) : gltf.scene
    return source ? source.clone(true) : null
  }, [gltf, node])
  if (!object) return null
  return <primitive object={object} />
}

/** Import normalisation: unit fix-up and z-up → y-up, applied inside the
 * user transform so gizmo edits stay in sane mm space. */
function BodyModel({ body }: { body: AssemblyBody }) {
  const url = `${API_ORIGIN}${body.uri}`
  const upFix: [number, number, number] =
    body.upAxis === "z" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
  return (
    <group rotation={upFix} scale={body.importScale}>
      <ModelErrorBoundary>
        {body.format === "stl" ? <StlModel url={url} /> : <GlbModel url={url} node={body.node} />}
      </ModelErrorBoundary>
    </group>
  )
}

/** Pivot sandwich: rotate `children` around `pivot` via the registered joint
 * group (the signal loop writes the rotation imperatively). */
function JointGroup({
  bodyId,
  pivot,
  children,
}: {
  bodyId: string
  pivot: Vec3
  children: ReactNode
}) {
  const jointRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!jointRef.current) return
    return registerBodyJoint(bodyId, jointRef.current)
  }, [bodyId])
  return (
    <group position={pivot}>
      <group ref={jointRef}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>{children}</group>
      </group>
    </group>
  )
}

function BodyNode({
  body,
  childrenOf,
}: {
  body: AssemblyBody
  childrenOf: (id: string) => AssemblyBody[]
}) {
  const content = (
    <>
      <BodyModel body={body} />
      {childrenOf(body.id).map((child) => (
        <BodyNode key={child.id} body={child} childrenOf={childrenOf} />
      ))}
    </>
  )
  return (
    <group
      name={`assembly-body-${body.id}`}
      position={body.transform.position}
      rotation={body.transform.rotation}
      scale={body.transform.scale}
    >
      {body.joint ? (
        <JointGroup bodyId={body.id} pivot={body.joint.pivot}>
          {content}
        </JointGroup>
      ) : (
        content
      )}
    </group>
  )
}

/** Resolve the Object3D a component-parented body mounts into. */
function componentTarget(
  componentId: string,
  node: "body" | "angle" | "spin",
): Object3D | undefined {
  const nodes = getPartNodes(componentId)
  if (!nodes) return undefined
  if (node === "angle") return nodes.angleNode
  if (node === "spin") return nodes.spinNode
  return nodes.rootNode
}

export function UploadedBodies() {
  const assembly = useAssemblyDoc()
  // Re-render when scene nodes register so component-parented bodies mount
  // as soon as their target part appears.
  useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion)

  const bodies = Object.values(assembly.bodies)
  const childrenOf = (id: string) =>
    bodies.filter((b) => b.parent.kind === "body" && b.parent.bodyId === id)

  return (
    <group name="assembly-bodies">
      {bodies
        .filter((b) => b.parent.kind === "world")
        .map((body) => (
          <BodyNode key={body.id} body={body} childrenOf={childrenOf} />
        ))}
      {bodies
        .filter((b) => b.parent.kind === "component")
        .map((body) => {
          const parent = body.parent
          if (parent.kind !== "component") return null
          const target = componentTarget(parent.componentId, parent.node)
          if (!target) return null
          return (
            <group key={body.id}>
              {createPortal(<BodyNode body={body} childrenOf={childrenOf} />, target)}
            </group>
          )
        })}
    </group>
  )
}
