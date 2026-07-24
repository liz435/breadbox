// ── Uploaded assembly bodies ────────────────────────────────────────────────
//
// Renders the assembly doc's bodies: meshes the user uploaded, placed by
// their transform, nested by parenting. A body parented onto a component's
// moving node (servo horn, motor shaft) is portaled into that node's
// Object3D, so simulator-driven motion carries the body — and everything
// bolted to it — for free.

import { Component, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { createPortal, useLoader } from "@react-three/fiber"
import { AnimationMixer, Mesh, MeshStandardMaterial } from "three"
import type { Group, Object3D } from "three"
import { GLTFLoader, STLLoader, SkeletonUtils } from "three-stdlib"
import { API_ORIGIN } from "@dreamer/config"
import { scaleToVec3 } from "@dreamer/schemas"
import type { AssemblyBody, Vec3 } from "@dreamer/schemas"
import { assemblyBodyPhysicsKind } from "./physics-model"
import { usePhysicsEnabled } from "./physics-flag"
import { useAssemblyDoc } from "./use-assembly"
import {
  getPartNodes,
  getRegistryVersion,
  registerBodyJoint,
  registerBodyMaterials,
  registerBodyMixer,
  registerBodyRoot,
  registerBodyVolumeRoot,
  subscribeRegistry,
} from "./scene-registry"
import { useEditor } from "./editor-state"

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

/**
 * Give every mesh under `root` its own MeshStandardMaterial instance and
 * collect them — the targets for `emissive` signal bindings. Materials whose
 * emissive is unset get their base color as the glow color, so a bound body
 * lights up in its own color.
 */
function claimMaterials(root: Object3D): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = []
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = Array.isArray(object.material) ? object.material : [object.material]
    const cloned = source.map((material) => {
      if (!(material instanceof MeshStandardMaterial)) return material
      const own = material.clone()
      if (own.emissive.getHex() === 0) {
        own.emissive.copy(own.color)
        own.emissiveIntensity = 0
      }
      materials.push(own)
      return own
    })
    object.material = Array.isArray(object.material) ? cloned : cloned[0]
  })
  return materials
}

function StlModel({ bodyId, url }: { bodyId: string; url: string }) {
  // `geometry` belongs to useLoader's cache and is shared with every other
  // body loading the same URL — never dispose it here.
  const geometry = useLoader(STLLoader, url)
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#90a4ae",
        emissive: "#90a4ae",
        emissiveIntensity: 0,
        roughness: 0.6,
      }),
    [],
  )
  useLayoutEffect(
    () => registerBodyMaterials(bodyId, [material]),
    [bodyId, material],
  )
  // The material is constructed here, so this component owns it. r3f only
  // auto-disposes materials it created from JSX.
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} />
}

function GlbModel({
  bodyId,
  url,
  node,
  playAnimations,
}: {
  bodyId: string
  url: string
  node?: string
  playAnimations?: boolean
}) {
  const gltf = useLoader(GLTFLoader, url)
  // Clone so several bodies can reference the same cached file (or different
  // nodes of it) without fighting over one Object3D instance. SkeletonUtils
  // keeps skinned meshes (rigged models) intact where Object3D.clone breaks
  // their bone bindings.
  const build = useMemo(() => {
    const source = node ? gltf.scene.getObjectByName(node) : gltf.scene
    if (!source) return null
    const object = SkeletonUtils.clone(source)
    return { object, materials: claimMaterials(object) }
  }, [gltf, node])

  useLayoutEffect(() => {
    if (!build) return
    return registerBodyMaterials(bodyId, build.materials)
  }, [bodyId, build])

  // `claimMaterials` cloned a material per mesh, so this component owns them
  // and must dispose them when the body unmounts or the clone is rebuilt.
  // The cloned subtree's GEOMETRIES are deliberately left alone: SkeletonUtils
  // shares them with the cached GLTF, so disposing one would break every other
  // body loaded from the same file.
  useEffect(() => {
    if (!build) return
    return () => {
      for (const material of build.materials) material.dispose()
    }
  }, [build])

  // Baked animation clips: loop them all through one mixer. The frame loop
  // advances it only while the body's playAnimations flag is on.
  useLayoutEffect(() => {
    if (!build || !playAnimations || gltf.animations.length === 0) return
    const mixer = new AnimationMixer(build.object)
    for (const clip of gltf.animations) mixer.clipAction(clip).play()
    const unregister = registerBodyMixer(bodyId, mixer)
    return () => {
      mixer.stopAllAction()
      unregister()
    }
  }, [bodyId, build, gltf.animations, playAnimations])

  if (!build) return null
  return <primitive object={build.object} />
}

