// ── Wallet service ──────────────────────────────────────────────────────
//
// Three operations on `credit_wallets` / `credit_transactions`:
//
//   ensureWalletForUser(userId) → lazy idempotent seed + grant_signup
//   assertCreditsAvailable(userId) → pre-run gate (throws on ≤ 0)
//   debitForLlmRun(userId, runId, ctx) → post-run debit, idempotent on runId
//
// All three are no-ops in CLI mode — billing only matters when Supabase
// is the backend. CLI mode reports `Infinity` from getWallet so the
// frontend chip renders something meaningful without a hosted check.
//
// The wallet + ledger writes both go through Supabase RPCs (defined in
// migration 0002_billing.sql) that wrap the (insert ledger row, update
// wallet) pair in one transaction. No two-round-trip race possible.

import { getSupabaseAdmin } from "../supabase/admin-client"
import { IS_HOSTED_MODE } from "../supabase/env"
import { createLogger } from "../logger"
import {
  INITIAL_FREE_CREDITS,
  priceLlmDebit,
  type LlmDebitContext,
} from "../billing"
import {
  InsufficientCreditsError,
  BillingMisconfiguredError,
} from "../billing/errors"

const log = createLogger("billing-service")

export type WalletSnapshot = {
  /**
   * Available credits. `Number.POSITIVE_INFINITY` in CLI mode so the UI
   * can render "unlimited" without an `IS_HOSTED_MODE` import. Negative
   * values are possible after an over-spend (post-run debit ran a
   * balance into the red); the gate refuses the next run.
   */
  balancePosted: number
  updatedAt: string | null
}

const UNLIMITED: WalletSnapshot = {
  balancePosted: Number.POSITIVE_INFINITY,
  updatedAt: null,
}

/**
 * Lazy idempotent wallet seed. Safe to call on every authed request —
 * the RPC short-circuits when a wallet already exists. Returns the
 * current balance so callers can render without a follow-up read.
 *
 * In CLI mode this is a no-op returning the sentinel `UNLIMITED`.
 */
export async function ensureWalletForUser(
  userId: string,
): Promise<WalletSnapshot> {
  if (!IS_HOSTED_MODE) return UNLIMITED
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc("ensure_credit_wallet", {
    p_user_id: userId,
    p_initial_credits: INITIAL_FREE_CREDITS,
  })
  if (error) {
    throw new BillingMisconfiguredError(
      `ensure_credit_wallet rpc failed: ${error.message}`,
    )
  }
  // RPC returns a single-row table { created: bool, balance_posted: int }.
  const row = Array.isArray(data) ? data[0] : data
  const balance =
    typeof row?.balance_posted === "number"
      ? row.balance_posted
      : INITIAL_FREE_CREDITS
  if (row?.created) {
    log.info(`granted ${INITIAL_FREE_CREDITS} signup credits to user ${userId}`)
  }
  return { balancePosted: balance, updatedAt: new Date().toISOString() }
}

/**
 * Read the wallet without seeding. Returns null when no wallet row
 * exists (caller can decide whether to ensure or treat as zero).
 */
export async function getWallet(
  userId: string,
): Promise<WalletSnapshot | null> {
  if (!IS_HOSTED_MODE) return UNLIMITED
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("credit_wallets")
    .select("balance_posted, updated_at")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    throw new BillingMisconfiguredError(`wallet read failed: ${error.message}`)
  }
  if (!data) return null
  return {
    balancePosted: data.balance_posted as number,
    updatedAt: (data.updated_at as string | null) ?? null,
  }
}

/**
 * Pre-run balance gate. Throws `InsufficientCreditsError` when the
 * available balance is ≤ 0. Strict zero — no per-step floor is reserved
 * here, so a single run can drive the balance negative by exactly one
 * run's worth of credits. We accept that overdraft.
 *
 * Lazy-seeds the wallet on first call so a brand-new user isn't told
 * "you're out of credits" before they've ever been granted any. This is
 * the cheap defense against the foot-gun where a caller forgets to
 * `ensureWalletForUser` first. The seed is idempotent.
 *
 * No-op in CLI mode.
 */
export async function assertCreditsAvailable(userId: string): Promise<void> {
  if (!IS_HOSTED_MODE) return
  const wallet = await ensureWalletForUser(userId)
  if (wallet.balancePosted <= 0) {
    throw new InsufficientCreditsError(userId, wallet.balancePosted)
  }
}

/**
 * Post-run debit. Computes credits from the LLM context, posts one
 * ledger row keyed `(ref_type='run', ref_id=runId)`, decrements the
 * wallet. The whole thing is atomic inside the Supabase RPC; a
 * duplicate call (e.g. retry after a transient error) returns
 * `{ debited: false }` without posting a second row.
 *
 * No-op in CLI mode.
 */
export async function debitForLlmRun(args: {
  userId: string
  runId: string
  llm: LlmDebitContext
  /**
   * Optional: who triggered the run. In a multi-seat workspaces future
   * this would be the acting member; today it's the same as `userId`.
   */
  actingUserId?: string
}): Promise<{ debited: boolean; credits: number; balancePosted: number }> {
  if (!IS_HOSTED_MODE) {
    return {
      debited: false,
      credits: 0,
      balancePosted: Number.POSITIVE_INFINITY,
    }
  }
  const credits = priceLlmDebit(args.llm)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc("debit_credits", {
    p_user_id: args.userId,
    p_credits: credits,
    p_kind: "debit_llm",
    p_ref_type: "run",
    p_ref_id: args.runId,
    p_metadata: {
      model: args.llm.model,
      input_tokens: args.llm.inputTokens,
      output_tokens: args.llm.outputTokens,
    },
    p_created_by_user_id: args.actingUserId ?? args.userId,
  })
  if (error) {
    // Don't throw — a debit failure shouldn't propagate back as a 500
    // after the agent already replied. Log loudly and let the operator
    // reconcile. (Audit row in app_logs picks it up.)
    log.warn(
      `debit_credits rpc failed for run ${args.runId}: ${error.message}`,
    )
    return { debited: false, credits, balancePosted: 0 }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    debited: Boolean(row?.debited),
    credits,
    balancePosted: typeof row?.balance_posted === "number"
      ? row.balance_posted
      : 0,
  }
}
