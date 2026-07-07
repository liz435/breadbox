// ── Live scene registry ─────────────────────────────────────────────────────
//
// Hero part models register their animatable pieces here (keyed by board
// component id) as they mount, and uploaded assembly bodies register their
// joint groups (keyed by body id). The animation loop (signal bindings) reads
// these imperatively inside useFrame — never through React state — so
// per-tick signal updates can move parts without re-rendering the tree.
//
// The registry is also subscribable so React code that *composes* the scene
// (e.g. parenting an uploaded body onto a servo horn via portal) can react
// when a target node appears or disappears.

import type { AnimationMixer, Object3D, MeshStandardMaterial } from "three"

export type PartSceneNodes = {
  /** The component's root group — mount point for bodies parented on the part itself. */
  rootNode?: Object3D
  /** Node rotated to an absolute angle in degrees (servo horn). */
  angleNode?: Object3D
  /** Node spun continuously; receives accumulated rotation in degrees (motor shaft). */
  spinNode?: Object3D
  /** Material whose emissive intensity follows a 0..1 signal (LED dome, NeoPixel). */
  emissiveMaterial?: MeshStandardMaterial
}

const nodes = new Map<string, PartSceneNodes>()
const jointNodes = new Map<string, Object3D>()
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

/** Monotonic counter bumped on every register/unregister — use as a
 * useSyncExternalStore snapshot to re-render when scene nodes change. */
export function getRegistryVersion(): number {
  return version
}

export function subscribeRegistry(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerPartNodes(componentId: string, entry: PartSceneNodes): () => void {
  const existing = nodes.get(componentId)
  nodes.set(componentId, { ...existing, ...entry })
  notify()
  return () => {
    const current = nodes.get(componentId)
    if (!current) return
    let changed = false
    for (const key of Object.keys(entry) as (keyof PartSceneNodes)[]) {
      if (current[key] === entry[key]) {
        delete current[key]
        changed = true
      }
    }
    if (changed && Object.keys(current).length === 0) nodes.delete(componentId)
    if (changed) notify()
  }
}

export function getPartNodes(componentId: string): PartSceneNodes | undefined {
  return nodes.get(componentId)
}

/** Transform-root group of an uploaded assembly body (gizmo target). */
const bodyRoots = new Map<string, Object3D>()

export function registerBodyRoot(bodyId: string, node: Object3D): () => void {
  bodyRoots.set(bodyId, node)
  notify()
  return () => {
    if (bodyRoots.get(bodyId) === node) {
      bodyRoots.delete(bodyId)
      notify()
    }
  }
}

export function getBodyRoot(bodyId: string): Object3D | undefined {
  return bodyRoots.get(bodyId)
}

/** Joint group of an uploaded assembly body (moved by signal bindings). */
export function registerBodyJoint(bodyId: string, node: Object3D): () => void {
  jointNodes.set(bodyId, node)
  notify()
  return () => {
    if (jointNodes.get(bodyId) === node) {
      jointNodes.delete(bodyId)
      notify()
    }
  }
}

export function getBodyJoint(bodyId: string): Object3D | undefined {
  return jointNodes.get(bodyId)
}

/** Materials of an uploaded body's meshes — targets for `emissive` bindings.
 * Bodies register per-instance clones, so lighting one body never leaks into
 * another body sharing the same cached model file. */
const bodyMaterials = new Map<string, MeshStandardMaterial[]>()

export function registerBodyMaterials(
  bodyId: string,
  materials: MeshStandardMaterial[],
): () => void {
  bodyMaterials.set(bodyId, materials)
  notify()
  return () => {
    if (bodyMaterials.get(bodyId) === materials) {
      bodyMaterials.delete(bodyId)
      notify()
    }
  }
}

export function getBodyMaterials(bodyId: string): MeshStandardMaterial[] | undefined {
  return bodyMaterials.get(bodyId)
}

/** Mixer looping a GLB's baked animation clips (advanced by the frame loop
 * while the body's `playAnimations` flag is on). */
const bodyMixers = new Map<string, AnimationMixer>()

export function registerBodyMixer(bodyId: string, mixer: AnimationMixer): () => void {
  bodyMixers.set(bodyId, mixer)
  notify()
  return () => {
    if (bodyMixers.get(bodyId) === mixer) {
      bodyMixers.delete(bodyId)
      notify()
    }
  }
}

export function getBodyMixer(bodyId: string): AnimationMixer | undefined {
  return bodyMixers.get(bodyId)
}
