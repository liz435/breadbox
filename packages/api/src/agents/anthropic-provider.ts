// ── Anthropic provider (API-key-injected) ───────────────────────────────
//
// The default `anthropic` export from `@ai-sdk/anthropic` reads
// `process.env.ANTHROPIC_API_KEY` at call time. We strip that env slot at
// boot (see `packages/api/src/index.ts` + `secrets.ts`), so every call
// site must route through this factory, which pulls the captured key.

import { createAnthropic } from "@ai-sdk/anthropic"
import { getAnthropicApiKey } from "../secrets"

let cached: { key: string; provider: ReturnType<typeof createAnthropic> } | null = null

function provider(): ReturnType<typeof createAnthropic> {
  const key = getAnthropicApiKey()
  if (cached && cached.key === key) return cached.provider
  cached = { key, provider: createAnthropic({ apiKey: key }) }
  return cached.provider
}

export function anthropicModel(modelId: string) {
  return provider()(modelId)
}
