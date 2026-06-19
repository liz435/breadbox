// ── Supabase auth middleware (hosted mode) ──────────────────────────────
//
// Per-request Elysia .derive that:
//   1. Builds a server-side Supabase client bound to this request's
//      cookies (read from Cookie header, written via Set-Cookie).
//   2. Calls supabase.auth.getUser() — verifies the access-token cookie's
//      signature/expiry, transparently refreshing via the refresh-token
//      cookie when needed. The refresh writes new cookies back via the
//      setAll callback, which we then attach to the response.
//   3. Threads { auth: { userId, sessionId: null, isHosted: true } } onto
//      the context for downstream routes.
//
// The middleware does NOT use a user-scoped client for DB work — all DB
// queries go through the service-role admin client after this hook has
// extracted the verified user id. RLS is defense-in-depth.

import { Elysia } from "elysia"
import type { AuthContext } from "./context"
import { bindCookieJar, createRequestClient } from "../supabase/request-client"
import { createLogger } from "../logger"

const log = createLogger("auth-middleware")

// Public endpoints — reachable without an auth context. Keep this set
// deliberately small; a stray entry here is a tenant-takeover bug.
// Sign-in / callback / sign-out live under /auth/* and are matched by the
// AUTHED_PREFIXES check below: those prefixes don't start with /auth, so
// the gate skips them by falling through to the second isAuthedApiPath
// branch.
const PUBLIC_PATHS = new Set<string>([
  "/api/capabilities",
  "/api/auth/me",
  "/api/eval/dashboard",
  "/api/eval/summary",
  "/api/eval/all",
])

// The API's guarded surface. Anything outside these prefixes — static
// assets, the SPA shell, favicon, SPA client-side routes that fall through
// to index.html — is served without auth.
const AUTHED_PREFIXES = ["/api", "/project", "/agent"] as const

function isAuthedApiPath(pathname: string): boolean {
  for (const prefix of AUTHED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true
  }
  return false
}

export const supabaseAuthPlugin = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  async (ctx): Promise<{ auth: AuthContext | null } | Record<string, never>> => {
    // Idempotent: a prior derive (e.g. a test fixture injecting a
    // synthetic owner) already produced auth — don't clobber.
    if ("auth" in ctx && ctx.auth != null) return {}

    const { request, set } = ctx
    const url = new URL(request.url)

    if (PUBLIC_PATHS.has(url.pathname)) return { auth: null }
    if (!isAuthedApiPath(url.pathname)) return { auth: null }

    const { jar, attach } = bindCookieJar(request, set)
    const supabase = createRequestClient(jar)

    let userId: string | null = null
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error) {
        // "no session" / "session_not_found" are the expected outcomes
        // when a caller arrives without cookies; anything else is an
        // operational signal (Supabase outage, key mismatch, network).
        // Log non-routine errors so they surface during an incident
        // rather than presenting as silent 401s.
        const msg = error.message ?? ""
        if (
          !msg.toLowerCase().includes("session") &&
          !msg.toLowerCase().includes("auth session missing")
        ) {
          log.warn(`getUser error: ${msg}`)
        }
      } else if (data.user) {
        userId = data.user.id
      }
    } catch (err) {
      // Network/transport-level failures throw rather than returning an
      // error field. Same disposition (401 below) but worth a log line.
      log.warn(
        `getUser threw: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Attach any Set-Cookie strings the refresh flow wrote.
    attach()

    if (!userId) {
      set.status = 401
      throw new Error("unauthorized")
    }
    return { auth: { userId, sessionId: null, isHosted: true } }
  },
)
