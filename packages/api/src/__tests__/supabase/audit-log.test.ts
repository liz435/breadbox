// ── Audit log (hosted) integration ──────────────────────────────────────
//
// Runs against a real Supabase. Each test creates a fresh user via the
// admin client, logs an event, and reads back via the service-role
// client (audit_events has no RLS-readable policy, so we authenticate
// with the admin key).

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
  process.env.DREAMER_MODE = "hosted"
  process.env.DREAMER_HOSTED = "1"
  const { captureSupabaseServiceRoleKey } = await import("../../secrets")
  captureSupabaseServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY)
}

const { auditLog } = HAS_SUPABASE
  ? await import("../../auth/audit-log")
  : ({ auditLog: () => {} } as never)

let admin: SupabaseClient
let userId: string

describeOrSkip("auditLog (hosted)", () => {
  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await admin.auth.admin.createUser({
      email: `test-${crypto.randomUUID()}@dreamer.test`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
    userId = data.user.id
  })

  afterAll(async () => {
    if (!HAS_SUPABASE) return
    if (userId) await admin.auth.admin.deleteUser(userId)
  })

  test("writes one row per call", async () => {
    const projectId = crypto.randomUUID()
    await auditLog({
      userId,
      action: "project.create",
      projectId,
      extra: { source: "test" },
    })
    // Wait briefly for the insert to land — auditLog is fire-and-forget.
    await new Promise((r) => setTimeout(r, 200))
    const { data, error } = await admin
      .from("audit_events")
      .select("user_id, action, project_id, extra")
      .eq("user_id", userId)
      .eq("project_id", projectId)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThanOrEqual(1)
    expect(data?.[0]?.action).toBe("project.create")
    expect((data?.[0]?.extra as { source?: string })?.source).toBe("test")
  })

  test("non-uuid userId still records the event with user_id=null", async () => {
    await auditLog({
      userId: "legacy-string-id",
      action: "agent.run",
      projectId: crypto.randomUUID(),
    })
    await new Promise((r) => setTimeout(r, 200))
    const { data } = await admin
      .from("audit_events")
      .select("user_id, action")
      .is("user_id", null)
      .eq("action", "agent.run")
      .order("ts", { ascending: false })
      .limit(1)
    expect(data?.length).toBe(1)
  })

  test("failure-isolated: malformed input doesn't throw", async () => {
    // userId field empty is a schema-fail path. auditLog should swallow
    // the validation error rather than reject.
    await expect(
      auditLog({
        userId: "",
        action: "project.create" as never,
      } as never),
    ).resolves.toBeUndefined()
  })
})
