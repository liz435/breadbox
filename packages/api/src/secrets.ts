// ── Process secrets ──────────────────────────────────────────────────────
//
// Central accessor for secrets that MUST NOT remain in `process.env` after
// boot. The capture + delete happens in `index.ts` before any route or
// agent module is imported, so the raw env slot never exists at the time
// an agent tool could introspect it.
//
// The accessor pattern (over a re-exported constant) makes the capture
// order observable: callers that read before `captureAnthropicApiKey()`
// has run get the empty-string fallback and the provider call itself will
// reject — far louder than a silently-missing key.

let anthropicApiKey = ""

export function captureAnthropicApiKey(value: string): void {
  anthropicApiKey = value
}

export function getAnthropicApiKey(): string {
  return anthropicApiKey
}
