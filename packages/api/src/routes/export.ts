// ── Export route (CLI/desktop only) ──────────────────────────────────────
//
// POST /api/export/model — save a client-generated binary model (e.g. the 3D
// breadboard assembly as a .glb) to the user's Downloads folder.
//
// Why a server round-trip instead of a browser download: the desktop app runs
// the web UI in a WKWebView, which ignores `<a download>` entirely, so a
// client-side blob download silently no-ops there. Every deployment (desktop
// and dev) has the local server reachable at API_ORIGIN, so the frontend hands
// the bytes here and the server writes the file, returning its absolute path
// for the UI to surface. Plain browsers keep using the anchor-download path.

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { Elysia } from "elysia"
import { createLogger } from "../logger"

const log = createLogger("export-routes")

/** Hard cap on a saved model, so a runaway request can't fill the disk. */
const MAX_BYTES = 200 * 1024 * 1024 // 200 MB

/** Collapse a client-supplied name to a single safe path segment. */
function safeFilename(raw: string, fallback: string): string {
  const name = basename(raw.trim()).replace(/[/\\]/g, "")
  const candidate = name.length > 0 ? name : fallback
  // Keep letters, digits, spaces and a few filename-safe punctuation marks.
  return candidate.replace(/[^\w.\- ()]/g, "_")
}

/** Where saved models land: an override (used by tests), else ~/Downloads. */
function targetDir(): string {
  const override = process.env.BREADBOX_DOWNLOAD_DIR?.trim()
  if (override) return override
  const downloads = join(homedir(), "Downloads")
  return existsSync(downloads) ? downloads : homedir()
}

/** First non-colliding path: "name.glb", "name (1).glb", "name (2).glb", … */
function uniquePath(dir: string, filename: string): string {
  const dot = filename.lastIndexOf(".")
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ""
  let candidate = join(dir, filename)
  let n = 1
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (${n})${ext}`)
    n += 1
  }
  return candidate
}

export const exportRoutes = new Elysia({ name: "export-routes" }).post(
  "/api/export/model",
  async ({ request, set }) => {
    // Read the multipart body off the raw request (same pattern as the asset
    // upload route) so Elysia's typed body parser stays out of the way.
    let file: FormDataEntryValue | null
    try {
      const formData = await request.formData()
      file = formData.get("file")
    } catch {
      set.status = 400
      return { error: "expected multipart/form-data with a `file` field" }
    }
    if (!file || !(file instanceof File)) {
      set.status = 400
      return { error: "missing `file`" }
    }
    if (file.size === 0) {
      set.status = 400
      return { error: "empty file" }
    }
    if (file.size > MAX_BYTES) {
      set.status = 413
      return { error: "model too large" }
    }

    const filename = safeFilename(file.name, "model.glb")
    const path = uniquePath(targetDir(), filename)
    try {
      await Bun.write(path, await file.arrayBuffer())
    } catch (err) {
      log.error(`failed to save model: ${err instanceof Error ? err.message : err}`)
      set.status = 500
      return { error: "failed to save file" }
    }

    log.info(`saved exported model to ${path}`)
    return { path }
  },
)
