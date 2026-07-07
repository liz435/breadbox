// ── Live scene registry ─────────────────────────────────────────────────────
//
// Hero part models register their animatable pieces here (keyed by board
// component id) as they mount. The animation loop (signal bindings, Phase 4)
// reads these imperatively inside useFrame — never through React state — so
// per-tick signal updates can move parts without re-rendering the tree.

import type { Object3D, MeshStandardMaterial } from "three"

export type PartSceneNodes = {
  /** Node rotated to an absolute angle in degrees (servo horn). */
  angleNode?: Object3D
  /** Node spun continuously; receives accumulated rotation in degrees (motor shaft). */
  spinNode?: Object3D
  /** Material whose emissive intensity follows a 0..1 signal (LED dome, NeoPixel). */
  emissiveMaterial?: MeshStandardMaterial
}

const nodes = new Map<string, PartSceneNodes>()

export function registerPartNodes(componentId: string, entry: PartSceneNodes): () => void {
  const existing = nodes.get(componentId)
  nodes.set(componentId, { ...existing, ...entry })
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
  }
}

export function getPartNodes(componentId: string): PartSceneNodes | undefined {
  return nodes.get(componentId)
}
