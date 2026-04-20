// ── Ownership migration ──────────────────────────────────────────────────
//
// Projects acquired an `ownerId` field in Phase B of the auth rollout. Any
// project JSON written before that is "legacy" from the schema's point of
// view and would fail strict parse on read.
//
// Two modes:
//
//   • Hosted (DREAMER_HOSTED=1): we can't safely stamp a user onto an
//     orphan project — there's no way to know whose project it was, and
//     auto-assigning would be a tenant-takeover hazard on a shared Railway
//     volume. Legacy files get moved into `projects/_legacy/` where they
//     are invisible to listing until an admin explicitly claims them.
//
//   • Local (default) / dev: the CLI is single-tenant and every legacy
//     project belongs to the one user. Stamp `ownerId: "local"` in place.
//
// Idempotent on re-run: files with an ownerId are left alone, and files
// already under `_legacy/` are never rescanned.

import { readdir, mkdir, rename } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { legacyProjectsDir, projectsDir } from "../paths"
import { createLogger } from "../logger"

const log = createLogger("migrate-ownership")

// Loose schema — we only care whether ownerId is present. `.passthrough()`
// keeps every unknown key so we can re-serialize without loss when we
// stamp ownerId in local mode.
const legacyProbeSchema = z
  .object({
    project: z
      .object({
        id: z.string(),
        ownerId: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough()

export type OwnershipMigrationResult = {
  mode: "hosted" | "local"
  scanned: number
  migrated: number
  stamped: number
  skipped: number
  errors: number
}

export async function migrateOwnership(params?: {
  ownerIdForLocal?: string
  /** Override for tests; defaults to DREAMER_HOSTED env check at call time. */
  hosted?: boolean
}): Promise<OwnershipMigrationResult> {
  const ownerIdForLocal = params?.ownerIdForLocal ?? "local"
  // Read env at call time (not import time) so tests that flip the flag
  // between runs don't need module-cache tricks.
  const isHosted = params?.hosted ?? process.env.DREAMER_HOSTED === "1"
  const mode: "hosted" | "local" = isHosted ? "hosted" : "local"
  const result: OwnershipMigrationResult = {
    mode,
    scanned: 0,
    migrated: 0,
    stamped: 0,
    skipped: 0,
    errors: 0,
  }

  const root = projectsDir()
  await mkdir(root, { recursive: true })

  let files: string[]
  try {
    files = await readdir(root)
  } catch (err) {
    log.warn(`failed to read projects dir: ${err}`)
    return result
  }

  for (const name of files) {
    // Skip anything that isn't a *.json file at the top level. This also
    // excludes the `_legacy` subdirectory and any other nested state.
    if (!name.endsWith(".json")) continue
    const filePath = join(root, name)
    result.scanned += 1

    try {
      const file = Bun.file(filePath)
      const raw = await file.json()
      const probe = legacyProbeSchema.safeParse(raw)

      // Unparseable file — leave it where it is and count as skipped. The
      // strict read path will refuse to load it anyway; touching random
      // bytes would be worse.
      if (!probe.success) {
        result.skipped += 1
        continue
      }

      const existingOwner = probe.data.project.ownerId
      if (typeof existingOwner === "string" && existingOwner.length > 0) {
        result.skipped += 1
        continue
      }

      if (mode === "hosted") {
        const destDir = legacyProjectsDir()
        await mkdir(destDir, { recursive: true })
        const dest = join(destDir, name)
        await rename(filePath, dest)
        result.migrated += 1
        continue
      }

      // Local mode: stamp in place. `passthrough()` preserved every
      // sibling field, so merging `ownerId` onto `project` is safe.
      const stamped = {
        ...probe.data,
        project: {
          ...probe.data.project,
          ownerId: ownerIdForLocal,
        },
      }
      await Bun.write(filePath, JSON.stringify(stamped, null, 2))
      result.stamped += 1
    } catch (err) {
      result.errors += 1
      log.warn(`failed to migrate ${name}: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (mode === "hosted") {
    log.info(
      `migrated ${result.migrated} legacy projects → _legacy/ (scanned ${result.scanned}, skipped ${result.skipped}, errors ${result.errors})`,
    )
  } else {
    log.info(
      `stamped ${result.stamped} local projects with ownerId=${ownerIdForLocal} (scanned ${result.scanned}, skipped ${result.skipped}, errors ${result.errors})`,
    )
  }

  return result
}
