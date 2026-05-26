// ── Supabase project repository ─────────────────────────────────────────
//
// Postgres-backed ProjectRepo. Mirrors the public surface of the file
// adapter so call sites (and the storage selector) see one shape.
//
// Versioning: every mutation goes through an `UPDATE … WHERE version =
// $current` query. Zero rows returned → VersionConflictError. The file
// adapter pre-checks and then writes; the database guarantees atomicity
// here so we can lean on the conditional update directly.
//
// RLS: service role bypasses RLS, but we keep `owner_id = $ownerId` in
// every WHERE for defense-in-depth and so "not found vs not owned" is
// indistinguishable from the client's perspective (no enumeration).

import { match } from "ts-pattern"
import { generateUniqueProjectName } from "../../../utils/name-generator"
import {
  applyOpsRequestSchema,
  applyBoardOpsRequestSchema,
  boardOpSchema,
  projectFileSchema,
  sceneOpSchema,
  type ApplyOpsRequest,
  type ApplyBoardOpsRequest,
  type ProjectFile,
  type ProjectGraph,
} from "../../schemas"
import type { BoardState } from "@dreamer/schemas"
import { createLogger } from "../../../logger"
import { getSupabaseAdmin } from "../../../supabase/admin-client"
import {
  applyOneOp,
  applyOneBoardOp,
  buildInitialProject,
  projectHasContent,
  VersionConflictError,
  OpValidationError,
} from "../file/project-repo"
import {
  projectToRow,
  rowToProject,
  type ProjectRow,
} from "./row-mapping"
import { parseInDev } from "./parse-in-dev"

const log = createLogger("project-repo-supabase")

const TABLE = "projects"
const COLUMNS = "id, owner_id, name, version, data, created_at, updated_at"

function now(): string {
  return new Date().toISOString()
}

function createId(): string {
  return crypto.randomUUID()
}

// ── Row helpers ─────────────────────────────────────────────────────────

/**
 * Fetch one project as the canonical ProjectFile shape. Returns null
 * when the row is missing OR not owned by the caller — RLS-equivalent
 * semantics regardless of which it is.
 */
async function readProject(
  projectId: string,
  ownerId: string,
): Promise<ProjectFile | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle()
  if (error) throw new Error(`readProject: ${error.message}`)
  if (!data) return null
  const project = rowToProject(data as ProjectRow)
  return parseInDev(projectFileSchema, project)
}

/**
 * Insert + return the canonical ProjectFile shape. Used by createProject
 * for the initial write of a freshly-built project.
 */
async function insertProject(p: ProjectFile): Promise<ProjectFile> {
  const supabase = getSupabaseAdmin()
  const row = projectToRow(parseInDev(projectFileSchema, p))
  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`insertProject: ${error.message}`)
  return rowToProject(data as ProjectRow)
}

/**
 * Conditional update — bumps version + updated_at iff the on-disk
 * version still matches `expectedVersion`. Returns the new row, or
 * throws VersionConflictError on stale write.
 */
async function updateProject(
  projectId: string,
  ownerId: string,
  expectedVersion: number,
  next: ProjectFile,
): Promise<ProjectFile> {
  const supabase = getSupabaseAdmin()
  const row = projectToRow(parseInDev(projectFileSchema, next))
  // The data jsonb has the next state; the columns reflect the new
  // canonical values. Use the conditional UPDATE pattern: the where
  // clause includes the old version, the SET writes the new one.
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      name: row.name,
      version: row.version,
      data: row.data,
      updated_at: row.updated_at,
    })
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .eq("version", expectedVersion)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`updateProject: ${error.message}`)
  if (!data) {
    // Two reasons for zero rows: (a) someone else bumped the version
    // (b) the project doesn't exist / wrong owner. Re-read to find out.
    const fresh = await readProject(projectId, ownerId)
    if (!fresh) throw new Error("updateProject: project not found")
    throw new VersionConflictError(expectedVersion, fresh.project.version)
  }
  return rowToProject(data as ProjectRow)
}

// ── Public API ──────────────────────────────────────────────────────────

async function listProjects(ownerId: string): Promise<
  Array<{
    id: string
    name: string
    createdAt: string
    updatedAt: string
    hasContent: boolean
  }>
