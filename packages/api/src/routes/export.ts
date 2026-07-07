// ── Export route (CLI/desktop only) ──────────────────────────────────────
//
// POST /api/export/model — save a client-generated binary model (e.g. the 3D
// breadboard assembly as a .glb) to a location the user picks.
//
// Why a server round-trip instead of a browser download: the desktop app runs
// the web UI in a WKWebView, which ignores `<a download>` entirely, so a
// client-side blob download silently no-ops there, and the remote-URL frontend
// has no Tauri IPC to open a native save dialog itself. So the frontend hands
// the bytes here and the server presents a **native macOS Save panel**
// (AppleScript) and writes the file to the chosen path, returning it for the
// UI to surface. Cancelling the panel returns `{ cancelled: true }`.
//
// Fallbacks keep the logic testable and cross-platform: setting
// BREADBOX_DOWNLOAD_DIR (used by tests) or running off macOS skips the dialog
// and saves straight into that dir / ~/Downloads. Plain browsers never reach
// here — they use the client anchor-download fallback.

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

/** ~/Downloads if it exists, else the home dir. */
function defaultSaveDir(): string {
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

/** Outcome of asking the OS where to save. */
type SaveTarget = { path: string; cancelled?: false } | { path: null; cancelled: true }

/** Show the native macOS Save panel; resolve the chosen path (dialog handles
 *  its own overwrite confirmation). `cancelled` when the user dismisses it;
 *  a null path with cancelled:false signals a dialog failure (caller falls
 *  back to a direct save so Export never silently no-ops). */
async function chooseSavePathViaDialog(
  defaultName: string,
): Promise<{ path: string | null; cancelled: boolean }> {
  const script = [
    "on run argv",
    "set f to choose file name with prompt (item 1 of argv) default name (item 2 of argv) default location (path to downloads folder)",
    "return POSIX path of f",
    "end run",
  ].join("\n")
  try {
    const proc = Bun.spawn(["osascript", "-e", script, "Save 3D model", defaultName], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    if (exitCode === 0) {
      const picked = out.trim()
      return { path: picked.length > 0 ? picked : null, cancelled: false }
    }
    // -128 is AppleScript's "user cancelled" code.
    if (err.includes("-128") || /user canceled/i.test(err)) {
      return { path: null, cancelled: true }
    }
    log.error(`save dialog failed: ${err.trim() || `exit ${exitCode}`}`)
    return { path: null, cancelled: false }
  } catch (err) {
    log.error(`osascript spawn failed: ${err instanceof Error ? err.message : err}`)
    return { path: null, cancelled: false }
  }
}

/** Decide where to write: a configured dir (tests/power users) → straight
 *  save; macOS → native Save panel; anything else → ~/Downloads. */
async function resolveSaveTarget(filename: string): Promise<SaveTarget> {
  const override = process.env.BREADBOX_DOWNLOAD_DIR?.trim()
  if (override) return { path: uniquePath(override, filename) }

  if (process.platform === "darwin") {
    const picked = await chooseSavePathViaDialog(filename)
    if (picked.cancelled) return { path: null, cancelled: true }
    if (picked.path) return { path: picked.path }
    // Dialog errored (not a cancel) — fall through to a direct save.
  }
  return { path: uniquePath(defaultSaveDir(), filename) }
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
    const target = await resolveSaveTarget(filename)
    if (target.cancelled) return { cancelled: true }
    if (!target.path) {
      set.status = 500
      return { error: "no save location" }
    }

    try {
      await Bun.write(target.path, await file.arrayBuffer())
    } catch (err) {
      log.error(`failed to save model: ${err instanceof Error ? err.message : err}`)
      set.status = 500
      return { error: "failed to save file" }
    }

    log.info(`saved exported model to ${target.path}`)
    return { path: target.path }
  },
)
