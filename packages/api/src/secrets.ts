// ── Process secrets ──────────────────────────────────────────────────────
//
// Central accessor for secrets that MUST NOT remain in `process.env` after
// boot. The capture + delete happens in `bootstrap-secrets.ts` before any
// route or agent module is imported, so the raw env slots never exist at
// the time an agent tool could introspect them.
//
// The accessor pattern (over a re-exported constant) makes the capture
// order observable: callers that read before the capture has run get the
// empty-string fallback and the downstream call (provider/Supabase) will
// reject — far louder than a silently-missing key.

let anthropicApiKey = ""
let supabaseServiceRoleKey = ""

export function captureAnthropicApiKey(value: string): void {
  anthropicApiKey = value
}

export function getAnthropicApiKey(): string {
  return anthropicApiKey
}

export function captureSupabaseServiceRoleKey(value: string): void {
  supabaseServiceRoleKey = value
}

export function getSupabaseServiceRoleKey(): string {
  return supabaseServiceRoleKey
}