> {
  const supabase = getSupabaseAdmin()
  // Slim projection: we still need `data` to compute hasContent.
  // listProjects is rare enough that the cost is acceptable; PR2-future
  // can promote a `has_content` generated column if it becomes hot.
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
  if (error) throw new Error(`listProjects: ${error.message}`)
  return (data as ProjectRow[]).map((row) => {
    const file = rowToProject(row)
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hasContent: projectHasContent(file),
    }
  })
}

async function createProject(params: {
  ownerId: string
  id?: string
  name?: string
}): Promise<ProjectFile> {
  const id = params.id ?? createId()
  const supabase = getSupabaseAdmin()
  let name = params.name
  if (!name) {
    // Pull existing names for this owner to dedupe (mirrors file adapter).
    const { data, error } = await supabase
      .from(TABLE)
      .select("name")
      .eq("owner_id", params.ownerId)
    if (error) throw new Error(`createProject (name probe): ${error.message}`)
    const existingNames = new Set((data ?? []).map((r) => r.name as string))
    name = generateUniqueProjectName(existingNames)
  }
  const initial = buildInitialProject({ id, name, ownerId: params.ownerId })
  return await insertProject(initial)
}

async function getOrCreateProject(params: {
  ownerId: string
  id?: string
  name?: string
}): Promise<ProjectFile> {
  if (params.id) {
    const existing = await readProject(params.id, params.ownerId)
    if (existing) return existing
  }
  return await createProject(params)
}

async function writeProject(
  projectId: string,
  ownerId: string,
  data: ProjectFile,
): Promise<void> {
  // Unconditional bump — used by callers that already coordinated
  // concurrency themselves. Mirrors the file adapter's writeProject.
  const supabase = getSupabaseAdmin()
  const row = projectToRow(parseInDev(projectFileSchema, data))
  const { error } = await supabase
    .from(TABLE)
    .update({
      name: row.name,
      version: row.version,
      data: row.data,
      updated_at: row.updated_at,
    })
    .eq("id", projectId)
    .eq("owner_id", ownerId)
  if (error) throw new Error(`writeProject: ${error.message}`)
}

async function applyOps(
  projectId: string,
  ownerId: string,
  req: ApplyOpsRequest,
) {
  const input = applyOpsRequestSchema.parse(req)
  const existing = await readProject(projectId, ownerId)
  if (!existing) return null
  if (existing.project.version !== input.expectedVersion) {
    throw new VersionConflictError(
      input.expectedVersion,
      existing.project.version,
    )
  }

  const working = structuredClone(existing)
  const touchedScenes = new Set<string>()

  for (const rawOp of input.ops) {
    const op = sceneOpSchema.parse(rawOp)
    if (op.expectedVersion !== input.expectedVersion) {
      throw new OpValidationError(
        `Op ${op.opId} expectedVersion must equal batch expectedVersion`,
      )
    }
    const touchedSceneId = applyOneOp(working, op)
    touchedScenes.add(touchedSceneId)
  }

  working.project.version += 1
  working.project.updatedAt = now()
  for (const sceneId of touchedScenes) {
    working.scenes[sceneId]!.version += 1
  }

  const updated = await updateProject(
    projectId,
    ownerId,
    input.expectedVersion,
    working,
  )
  return {
    project: updated,
    newVersion: updated.project.version,
    appliedOps: input.ops,
  }
}

async function applyBoardOps(
  projectId: string,
  ownerId: string,
  req: ApplyBoardOpsRequest,
) {
  const input = applyBoardOpsRequestSchema.parse(req)
  const existing = await readProject(projectId, ownerId)
  if (!existing) return null

  const working = structuredClone(existing)
  for (const rawOp of input.ops) {
    const op = boardOpSchema.parse(rawOp)
    applyOneBoardOp(working, op)
  }
  working.project.version += 1
  working.project.updatedAt = now()

  const updated = await updateProject(
    projectId,
    ownerId,
    existing.project.version,
    working,
  )
  return {
    project: updated,
    newVersion: updated.project.version,
    appliedOps: input.ops,
  }
}

async function saveGraph(
  projectId: string,
  ownerId: string,
  graph: ProjectGraph,
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId, ownerId)
  if (!existing) return null
  existing.graph = graph
  existing.project.updatedAt = now()
  // Best-effort write (no version bump). Two concurrent saveGraph calls
  // on the same project can race; the latest write wins. Matches the
  // file adapter's read-mutate-write semantics.
  await writeProject(projectId, ownerId, existing)
  return { saved: true }
}

