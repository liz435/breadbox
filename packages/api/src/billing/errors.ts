// ── Billing errors ──────────────────────────────────────────────────────
//
// Concrete error classes with structured fields the route layer can map
// to HTTP responses. The shape mirrors prospect's `Data.TaggedError`
// pattern but uses plain classes — dreamer's API doesn't depend on
// Effect, and `instanceof` checks at the route boundary are enough.

/**
 * Pre-run balance gate failed. The user has no available credits left,
 * so the agent shouldn't run. Routes map this to HTTP 402 (Payment
 * Required) so the frontend can surface a "you ran out" toast and the
 * future paid-tier UI can flip to the buy-credits modal.
 */
export class InsufficientCreditsError extends Error {
  readonly name = "InsufficientCreditsError"
  readonly userId: string
  readonly available: number
  constructor(userId: string, available: number) {
    super(`insufficient credits for user ${userId}: ${available} available`)
    this.userId = userId
    this.available = available
  }
}

/**
 * Surfaced when the billing layer is misconfigured at startup — e.g.
 * the Supabase RPC `debit_credits` is missing from the schema, or the
 * service-role client isn't reachable. Routes log + 500; not a
 * user-facing error.
 */
export class BillingMisconfiguredError extends Error {
  readonly name = "BillingMisconfiguredError"
  constructor(reason: string) {
    super(`billing misconfigured: ${reason}`)
  }
}
