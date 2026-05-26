// ── Supabase admin client (service role) ────────────────────────────────
//
// Singleton client used by every server-side mutation. Bypasses RLS —
// the API enforces ownership in code, treating RLS as defense-in-depth.
// Never expose this client to a request handler that proxies arbitrary
// SQL; the ownership predicate must always live in the API.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_URL, IS_HOSTED_MODE } from "./env"
import { getSupabaseServiceRoleKey } from "../secrets"

let cached: SupabaseClient | null = null

/**
 * Lazy singleton: hosted-mode-only. CLI mode never touches this — if it
 * does, we throw loudly so the misuse surfaces at the call site.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!IS_HOSTED_MODE) {
    throw new Error(
      "getSupabaseAdmin() called in CLI mode — Supabase client is hosted-only",
    )
  }
  if (cached) return cached
  const key = getSupabaseServiceRoleKey()
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is empty — was bootstrap-secrets.ts loaded first?",
    )
  }
  cached = createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        // Identify our service-role calls in Supabase logs.
        "x-dreamer-client": "api-admin",
      },
    },
  })
  return cached
}
