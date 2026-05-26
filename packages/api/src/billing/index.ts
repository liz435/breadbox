// Public barrel for the billing domain. Pricing + errors only; the
// stateful wallet/ledger service lives at services/billing.ts.

export {
  DEFAULT_PRICING_CONFIG,
  DEFAULT_LLM_PRICE_FLOOR_MODEL,
  INITIAL_FREE_CREDITS,
  LLM_MARKUP_FACTOR,
  MODEL_RATES,
  type DreamerSupportedLLM,
  type PricingConfig,
} from "./pricing-config"
export {
  makePricer,
  priceLlmDebit,
  type LlmDebitContext,
  type Pricer,
} from "./pricing"
export { InsufficientCreditsError, BillingMisconfiguredError } from "./errors"
