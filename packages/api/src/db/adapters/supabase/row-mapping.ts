// ── Row mapping (column ↔ jsonb) ────────────────────────────────────────
//
// Postgres rows have a few canonical columns (id, owner_id, name,
// version, timestamps) plus a `data jsonb` blob holding the rest of the
// domain payload. The column values are the source of truth — RLS keys
// off `owner_id`, optimistic concurrency keys off `version`, ordering
// uses `updated_at`. We strip the duplicated keys from the jsonb on
// write so a future bug in the mutation path can't drift one side from
// the other, and re-stitch on read so the rest of the codebase sees the
// same ProjectFile shape it always did.

import type {
  AgentRunFile,
  ProjectFile,
  ProjectThreadFile,
} from "../../schemas"

// ── projects ────────────────────────────────────────────────────────────

export type ProjectRow = {
  id: string
  owner_id: string
  name: string
  version: number
  data: unknown
  created_at: string
  updated_at: string
}

/**
 * The `project` sub-object that lives inside the `data jsonb` column —
 * exactly the fields NOT duplicated as canonical columns. Stripping
 * id / ownerId / name / version / createdAt / updatedAt at write time
 * means the column is the single source of truth for those values.
 */
type ProjectJsonbInner = Omit<
  ProjectFile["project"],
  "id" | "ownerId" | "name" | "version" | "createdAt" | "updatedAt"
>

/**
 * The shape stored in `projects.data`: the whole ProjectFile but with
 * the canonical fields removed from `project`. `rowToProject` re-stitches
 * those fields from the row columns on read.
 */
type ProjectJsonb = Omit<ProjectFile, "project"> & {
  project: ProjectJsonbInner
}

export function projectToRow(p: ProjectFile): {
  id: string
  owner_id: string
  name: string
  version: number
  data: ProjectJsonb
  created_at: string
  updated_at: string
} {
  const proj = p.project
  const {
    id: _id,
    ownerId: _ownerId,
    name: _name,
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...projectInner
  } = proj
  return {
    id: proj.id,
    owner_id: proj.ownerId,
    name: proj.name,
    version: proj.version,
    created_at: proj.createdAt,
    updated_at: proj.updatedAt,
    data: { ...p, project: projectInner },
  }
}

export function rowToProject(row: ProjectRow): ProjectFile {
  const data = row.data as ProjectJsonb
  return {
    ...data,
    project: {
      ...data.project,
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }
}

// ── threads ─────────────────────────────────────────────────────────────

export type ThreadRow = {
  id: string
  project_id: string
  data: unknown
  updated_at: string
}

export function threadToRow(t: ProjectThreadFile): {
  id: string
  project_id: string
  data: ProjectThreadFile
  updated_at: string
} {
  return {
    id: t.thread.id,
    project_id: t.thread.projectId,
    updated_at: t.thread.updatedAt,
    data: {
      ...t,
      thread: {
        ...t.thread,
        // Only fields not duplicated as columns. createdAt isn't a column
        // (we use Postgres' insert default), so keep it inside jsonb.
        createdAt: t.thread.createdAt,
      },
    },
  }
}

export function rowToThread(row: ThreadRow): ProjectThreadFile {
  const data = row.data as ProjectThreadFile
  return {
    ...data,
    thread: {
      ...data.thread,
      id: row.id,
      projectId: row.project_id,
      updatedAt: row.updated_at,
    },
  }
}

// ── agent_runs ──────────────────────────────────────────────────────────

export type AgentRunRow = {
  id: string
  thread_id: string
  project_id: string
  status: string
  data: unknown
  created_at: string
}

export function runToRow(r: AgentRunFile): {
  id: string
  thread_id: string
  project_id: string
  status: string
  data: AgentRunFile
  created_at: string
} {
  return {
    id: r.run.id,
    thread_id: r.run.threadId,
    project_id: r.run.projectId,
    status: r.run.status,
    created_at: r.run.createdAt,
    data: r,
  }
}

export function rowToRun(row: AgentRunRow): AgentRunFile {
  const data = row.data as AgentRunFile
  return {
    ...data,
    run: {
      ...data.run,
      id: row.id,
      threadId: row.thread_id,
      projectId: row.project_id,
      status: row.status as AgentRunFile["run"]["status"],
      createdAt: row.created_at,
    },
  }
}