async function saveBoardState(
  projectId: string,
  ownerId: string,
  boardState: BoardState,
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId, ownerId)
  if (!existing) return null
  existing.boardState = boardState
  existing.project.updatedAt = now()
  await writeProject(projectId, ownerId, existing)
  return { saved: true }
}

async function saveBoardAndGraph(
  projectId: string,
  ownerId: string,
  payload: { boardState?: BoardState; graph?: ProjectGraph },
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId, ownerId)
  if (!existing) return null
  if (payload.boardState !== undefined) existing.boardState = payload.boardState
  if (payload.graph !== undefined) existing.graph = payload.graph
  existing.project.updatedAt = now()
  await writeProject(projectId, ownerId, existing)
  return { saved: true }
}

async function renameProject(
  projectId: string,
  ownerId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(TABLE)
    .update({ name, updated_at: now() })
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .select("id, name")
    .maybeSingle()
  if (error) throw new Error(`renameProject: ${error.message}`)
  if (!data) return null
  return { id: data.id as string, name: data.name as string }
}

async function renameScene(
  projectId: string,
  ownerId: string,
  sceneId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const existing = await readProject(projectId, ownerId)
  if (!existing) return null
  const scene = existing.scenes[sceneId]
  if (!scene) return null
  scene.name = name
  existing.project.updatedAt = now()
  await writeProject(projectId, ownerId, existing)
  return { id: sceneId, name }
}

async function deleteProject(
  projectId: string,
  ownerId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  // Best-effort: also nuke any storage objects keyed under this project.
  // The Storage bucket layout (see PR2.8) is `{ownerId}/{projectId}/*`.
  try {
    const prefix = `${ownerId}/${projectId}`
    const { data: listing } = await supabase.storage
      .from("project-assets")
      .list(prefix, { limit: 1000 })
    if (listing && listing.length > 0) {
      await supabase.storage
        .from("project-assets")
        .remove(listing.map((o) => `${prefix}/${o.name}`))
    }
  } catch (err) {
    log.warn(
      `delete: storage cleanup failed for ${projectId}: ${err instanceof Error ? err.message : err}`,
    )
  }
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`deleteProject: ${error.message}`)
  return data != null
}

// `ensureAssetsDir` / `projectAssetsDir` aren't meaningful for the
// Supabase adapter — assets live in Supabase Storage, not the filesystem.
// The asset routes (PR2.8) read ownership via `readProject` and upload
// directly through `supabaseAdmin.storage`. We export no-op stubs so
// callers that aren't yet aware of the split don't crash.
async function ensureAssetsDir(
  projectId: string,
  ownerId: string,
): Promise<string | null> {
  // The "dir" return value is consumed by the route only for the file
  // adapter's filesystem write. Supabase callers (PR2.8) don't read it
  // — they upload via supabaseAdmin.storage. Return a sentinel so any
  // caller still on the legacy path fails loudly instead of writing
  // into a nonsensical absolute path on disk.
  const project = await readProject(projectId, ownerId)
  if (!project) return null
  return `supabase:project-assets/${ownerId}/${projectId}`
}

function projectAssetsDir(_projectId: string): string {
  throw new Error(
    "projectAssetsDir() is not supported in hosted mode — use Supabase Storage paths via the assets route",
  )
}

// ── Exported repo ──────────────────────────────────────────────────────

export const projectRepo = {
  listProjects,
  createProject,
  getOrCreateProject,
  readProject,
  writeProject,
  applyOps,
  applyBoardOps,
  saveGraph,
  saveBoardState,
  saveBoardAndGraph,
  renameProject,
  renameScene,
  deleteProject,
  ensureAssetsDir,
  projectAssetsDir,
}

// Re-export common error classes so callers don't have to know which
// adapter is active.
export { VersionConflictError, OpValidationError } from "../file/project-repo"

// Quiet unused-import lint while keeping the import in case PR3 wants
// to gate `applyOneOp`/`applyOneBoardOp` on schema parse failures.
// (Both are referenced inside applyOps / applyBoardOps above.)
match
