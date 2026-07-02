// ── Secret capture (must be the first import in index.ts) ───────────────
//
// ESM hoists imports, so the only way to guarantee this runs before the
// agent tools module is imported — and therefore before any code path
// can snapshot `process.env.ANTHROPIC_API_KEY` — is to load this file at
// the top of the entry point. A prompt-injected agent that later reads
// `process.env` sees the slot already deleted.

import { captureAnthropicApiKey } from "./secrets"

const anthropic = process.env.ANTHROPIC_API_KEY ?? ""
captureAnthropicApiKey(anthropic)
delete process.env.ANTHROPIC_API_KEY
