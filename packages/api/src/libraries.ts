// ── Library toolkit helpers ──────────────────────────────────────────────
//
// Two concerns:
//
// 1. Custom libraries stored per-project (`customLibraries` map in the
//    request body). Written to `<sketchDir>/libs/<Name>/<Name>.h` so
//    arduino-cli can resolve them via `--libraries <sketchDir>/libs`.
//
// 2. Third-party libraries installed globally via `arduino-cli lib install`.
//    Shared across sketches, cached at `~/.arduino15/libraries/`.
//
// Backend-only — no UI wiring here.

import { z } from "zod"
import { mkdir } from "fs/promises"
import { join } from "path"
import { resolveArduinoCli } from "./toolchain"
import { createLogger } from "./logger"
import { IS_HOSTED } from "./env"
import { spawnCapture } from "./process-utils"

/** Timeouts for arduino-cli lib subcommands (all bounded so no child can wedge). */
const LIB_INSTALL_TIMEOUT_MS = 60_000
const LIB_UNINSTALL_TIMEOUT_MS = 30_000
const LIB_LIST_TIMEOUT_MS = 15_000
const LIB_SEARCH_TIMEOUT_MS = 15_000

const log = createLogger("libraries")

// ── Schema ───────────────────────────────────────────────────────────────

export const customLibraryPayloadSchema = z.object({
  name: z.string().min(1),
  code: z.string(),
  description: z.string().optional(),
})

export const customLibrariesSchema = z
  .record(z.string(), customLibraryPayloadSchema)
  .default({})

export type CustomLibraryPayload = z.infer<typeof customLibraryPayloadSchema>
export type CustomLibrariesPayload = z.infer<typeof customLibrariesSchema>

// ── Custom library writer ────────────────────────────────────────────────

/**
 * Layout inside `<sketchDir>/libs`:
 *
 *   libs/
 *     MyHelper/MyHelper.h
 *     SensorUtils/SensorUtils.h
 *
 * arduino-cli treats every subdirectory of the `--libraries` path as a
 * library whose include root is the subdirectory itself, so
 * `#include "MyHelper.h"` resolves to `libs/MyHelper/MyHelper.h`.
 *
 * The library folder name must match the header name (sans `.h`);
 * we use the key of the `customLibraries` record as the canonical name.
 */
export async function writeCustomLibraries(
  libsDir: string,
  libs: CustomLibrariesPayload,
): Promise<void> {
  const entries = Object.entries(libs)
  if (entries.length === 0) return

  await mkdir(libsDir, { recursive: true })
  for (const [key, lib] of entries) {
    const folder = sanitizeLibraryName(key)
    if (!folder) continue
    const dir = join(libsDir, folder)
    await mkdir(dir, { recursive: true })
    // Always write <folder>.h; ignore any trailing .h in the lib.name.
    const header = `${folder}.h`
    await Bun.write(join(dir, header), lib.code)
  }
}

