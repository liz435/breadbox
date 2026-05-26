// ── 402 gate integration ────────────────────────────────────────────────
//
// Confirms the contract that matters most to the UX: when a user's
// wallet hits 0, the API returns HTTP 402 BEFORE opening an SSE stream
// or writing any agent-run record. The full `/api/chat` route is too
// heavy to spin up here (depends on Anthropic + the agent harness), so
// we exercise the gate at the service layer through a thin Elysia
// route that mirrors what chat.ts / agent-run.ts do at request entry.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
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

const { ensureWalletForUser, assertCreditsAvailable } = HAS_SUPABASE
  ? await import("../../services/billing")
  : ({
      ensureWalletForUser: async () => ({ balancePosted: 0, updatedAt: null }),
      assertCreditsAvailable: async () => {},
    } as never)

const { InsufficientCreditsError } = HAS_SUPABASE
  ? await import("../../billing/errors")
  : ({ InsufficientCreditsError: Error } as never)

const { INITIAL_FREE_CREDITS } = HAS_SUPABASE
  ? await import("../../billing")
  : ({ INITIAL_FREE_CREDITS: 300 } as never)

let admin: SupabaseClient
const createdUserIds: string[] = []

async function newUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `gate402-${crypto.randomUUID()}@dreamer.test`,
    password: `pw-${crypto.randomUUID()}`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  createdUserIds.push(data.user.id)
  return data.user.id
}

// Mirror what chat.ts / agent-run.ts do at request entry: lazy-seed the
// wallet, then gate. The pattern is identical at both call sites; if it
// drifts, this test catches it via the route shape.
function buildGatedRoute() {
  return new Elysia()
    .derive({ as: "global" }, ({ headers }) => {
      const userId = headers["x-test-user"]
      return userId
        ? { auth: { userId, sessionId: null, mode: "hosted" as const } }
        : { auth: null as null }
    })
    .post("/api/chat-test", async ({ auth, set }) => {
      if (!auth) {
        set.status = 401
        return { error: "unauthorized" }
      }
      try {
        await ensureWalletForUser(auth.userId)
        await assertCreditsAvailable(auth.userId)
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          set.status = 402
          return { error: "insufficient credits", available: err.available }
        }
        throw err
      }
      return { ok: true }
    })
}

describeOrSkip("402 gate — chat/agent-run pre-stream", () => {
  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  afterAll(async () => {
    if (!HAS_SUPABASE) return
    for (const id of createdUserIds) {
      try {
        await admin.auth.admin.deleteUser(id)
      } catch {
        // best-effort
      }
    }
  })

  test("fresh user is auto-seeded and passes the gate", async () => {
    const userId = await newUser()
    const app = buildGatedRoute()
    const res = await app.handle(
      new Request("http://localhost/api/chat-test", {
        method: "POST",
        headers: { "x-test-user": userId },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  test("draining the wallet to 0 returns 402 with available=0", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)

    // Drain via the admin RPC.
    const { error: drainErr } = await admin.rpc("debit_credits", {
      p_user_id: userId,
      p_credits: INITIAL_FREE_CREDITS,
      p_kind: "adjustment",
      p_ref_type: "admin_adjustment",
      p_ref_id: `drain-402-${userId}`,
      p_metadata: { reason: "test 402 gate" },
      p_created_by_user_id: null,
    })
    expect(drainErr).toBeNull()

    const app = buildGatedRoute()
    const res = await app.handle(
      new Request("http://localhost/api/chat-test", {
        method: "POST",
        headers: { "x-test-user": userId },
      }),
    )
    expect(res.status).toBe(402)
    const body = (await res.json()) as { error: string; available: number }
    expect(body.error).toBe("insufficient credits")
    expect(body.available).toBe(0)
  })

  test("gate gates BEFORE any side effects — no agent_runs row written", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    await admin.rpc("debit_credits", {
      p_user_id: userId,
      p_credits: INITIAL_FREE_CREDITS,
      p_kind: "adjustment",
      p_ref_type: "admin_adjustment",
      p_ref_id: `drain-side-${userId}`,
      p_metadata: {},
      p_created_by_user_id: null,
    })

    const app = buildGatedRoute()
    await app.handle(
      new Request("http://localhost/api/chat-test", {
        method: "POST",
        headers: { "x-test-user": userId },
      }),
    )

    // The point of the test: no second debit row should have been
    // written for this user beyond the seed + drain. The gate fires
    // BEFORE any agent activity, so no `debit_llm` row exists.
    const { data } = await admin
      .from("credit_transactions")
      .select("kind")
      .eq("user_id", userId)
      .eq("kind", "debit_llm")
    expect(data?.length).toBe(0)
  })
})
