// ── Supabase auth middleware (hosted mode) ──────────────────────────────
//
// Per-request Elysia .derive that:
//   1. Builds a server-side Supabase client bound to this request's
//      cookies (read from Cookie header, written via Set-Cookie).
//   2. Calls supabase.auth.getUser() — verifies the access-token cookie's
//      signature/expiry, transparently refreshing via the refresh-token
//      cookie when needed. The refresh writes new cookies back via the
//      setAll callback, which we then attach to the response.
//   3. Threads { auth: { userId, sessionId: null, mode: "hosted" } } onto
//      the context for downstream routes.
//
// The middleware does NOT use a user-scoped client for DB work — all DB
// queries go through the service-role admin client after this hook has
// extracted the verified user id. RLS is defense-in-depth.

import { Elysia } from "elysia"
import type { AuthContext } from "./context"
import { createRequestClient, type ElysiaCookieJar } from "../supabase/request-client"

// Public endpoints — reachable without an auth context. Keep this set
// deliberately small; a stray entry here is a tenant-takeover bug.
const PUBLIC_PATHS = new Set<string>([
  "/api/capabilities",
  "/api/auth/me",
  "/auth/exchange",
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

    const jar: ElysiaCookieJar = {
      cookieHeader: request.headers.get("cookie"),
      pendingSetCookies: [],
    }
    const supabase = createRequestClient(jar)

    let userId: string | null = null
    try {
      const { data, error } = await supabase.auth.getUser()
      if (!error && data.user) userId = data.user.id
    } catch {
      // Treat any thrown error from getUser as "no session" — 401 below.
    }

    // Attach any Set-Cookie strings the refresh flow wrote. Elysia's
    // header bag for `set-cookie` accepts string | string[]; we always
    // produce an array to keep things uniform.
    if (jar.pendingSetCookies.length > 0) {
      const existing = set.headers["set-cookie"]
      const next = jar.pendingSetCookies
      set.headers["set-cookie"] = existing
        ? [
            ...(Array.isArray(existing) ? existing : [existing]),
            ...next,
          ]
        : next.length === 1
          ? next[0]!
          : next
    }

    if (!userId) {
      set.status = 401
      throw new Error("unauthorized")
    }
    return { auth: { userId, sessionId: null, mode: "hosted" } }
  },
)
