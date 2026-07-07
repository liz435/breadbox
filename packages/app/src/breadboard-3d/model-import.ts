// ── Model file analysis for import ──────────────────────────────────────────
//
// Parses an uploaded GLB/STL in the browser (before it's sent to the server)
// so the import dialog can show real dimensions and let the user fix units.
// STL is unitless — hobby CAD exports are almost always millimeters — while
// GLB is meters by glTF convention; the presets below reflect that.

import { Box3, Vector3 } from "three"
import { GLTFLoader, STLLoader } from "three-stdlib"
import type { ModelFormat } from "@dreamer/schemas"

export type UnitPreset = { label: string; scale: number }

/** File unit → millimeters. */
export const UNIT_PRESETS: UnitPreset[] = [
  { label: "millimeters", scale: 1 },
  { label: "centimeters", scale: 10 },
  { label: "meters", scale: 1000 },
  { label: "inches", scale: 25.4 },
]

export function detectModelFormat(fileName: string): ModelFormat | null {
  const ext = fileName.split(".").pop()?.toLowerCase()
  if (ext === "glb" || ext === "gltf") return "glb"
  if (ext === "stl") return "stl"
  return null
}

export function defaultUnitScale(format: ModelFormat): number {
  // glTF is meters by spec; STL from slicer-oriented CAD is almost always mm.
  return format === "glb" ? 1000 : 1
}

export type ModelAnalysis = {
  /** Bounding-box size in file units (multiply by unit scale for mm). */
  size: { x: number; y: number; z: number }
  /** Node names found in a GLB scene graph (empty for STL). */
  nodeNames: string[]
}

export async function analyzeModelFile(
  buffer: ArrayBuffer,
  format: ModelFormat,
): Promise<ModelAnalysis> {
  if (format === "stl") {
    const geometry = new STLLoader().parse(buffer)
    geometry.computeBoundingBox()
    const size = geometry.boundingBox?.getSize(new Vector3()) ?? new Vector3()
    geometry.dispose()
    return { size: { x: size.x, y: size.y, z: size.z }, nodeNames: [] }
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, "")
  const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
  const nodeNames: string[] = []
  gltf.scene.traverse((node) => {
    if (node.name) nodeNames.push(node.name)
  })
  return { size: { x: size.x, y: size.y, z: size.z }, nodeNames }
}
