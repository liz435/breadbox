// ── Pricing behavior ────────────────────────────────────────────────────
//
// Given `{ model, inputTokens, outputTokens }`, return the integer credit
// cost. Pure function over `PricingConfig` — the runtime path uses the
// singleton bound to `DEFAULT_PRICING_CONFIG`; replay / simulator code
// can call `makePricer(altConfig).priceLlmDebit` to evaluate
// counterfactuals without mutating module state.
//
// The floor model rule: credits = max(actualCredits, floorCredits).
// `actual` is the real model's per-token rates × tokens × markup;
// `floor` is the floor model's per-token rates × the same tokens ×
// markup. Charging the larger means a quiet swap to a cheaper model
// doesn't pass the savings through to users — internal margin lever
// only, like cache hits.

import {
  DEFAULT_PRICING_CONFIG,
  MODEL_RATES,
  type DreamerSupportedLLM,
  type PricingConfig,
} from "./pricing-config"

export type LlmDebitContext = {
  readonly kind: "llm"
  readonly model: DreamerSupportedLLM
  readonly inputTokens: number
  readonly outputTokens: number
}

export type Pricer = {
  readonly config: PricingConfig
  readonly priceLlmDebit: (ctx: LlmDebitContext) => number
}

function creditsForModel(
  model: DreamerSupportedLLM,
  inputTokens: number,
  outputTokens: number,
  markup: number,
): number {
  const rates = MODEL_RATES[model]
  const usd =
    (inputTokens / 1_000_000) * rates.inputUsdPerMtok +
    (outputTokens / 1_000_000) * rates.outputUsdPerMtok
  // Clamp to ≥ 1 — every billable run leaves a non-zero trace. A 0-credit
  // ledger row would be free debugging trivia; we'd rather charge the
  // minimum and have an audit trail.
  return Math.max(1, Math.ceil(usd * markup))
}

export function makePricer(config: PricingConfig): Pricer {
  function priceLlmDebit(ctx: LlmDebitContext): number {
    const actual = creditsForModel(
      ctx.model,
      ctx.inputTokens,
      ctx.outputTokens,
      config.llmMarkup,
    )
    if (config.floorModel === null || config.floorModel === ctx.model) {
      return actual
    }
    const floor = creditsForModel(
      config.floorModel,
      ctx.inputTokens,
      ctx.outputTokens,
      config.llmMarkup,
    )
    return Math.max(actual, floor)
  }
  return { config, priceLlmDebit }
}

const defaultPricer = makePricer(DEFAULT_PRICING_CONFIG)

/** Singleton bound to `DEFAULT_PRICING_CONFIG`. Production-path entry point. */
export const priceLlmDebit = defaultPricer.priceLlmDebit
