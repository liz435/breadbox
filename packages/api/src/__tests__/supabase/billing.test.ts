// ── Billing integration (hosted) ────────────────────────────────────────
//
// Exercises the full wallet/ledger path against a real Supabase. Each
// test creates fresh users via the admin client, runs the service-layer
// operations, and reads back via the service-role client (which sees
// every row regardless of RLS).
//
// RLS coverage is in the user-scoped reads below — we sign in as user B
// and confirm getWallet/getLedger return null for user A's data.

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
  const { captureSupabaseServiceRoleKey } = await import("../../secrets")
  captureSupabaseServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY)
}

const {
  ensureWalletForUser,
  getWallet,
  assertCreditsAvailable,
  debitForLlmRun,
} = HAS_SUPABASE
  ? await import("../../services/billing")
  : ({
      ensureWalletForUser: async () => ({ balancePosted: 0, updatedAt: null }),
      getWallet: async () => null,
      assertCreditsAvailable: async () => {},
      debitForLlmRun: async () => ({ debited: false, credits: 0, balancePosted: 0 }),
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
    email: `billing-${crypto.randomUUID()}@dreamer.test`,
    password: `pw-${crypto.randomUUID()}`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  createdUserIds.push(data.user.id)
  return data.user.id
}

describeOrSkip("billing — wallet + ledger", () => {
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

  // ── ensureWalletForUser ───────────────────────────────────────────

  test("first call seeds wallet + grant_signup row at the configured initial balance", async () => {
    const userId = await newUser()
    const snap = await ensureWalletForUser(userId)
    expect(snap.balancePosted).toBe(INITIAL_FREE_CREDITS)
    // Ledger entry exists.
    const { data } = await admin
      .from("credit_transactions")
      .select("kind, delta")
      .eq("user_id", userId)
    expect(data?.length).toBe(1)
    expect(data?.[0]?.kind).toBe("grant_signup")
    expect(data?.[0]?.delta).toBe(INITIAL_FREE_CREDITS)
  })

  test("second call is a no-op — no duplicate grant, no duplicate wallet", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    await ensureWalletForUser(userId)
    const { data } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
    expect(data?.length).toBe(1)
  })

  // ── assertCreditsAvailable ───────────────────────────────────────

  test("gate throws InsufficientCreditsError when balance is 0", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    // Drain the balance via an adjustment.
    await admin.rpc("debit_credits", {
      p_user_id: userId,
      p_credits: INITIAL_FREE_CREDITS,
      p_kind: "adjustment",
      p_ref_type: "admin_adjustment",
      p_ref_id: `drain-${userId}`,
      p_metadata: { reason: "test drain" },
      p_created_by_user_id: null,
    })
    await expect(assertCreditsAvailable(userId)).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    )
  })

  test("gate passes when balance is positive", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    await expect(assertCreditsAvailable(userId)).resolves.toBeUndefined()
  })

  // ── debitForLlmRun ───────────────────────────────────────────────

  test("first debit posts ledger row + decrements wallet", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    const runId = crypto.randomUUID()
    const result = await debitForLlmRun({
      userId,
      runId,
      llm: {
        kind: "llm",
        model: "claude-sonnet-4-6",
        inputTokens: 5_000,
        outputTokens: 1_000,
      },
    })
    expect(result.debited).toBe(true)
    expect(result.credits).toBeGreaterThan(0)
    expect(result.balancePosted).toBe(INITIAL_FREE_CREDITS - result.credits)
    const after = await getWallet(userId)
    expect(after?.balancePosted).toBe(result.balancePosted)
  })

  test("duplicate debit on same runId returns debited=false, no second ledger row", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    const runId = crypto.randomUUID()
    const first = await debitForLlmRun({
      userId,
      runId,
      llm: { kind: "llm", model: "claude-sonnet-4-6", inputTokens: 5_000, outputTokens: 1_000 },
    })
    const second = await debitForLlmRun({
      userId,
      runId,
      llm: { kind: "llm", model: "claude-sonnet-4-6", inputTokens: 5_000, outputTokens: 1_000 },
    })
    expect(first.debited).toBe(true)
    expect(second.debited).toBe(false)
    expect(second.balancePosted).toBe(first.balancePosted)
    const { data } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "debit_llm")
    expect(data?.length).toBe(1)
  })

  // ── Ledger immutability ──────────────────────────────────────────

  test("UPDATE on credit_transactions is silently dropped by PG rule", async () => {
    const userId = await newUser()
    await ensureWalletForUser(userId)
    const { data: before } = await admin
      .from("credit_transactions")
      .select("delta")
      .eq("user_id", userId)
      .single()
    const originalDelta = before?.delta as number
    // Attempt update — should be a no-op (PG RULE intercepts).
    await admin
      .from("credit_transactions")
      .update({ delta: 0 })
      .eq("user_id", userId)
    const { data: after } = await admin
      .from("credit_transactions")
      .select("delta")
      .eq("user_id", userId)
      .single()
    expect(after?.delta).toBe(originalDelta)
  })

  // ── Concurrent first-call race ──────────────────────────────────

  test("two concurrent ensureWalletForUser calls produce exactly one grant_signup row", async () => {
    const userId = await newUser()
    // Fire both concurrently. The race window inside the RPC's BEGIN
    // block is what the partial unique index + exception handler are
    // there to defend; we want to confirm exactly one grant_signup
    // row lands and the wallet ends at the configured initial balance.
    await Promise.all([
      ensureWalletForUser(userId),
      ensureWalletForUser(userId),
    ])

    const { data: ledger } = await admin
      .from("credit_transactions")
      .select("id, delta, kind")
      .eq("user_id", userId)
      .eq("kind", "grant_signup")
    expect(ledger?.length).toBe(1)
    expect(ledger?.[0]?.delta).toBe(INITIAL_FREE_CREDITS)

    const wallet = await getWallet(userId)
    expect(wallet?.balancePosted).toBe(INITIAL_FREE_CREDITS)
  })

  // ── RLS isolation ───────────────────────────────────────────────
  //
  // The contract: user B, holding a valid JWT, cannot read user A's
  // wallet. We sign in as user B via the anon client (which respects
  // RLS) and confirm a query for the credit_wallets table returns only
  // their own row.

  test("user B's authenticated client cannot read user A's wallet", async () => {
    const userAId = await newUser()
    await ensureWalletForUser(userAId)

    // Create user B and sign them in to get a real JWT.
    const password = `pw-${crypto.randomUUID()}`
    const { data: createdB, error: createErr } =
      await admin.auth.admin.createUser({
        email: `rls-${crypto.randomUUID()}@dreamer.test`,
        password,
        email_confirm: true,
      })
    if (createErr || !createdB.user) {
      throw new Error(`createUser B: ${createErr?.message}`)
    }
    createdUserIds.push(createdB.user.id)
    await ensureWalletForUser(createdB.user.id)

    const userBEmail = createdB.user.email ?? ""
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: signIn, error: signInErr } =
      await anon.auth.signInWithPassword({ email: userBEmail, password })
    if (signInErr || !signIn.session) {
      throw new Error(`signIn B: ${signInErr?.message ?? "no session"}`)
    }

    // Now query as user B. RLS policy `using (user_id = auth.uid())`
    // must hide user A's row and return only user B's.
    const { data, error } = await anon
      .from("credit_wallets")
      .select("user_id")
    expect(error).toBeNull()
    const ids = (data ?? []).map((r) => r.user_id as string)
    expect(ids).not.toContain(userAId)
    expect(ids).toContain(createdB.user.id)
    // Single-row visibility — exactly user B, no leak.
    expect(ids).toHaveLength(1)
  })
})
