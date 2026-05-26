// ── Pricing config (data only) ──────────────────────────────────────────
//
// Pure data. No imports with side effects, so this file is safe to pull
// into the client bundle if we ever need to render "cost preview" in
// the chat UI. The behavior layer (`pricing.ts`) reads from here.
//
// Tuning markup / model rates / floor → edit this file.

/**
 * Models we know how to price. Adding a new entry to MODEL_RATES below
 * widens this union; the compiler refuses unknown ids at the boundary,
 * so a stray model name in agent output can't be silently billed at $0.
 */
export type DreamerSupportedLLM =
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001"

/**
 * Provider USD cost per 1M input/output tokens. Sourced from Anthropic's
 * public pricing (2026-05). Update here when the contracts move.
 */
export const MODEL_RATES: Record<
  DreamerSupportedLLM,
  { inputUsdPerMtok: number; outputUsdPerMtok: number }
> = {
  "claude-sonnet-4-6": { inputUsdPerMtok: 3.0, outputUsdPerMtok: 15.0 },
  "claude-haiku-4-5-20251001": { inputUsdPerMtok: 1.0, outputUsdPerMtok: 5.0 },
}

/**
 * Markup factor on provider USD spend. 320 means $1 of provider cost →
 * 320 credits charged to the user. At an eventual $0.025/credit basic
 * tier price, that's ~8× margin — same shape as prospect's defaults.
 *
 * Worked example with claude-sonnet-4-6, 5k input + 1k output:
 *   input  = 5k/1M × $3.00  = $0.015
 *   output = 1k/1M × $15.00 = $0.015
 *   usd    = $0.03
 *   credits = max(1, ceil($0.03 × 320)) = 10 credits
 *
 * At 300 free credits, that buys roughly 30 short turns of agent
 * activity. Long tool-heavy runs (large input contexts from board
 * snapshots) burn 30–60 credits each, so closer to 5–10 of those.
 */
export const LLM_MARKUP_FACTOR = 320

/**
 * Credit floor model. If set, LLM credits are
 * `max(actualCredits, creditsAtFloorModelRates)` — same token counts,
 * different per-token rates. Lets the API swap to a cheaper model
 * without passing the savings through to users.
 *
 * `null` disables the floor (useful for what-if simulations).
 */
export const DEFAULT_LLM_PRICE_FLOOR_MODEL: DreamerSupportedLLM | null =
  "claude-haiku-4-5-20251001"

export type PricingConfig = {
  readonly llmMarkup: number
  readonly floorModel: DreamerSupportedLLM | null
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  llmMarkup: LLM_MARKUP_FACTOR,
  floorModel: DEFAULT_LLM_PRICE_FLOOR_MODEL,
}

/**
 * Initial free-credits grant on first authed request. Matches prospect's
 * default. Lazy-seeded by `ensureWalletForUser` so signed-in users get
 * the grant the first time they hit any authed route.
 */
export const INITIAL_FREE_CREDITS = 300
