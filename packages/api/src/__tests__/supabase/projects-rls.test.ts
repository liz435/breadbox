// ── Supabase projects: RLS + optimistic-concurrency integration ────────
//
// Cross-user isolation and version-conflict semantics against a real
// Postgres + RLS stack. Each test creates two fresh users via the admin
// client, exercises the repo with each owner's userId, and confirms
// owner B can't see/modify owner A's data.
//
// Auto-skipped without SUPABASE_URL — see auth-middleware.test.ts for
// the run instructions.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

const HAS_SUPABASE =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  SUPABASE_SERVICE_ROLE_KEY.length > 0

const describeOrSkip = HAS_SUPABASE ? describe : describe.skip

if (HAS_SUPABASE) {
  process.env.BREADBOX_MODE = "hosted"
  process.env.BREADBOX_HOSTED = "1"
  // Capture the service-role key into secrets.ts before any repo loads.
  // bootstrap-secrets normally does this on server start; here we mimic.
  const { captureSupabaseServiceRoleKey } = await import("../../secrets")
  captureSupabaseServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY)
}

// Dynamic import so the env vars above land before module init.
const { projectRepo, VersionConflictError } = HAS_SUPABASE
  ? await import("../../db/adapters/supabase/project-repo")
  : ({} as never)

let admin: SupabaseClient
let userAId: string
let userBId: string

async function createTestUser(): Promise<string> {
  const email = `test-${crypto.randomUUID()}@dreamer.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `pw-${crypto.randomUUID()}`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  return data.user.id
}

describeOrSkip("supabase projects — RLS + version", () => {
  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    userAId = await createTestUser()
    userBId = await createTestUser()
  })

  afterAll(async () => {
    if (!HAS_SUPABASE) return
    if (userAId) await admin.auth.admin.deleteUser(userAId)
    if (userBId) await admin.auth.admin.deleteUser(userBId)
  })

  test("user B cannot read user A's project", async () => {
    const created = await projectRepo.createProject({ ownerId: userAId })
    const fromA = await projectRepo.readProject(created.project.id, userAId)
    const fromB = await projectRepo.readProject(created.project.id, userBId)
    expect(fromA?.project.id).toBe(created.project.id)
    expect(fromB).toBeNull()
  })

  test("user B cannot delete user A's project", async () => {
    const created = await projectRepo.createProject({ ownerId: userAId })
    const deleted = await projectRepo.deleteProject(created.project.id, userBId)
    expect(deleted).toBe(false)
    // Still exists for A.
    const fromA = await projectRepo.readProject(created.project.id, userAId)
    expect(fromA).not.toBeNull()
  })

  test("user B cannot rename user A's project", async () => {
    const created = await projectRepo.createProject({ ownerId: userAId })
    const renamed = await projectRepo.renameProject(
      created.project.id,
      userBId,
      "Hijacked",
    )
    expect(renamed).toBeNull()
    const fromA = await projectRepo.readProject(created.project.id, userAId)
    expect(fromA?.project.name).not.toBe("Hijacked")
  })

  test("listProjects scopes to owner", async () => {
    await projectRepo.createProject({ ownerId: userAId, name: "A-1" })
    await projectRepo.createProject({ ownerId: userAId, name: "A-2" })
    await projectRepo.createProject({ ownerId: userBId, name: "B-1" })
    const listA = await projectRepo.listProjects(userAId)
    const listB = await projectRepo.listProjects(userBId)
    expect(listA.length).toBeGreaterThanOrEqual(2)
    expect(listB.length).toBeGreaterThanOrEqual(1)
    expect(listA.every((p) => p.name !== "B-1")).toBe(true)
    expect(listB.every((p) => p.name !== "A-1" && p.name !== "A-2")).toBe(true)
  })

  test("optimistic concurrency: stale applyOps throws VersionConflictError", async () => {
    const created = await projectRepo.createProject({ ownerId: userAId })
    const id = created.project.id

    // Read twice — simulates two clients holding the same base snapshot.
    const snapshotA = await projectRepo.readProject(id, userAId)
    const snapshotB = await projectRepo.readProject(id, userAId)
    expect(snapshotA?.project.version).toBe(snapshotB?.project.version)

    const initialVersion = snapshotA!.project.version
    // Client A wins.
    const renamed = await projectRepo.renameProject(id, userAId, "First-Edit")
    expect(renamed).not.toBeNull()

    // Client B's applyOps with the stale version must throw VersionConflict.
    await expect(
      projectRepo.applyOps(id, userAId, {
        expectedVersion: initialVersion,
        ops: [
          {
            opId: crypto.randomUUID(),
            expectedVersion: initialVersion,
            kind: "rename_scene",
            sceneId: snapshotB!.project.activeSceneId,
            payload: { name: "should-not-apply" },
          } as never,
        ],
      }),
    ).rejects.toBeInstanceOf(VersionConflictError)
  })
})
