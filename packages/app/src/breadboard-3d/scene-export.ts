// ── Assembled-scene GLB export ──────────────────────────────────────────────
//
// The export button lives in the DOM overlay, outside the Canvas, so the live
// three.js scene is handed out through a module-level ref (registered by a
// bridge component mounted inside the Canvas). Exporting binds the whole
// visible assembly — board, parts, wires, uploaded bodies — into a single
// .glb the user can drop into a slicer to check fit before printing.

import { Object3D } from "three"
import { GLTFExporter } from "three-stdlib"
import { z } from "zod"
import { API_ORIGIN } from "@dreamer/config"

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

const savedResponseSchema = z.object({ path: z.string() })

/** Where the export ended up: an absolute path (server-saved) or null (the
 *  browser's own download, whose destination we can't know). */
export type ExportResult = { savedTo: string | null }

/** Save the exported assembly, returning where it landed.
 *
 * Prefers a server-side save: the desktop app runs in a WKWebView that ignores
 * `<a download>`, so a client download silently no-ops there. The local server
 * (reachable at API_ORIGIN in every deployment) writes the file and hands back
 * its path. Any failure — endpoint missing, offline, CORS — falls back to the
 * plain-browser anchor download, which works in Chrome/Firefox/Safari. */
export async function downloadSceneGlb(filename = "assembly.glb"): Promise<ExportResult> {
  const blob = await exportSceneToGlb()

  try {
    const body = new FormData()
    body.append("file", blob, filename)
    const res = await fetch(`${API_ORIGIN}/api/export/model`, {
      method: "POST",
      body,
      credentials: "include",
    })
    if (res.ok) {
      const parsed = savedResponseSchema.safeParse(await res.json())
      if (parsed.success) return { savedTo: parsed.data.path }
    }
  } catch {
    // Server unreachable (e.g. plain browser dev with no API) — fall through.
  }

  triggerBrowserDownload(blob, filename)
  return { savedTo: null }
}

/** Browser fallback: click a hidden anchor to download the blob. */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  // Defer cleanup: revoking the blob URL (or removing the anchor) synchronously
  // cancels the download in Safari and Firefox, which read the blob
  // asynchronously after the click. Give the browser a beat to start it.
  setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 10_000)
}
