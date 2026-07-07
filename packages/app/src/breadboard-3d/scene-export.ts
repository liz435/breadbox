// ── Assembled-scene GLB export ──────────────────────────────────────────────
//
// The export button lives in the DOM overlay, outside the Canvas, so the live
// three.js scene is handed out through a module-level ref (registered by a
// bridge component mounted inside the Canvas). Exporting binds the whole
// visible assembly — board, parts, wires, uploaded bodies — into a single
// .glb the user can drop into a slicer to check fit before printing.

import { Object3D } from "three"
import { GLTFExporter } from "three-stdlib"

/** Named scene groups to include in the export (skips gizmos, lights, camera). */
const EXPORT_GROUP_NAMES = ["board-3d", "parts-3d", "wires-3d", "assembly-bodies"]

let sceneRef: Object3D | null = null

export function registerExportScene(scene: Object3D): () => void {
  sceneRef = scene
  return () => {
    if (sceneRef === scene) sceneRef = null
  }
}

export function canExportScene(): boolean {
  return sceneRef !== null
}

/** Serialize the current assembly to a binary glTF blob. */
export async function exportSceneToGlb(): Promise<Blob> {
  const scene = sceneRef
  if (!scene) throw new Error("3D scene is not mounted")

  // Export the named groups (board, parts, wires, bodies) as siblings — they
  // stay attached to the live scene, so their world matrices are already
  // correct, and the gizmo / controls / lights are simply left out.
  scene.updateMatrixWorld(true)
  const roots = EXPORT_GROUP_NAMES.map((name) => scene.getObjectByName(name)).filter(
    (object): object is Object3D => object != null,
  )
  if (roots.length === 0) throw new Error("nothing to export yet")

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(roots, { binary: true })

  if (result instanceof ArrayBuffer) {
    return new Blob([result], { type: "model/gltf-binary" })
  }
  return new Blob([JSON.stringify(result)], { type: "model/gltf+json" })
}

/** Trigger a browser download of the exported assembly. */
export async function downloadSceneGlb(filename = "assembly.glb"): Promise<void> {
  const blob = await exportSceneToGlb()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