function sanitizeLibraryName(raw: string): string {
  return raw
    .replace(/\.h$/i, "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
}

// ── Third-party installer (via arduino-cli lib install) ──────────────────

/**
 * Install a library from the Arduino index. Idempotent — already-installed
 * libraries return success in ~100ms. Network fetch for a fresh library
 * typically 5–30s. Caller should bound timeout with AbortSignal.
 */
export async function installLibrary(
  name: string,
  opts?: { version?: string; signal?: AbortSignal },
): Promise<{ success: true } | { success: false, error: string }> {
  if (!name.trim()) return { success: false, error: "library name required" }

  let cli: string
  try {
    cli = await resolveArduinoCli({ install: false })
  } catch (err) {
    return { success: false, error: String(err) }
  }

  const target = opts?.version ? `${name}@${opts.version}` : name
  log.info(`installing library ${target}`)

  const { stdout, stderr, code, aborted } = await spawnCapture(
    [cli, "lib", "install", target],
    { timeoutMs: LIB_INSTALL_TIMEOUT_MS, signal: opts?.signal },
  )

  if (aborted === "timeout") {
    return { success: false, error: `arduino-cli lib install timed out after ${LIB_INSTALL_TIMEOUT_MS / 1000}s` }
  }
  if (aborted === "signal") {
    return { success: false, error: "arduino-cli lib install cancelled" }
  }
  if (code !== 0) {
    return {
      success: false,
      error: (stderr || stdout || `arduino-cli lib install exited ${code}`).trim(),
    }
  }
  return { success: true }
}

/**
 * Uninstall a library by name. Idempotent: uninstalling a library that
 * isn't installed returns success (arduino-cli also treats this as a
 * no-op with non-zero exit, which we translate to success).
 */
export async function uninstallLibrary(
  name: string,
): Promise<{ success: true } | { success: false, error: string }> {
  if (!name.trim()) return { success: false, error: "library name required" }

  let cli: string
  try {
    cli = await resolveArduinoCli({ install: false })
  } catch (err) {
    return { success: false, error: String(err) }
  }

  log.info(`uninstalling library ${name}`)
  const { stdout, stderr, code, aborted } = await spawnCapture(
    [cli, "lib", "uninstall", name],
    { timeoutMs: LIB_UNINSTALL_TIMEOUT_MS },
  )

  if (aborted === "timeout") {
    return { success: false, error: `arduino-cli lib uninstall timed out after ${LIB_UNINSTALL_TIMEOUT_MS / 1000}s` }
  }
  if (code === 0) return { success: true }

  // "Library X is not installed" is a non-zero exit but a user-friendly
  // no-op from our perspective. Treat as success so the UI doesn't show
  // an error for a library the user is trying to reset.
  if ((stderr + stdout).toLowerCase().includes("not installed")) {
    return { success: true }
  }

  return {
    success: false,
    error: (stderr || stdout || `arduino-cli lib uninstall exited ${code}`).trim(),
  }
}

/** List currently installed libraries via arduino-cli lib list. */
export async function listInstalledLibraries(): Promise<Array<{
  name: string
  version: string
  author?: string
  sentence?: string
}>> {
  let cli: string
  try {
    cli = await resolveArduinoCli({ install: false })
  } catch {
    return []
  }
  const { stdout, code, aborted } = await spawnCapture(
    [cli, "lib", "list", "--json"],
    { timeoutMs: LIB_LIST_TIMEOUT_MS },
  )
  if (aborted !== null || code !== 0) return []
  try {
    const json = JSON.parse(stdout) as {
      installed_libraries?: Array<{
        library?: {
          name?: string
          version?: string
          author?: string
          sentence?: string
        }
      }>
    }
    const arr = json.installed_libraries ?? []
    return arr
      .map((entry) => ({
        name: entry.library?.name ?? "",
        version: entry.library?.version ?? "",
        author: entry.library?.author,
        sentence: entry.library?.sentence,
      }))
      .filter((l) => l.name)
  } catch {
    return []
  }
}

/** Search the Arduino index for libraries matching `query`. */
export async function searchLibraries(query: string): Promise<Array<{
  name: string
  latest: string
  author?: string
  sentence?: string
}>> {
  let cli: string
  try {
    cli = await resolveArduinoCli({ install: false })
  } catch {
    return []
  }
  const { stdout, code, aborted } = await spawnCapture(
    [cli, "lib", "search", query, "--json"],
    { timeoutMs: LIB_SEARCH_TIMEOUT_MS },
  )
  if (aborted !== null || code !== 0) return []
  try {
    const json = JSON.parse(stdout) as {
      libraries?: Array<{
        name?: string
        latest?: { version?: string; author?: string; sentence?: string }
      }>
    }
    return (json.libraries ?? [])
      .map((lib) => ({
        name: lib.name ?? "",
        latest: lib.latest?.version ?? "",
        author: lib.latest?.author,
        sentence: lib.latest?.sentence,
      }))
      .filter((l) => l.name)
  } catch {
    return []
  }
}

// ── Auto-install on missing-header compile error ─────────────────────────

/**
 * Parse arduino-cli's "fatal error: Foo.h: No such file or directory" output
 * and return the header name (without .h) if present.
 */
export function extractMissingHeader(output: string): string | null {
  const m = output.match(/fatal error:\s+([A-Za-z0-9_.-]+)\.h:\s+No such file/)
  return m ? m[1] : null
}

/**
 * Attempt to auto-install a library whose header went missing. Strategy:
 *
 *   1. Search the Arduino index for the header name.
 *   2. If any library's name matches exactly (case-insensitive), install it.
 *   3. Otherwise if exactly one match is returned, install it.
 *   4. Otherwise give up — the compile retry should surface the original
 *      error to the user.
 *
 * Gated by BREADBOX_AUTO_INSTALL_LIBS env: anything other than "0" enables.
 * Also disabled entirely in hosted mode (BREADBOX_HOSTED=1) — hosted
 * deployments ship a fixed set of pre-installed libraries and don't allow
 * user-triggered installs.
 */
export async function attemptAutoInstall(
  headerBase: string,
): Promise<{ installed: string } | { reason: string }> {
  if (IS_HOSTED) {
    return { reason: `"${headerBase}" is not pre-installed on this hosted Breadbox. Run the Breadbox CLI locally to use additional libraries.` }
  }
  if (process.env.BREADBOX_AUTO_INSTALL_LIBS === "0") {
    return { reason: "BREADBOX_AUTO_INSTALL_LIBS=0" }
  }

  const candidates = await searchLibraries(headerBase)
  if (candidates.length === 0) {
    return { reason: `no library matches "${headerBase}" in the Arduino index` }
  }

  // Arduino library names typically use spaces where headers use underscores
  // (e.g. header "Adafruit_SSD1306.h" is provided by library "Adafruit SSD1306").
  // Normalize both sides by stripping separators before comparing.
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, "")
  const target = normalize(headerBase)
  const exactMatches = candidates.filter((c) => normalize(c.name) === target)
  const pick =
    exactMatches.length === 1
      ? exactMatches[0]
      : exactMatches.length > 1
        ? exactMatches.reduce((a, b) => (a.name.length <= b.name.length ? a : b))
        : candidates.length === 1
          ? candidates[0]
          : null

  if (!pick) {
    const top = candidates.slice(0, 5).map((c) => c.name).join(", ")
    return {
      reason:
        `"${headerBase}" ambiguous in the Arduino index (candidates: ${top}). ` +
        `Install one explicitly via \`arduino-cli lib install "<name>"\`.`,
    }
  }

  const result = await installLibrary(pick.name)
  if (!result.success) return { reason: `install "${pick.name}" failed: ${result.error}` }
  return { installed: pick.name }
}