/** Does the body's GLB file carry baked animation clips? Rendered inside the
 * loader Suspense, so it reads the cached parse result. */
export function useGlbHasAnimations(url: string): boolean {
  const gltf = useLoader(GLTFLoader, url)
  return gltf.animations.length > 0
}

/** Import normalisation: unit fix-up and z-up → y-up, applied inside the
 * user transform so gizmo edits stay in sane mm space. */
export function BodyModel({ body }: { body: AssemblyBody }) {
  const url = `${API_ORIGIN}${body.uri}`
  const upFix: [number, number, number] =
    body.upAxis === "z" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
  return (
    <group rotation={upFix} scale={body.importScale}>
      <ModelErrorBoundary>
        {body.format === "stl" ? (
          <StlModel bodyId={body.id} url={url} />
        ) : (
          <GlbModel
            bodyId={body.id}
            url={url}
            node={body.node}
            playAnimations={body.playAnimations}
          />
        )}
      </ModelErrorBoundary>
    </group>
  )
}

/** Pivot sandwich: move `children` around `pivot` via the registered joint
 * group (the signal loop writes the rotation/translation imperatively). */
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

export function BodyNode({
  body,
  childrenOf,
}: {
  body: AssemblyBody
  childrenOf: (id: string) => AssemblyBody[]
}) {
  const { select } = useEditor()
  const rootRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!rootRef.current) return
    return registerBodyRoot(body.id, rootRef.current)
  }, [body.id])
  useLayoutEffect(() => {
    if (!rootRef.current) return
    return registerBodyVolumeRoot(body.id, rootRef.current)
  }, [body.id])
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
      ref={rootRef}
      name={`assembly-body-${body.id}`}
      visible={!body.hidden}
      position={body.transform.position}
      rotation={body.transform.rotation}
      scale={scaleToVec3(body.transform.scale)}
      onClick={(event) => {
        event.stopPropagation()
        select(body.id)
      }}
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

/** Resolve the Object3D a component-parented body mounts into. Moving nodes
 *  prefer the part's unit-scale mount anchor (which rides the motion but cancels
 *  the model's normalize scale) over the raw angle/spin node — mounting on the
 *  raw scaled node bakes an extreme fraction into the body's transform and it
 *  renders invisibly small. Falls back to the raw node for parts (procedural
 *  servo/motor) already built at mm scale. */
export function componentTarget(
  componentId: string,
  node: "body" | "angle" | "spin",
): Object3D | undefined {
  const nodes = getPartNodes(componentId)
  if (!nodes) return undefined
  if (node === "angle") return nodes.mountNode ?? nodes.angleNode
  if (node === "spin") return nodes.mountNode ?? nodes.spinNode
  return nodes.rootNode
}

export function UploadedBodies() {
  const assembly = useAssemblyDoc()
  const physicsEnabled = usePhysicsEnabled()
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
        // In physics mode, free-standing props are owned by <PhysicsBodies> so
        // they fall and collide; the jointed/kinematic world bodies stay here
        // for their signal-driven animation.
        .filter((b) => !(physicsEnabled && assemblyBodyPhysicsKind(b) === "dynamic"))
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
