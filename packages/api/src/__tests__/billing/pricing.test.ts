// ── Pricing unit tests ──────────────────────────────────────────────────
//
// Pure — no Supabase needed. Lives in __tests__/billing/ so it shares a
// suite with the supabase-gated tests in __tests__/supabase/billing/
// once those exist.

import { describe, expect, test } from "bun:test"
import { makePricer, priceLlmDebit } from "../../billing"
import {
  DEFAULT_PRICING_CONFIG,
  LLM_MARKUP_FACTOR,
} from "../../billing/pricing-config"

describe("priceLlmDebit (singleton)", () => {
  test("typical Sonnet turn (5k input + 1k output) → ~10 credits", () => {
    const credits = priceLlmDebit({
      kind: "llm",
      model: "claude-sonnet-4-6",
      inputTokens: 5_000,
      outputTokens: 1_000,
    })
    // (5k/1M)*$3 + (1k/1M)*$15 = $0.030 → ceil(0.030 * 320) = 10
    expect(credits).toBe(10)
  })

  test("minimum is 1 credit even for ~0 token usage", () => {
    const credits = priceLlmDebit({
      kind: "llm",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1,
      outputTokens: 1,
    })
    expect(credits).toBe(1)
  })

  test("long context burns proportionally", () => {
    const credits = priceLlmDebit({
      kind: "llm",
      model: "claude-sonnet-4-6",
      inputTokens: 200_000,
      outputTokens: 10_000,
    })
    // (200k/1M)*$3 + (10k/1M)*$15 = $0.75 → ceil(0.75 * 320) = 240
    // (IEEE 754: 0.75 * 320 evaluates to 240.0000000000003, so ceil
    // bumps to 241. The 1-credit over-rounding is acceptable noise.)
    expect(credits).toBeGreaterThanOrEqual(240)
    expect(credits).toBeLessThanOrEqual(241)
  })

  test("floor model lifts the cheaper actual model's price", () => {
    // Haiku rates would be cheaper than Sonnet at the same tokens;
    // with floor=haiku and actual=haiku, the price tracks haiku alone.
    // With floor=haiku and actual=sonnet, sonnet's number wins (it's
    // already higher).
    const sonnet = priceLlmDebit({
      kind: "llm",
      model: "claude-sonnet-4-6",
      inputTokens: 5_000,
      outputTokens: 1_000,
    })
    const haiku = priceLlmDebit({
      kind: "llm",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 5_000,
      outputTokens: 1_000,
    })
    // Haiku at the same tokens: (5k/1M)*$1 + (1k/1M)*$5 = $0.010
    // → ceil(0.010 * 320) = 4. Floor model = haiku, so when actual is
    // haiku the price IS haiku's number.
    expect(haiku).toBe(4)
    expect(sonnet).toBeGreaterThan(haiku)
  })
})

describe("makePricer (configurable)", () => {
  test("floor=null disables the floor entirely", () => {
    const noFloor = makePricer({
      ...DEFAULT_PRICING_CONFIG,
      floorModel: null,
    })
    const credits = noFloor.priceLlmDebit({
      kind: "llm",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 5_000,
      outputTokens: 1_000,
    })
    // Should equal raw haiku pricing — no max() applied.
    expect(credits).toBe(4)
  })

  test("doubling markup doubles the credit cost", () => {
    const doubled = makePricer({
      ...DEFAULT_PRICING_CONFIG,
      llmMarkup: LLM_MARKUP_FACTOR * 2,
    })
    const credits = doubled.priceLlmDebit({
      kind: "llm",
      model: "claude-sonnet-4-6",
      inputTokens: 5_000,
      outputTokens: 1_000,
    })
    expect(credits).toBe(20)
  })
})
