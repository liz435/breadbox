// ── Anthropic provider (API-key-injected) ───────────────────────────────
//
// The default `anthropic` export from `@ai-sdk/anthropic` reads
// `process.env.ANTHROPIC_API_KEY` at call time. In the hosted server we
// strip that env slot at boot (see `packages/api/src/index.ts` +
// `secrets.ts`) and route through this factory, which pulls the captured
// key — so a prompt-injected tool can't read the raw env.
//
// In CLI/desktop mode `bootstrap-secrets` never runs (the CLI imports API
// route modules directly, not the API entrypoint), so the captured key is
// "" and the key lives in `process.env.ANTHROPIC_API_KEY` instead (set by
// the serve/headed bootstrap or the in-app key route). Passing `undefined`
// — rather than "" — lets the AI SDK fall back to that env var and re-read
// it lazily on each request. Note `loadApiKey` returns "" verbatim for an
// empty string, so the `|| undefined` is load-bearing.

import { createAnthropic } from "@ai-sdk/anthropic"
import { getAnthropicApiKey } from "../secrets"

let cached: { key: string; provider: ReturnType<typeof createAnthropic> } | null = null

function provider(): ReturnType<typeof createAnthropic> {
  const key = getAnthropicApiKey()
  if (cached && cached.key === key) return cached.provider
  cached = { key, provider: createAnthropic({ apiKey: key || undefined }) }
  return cached.provider
}

export function anthropicModel(modelId: string) {
  return provider()(modelId)
}
