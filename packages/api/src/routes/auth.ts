// ── Auth routes ─────────────────────────────────────────────────────────
//
// Hosted mode: server-orchestrated OAuth via Supabase. We never expose
// Supabase access/refresh tokens to client JS — the whole PKCE dance
// runs through @supabase/ssr's server client, which sets HttpOnly
// cookies on our origin via the setAll adapter.
//
//   GET  /auth/sign-in        — mint PKCE pair, 302 to GitHub via Supabase
//   GET  /auth/callback       — exchange code for session, 302 to /
//   POST /auth/sign-out       — destroy session, clear cookies
//   GET  /api/auth/me         — discovery (never 401s)
//
// CLI mode: sign-in / callback / sign-out are 404 or no-ops. /api/auth/me
// returns the fixed local user.

import { Elysia } from "elysia"
import { createRequestClient, type ElysiaCookieJar } from "../supabase/request-client"
import {
  IS_HOSTED_MODE,
  CLI_LOCAL_USER_ID,
} from "../supabase/env"
import { createLogger } from "../logger"

const log = createLogger("auth-routes")

// ── redirectPath sanitizer ──────────────────────────────────────────────
//
// Same-origin paths only; defeats `?redirect=https://attacker.example`.
function sanitizeRedirectPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/"
  if (!raw.startsWith("/")) return "/"
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/"
  return raw.length > 512 ? "/" : raw
}

/**
 * Build a request-bound jar for @supabase/ssr. Returns the jar plus an
 * `attach` helper that flushes pending Set-Cookie strings onto the Elysia
 * response.
 */
function buildJar(
  request: Request,
  set: { headers: Record<string, string | string[]> },
) {
  const jar: ElysiaCookieJar = {
    cookieHeader: request.headers.get("cookie"),
    pendingSetCookies: [],
  }
  function attach(): void {
    if (jar.pendingSetCookies.length === 0) return
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
  return { jar, attach }
}

function callbackUrlFor(request: Request): string {
  // Use the forwarded host so OAuth's exact-match doesn't break behind
  // a reverse proxy (Railway terminates TLS upstream; Vite dev runs on
  // 3002 but proxies to 4111).
  const url = new URL(request.url)
  const fwdProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
  const fwdHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
  const proto = fwdProto ?? url.protocol.replace(/:$/, "")
  const host = fwdHost ?? url.host
  return `${proto}://${host}/auth/callback`
}

export const authRoutes = new Elysia({ name: "auth-routes" })
  // ── GET /auth/sign-in ─────────────────────────────────────────────
  .get("/auth/sign-in", async ({ request, query, set }) => {
    if (!IS_HOSTED_MODE) {
      set.status = 404
      return { error: "not found" }
    }

    const redirectPath = sanitizeRedirectPath(query.redirect)
    const { jar, attach } = buildJar(
      request,
      set as { headers: Record<string, string | string[]> },
    )
    const supabase = createRequestClient(jar)

    // Server-side OAuth init: returns the GitHub authorize URL and
    // sets the PKCE code_verifier cookie (via ssr setAll). We never
    // auto-navigate from server code; we 302 with Supabase's URL.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${callbackUrlFor(request)}?next=${encodeURIComponent(redirectPath)}`,
        skipBrowserRedirect: true,
      },
    })

    attach()

    if (error || !data?.url) {
      log.warn(`signInWithOAuth failed: ${error?.message ?? "no url"}`)
      set.status = 502
      return { error: "oauth init failed" }
    }

    set.status = 302
    set.headers["Location"] = data.url
    return ""
  })

  // ── GET /auth/callback ────────────────────────────────────────────
  .get("/auth/callback", async ({ request, query, set }) => {
    if (!IS_HOSTED_MODE) {
      set.status = 404
      return { error: "not found" }
    }

    const code = typeof query.code === "string" ? query.code : ""
    const next = sanitizeRedirectPath(query.next)

    if (!code) {
      set.status = 400
      return { error: "missing code" }
    }

    const { jar, attach } = buildJar(
      request,
      set as { headers: Record<string, string | string[]> },
    )
    const supabase = createRequestClient(jar)

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    attach()

    if (error || !data.session) {
      log.warn(
        `exchangeCodeForSession failed: ${error?.message ?? "no session"}`,
      )
      set.status = 502
      return { error: "oauth exchange failed" }
    }

    log.info(`signed in userId=${data.session.user.id}`)
    set.status = 302
    set.headers["Location"] = next
    return ""
  })

  // ── POST /auth/sign-out ───────────────────────────────────────────
  .post("/auth/sign-out", async ({ request, set }) => {
    if (!IS_HOSTED_MODE) {
      set.status = 200
      return { ok: true }
    }

    const { jar, attach } = buildJar(
      request,
      set as { headers: Record<string, string | string[]> },
    )
    const supabase = createRequestClient(jar)
    await supabase.auth.signOut()
    attach()

    set.status = 200
    return { ok: true }
  })

  // ── GET /api/auth/me ──────────────────────────────────────────────
  //
  // Discovery endpoint — never 401s. Hosted mode rebuilds the user from
  // a fresh ssr client (which verifies and refreshes the cookie); CLI
  // mode synthesizes the fixed local user.
  .get("/api/auth/me", async ({ request, set }) => {
    if (!IS_HOSTED_MODE) {
      return {
        user: { userId: CLI_LOCAL_USER_ID, githubLogin: "local" },
        mode: "dev" as const,
      }
    }

    const { jar, attach } = buildJar(
      request,
      set as { headers: Record<string, string | string[]> },
    )
    const supabase = createRequestClient(jar)
    const { data, error } = await supabase.auth.getUser()
    attach()

    if (error || !data.user) {
      return { user: null, mode: "hosted" as const }
    }

    const meta = (data.user.user_metadata ?? {}) as {
      user_name?: string
      preferred_username?: string
    }
    const githubLogin = meta.user_name ?? meta.preferred_username ?? undefined
    return {
      user: { userId: data.user.id, githubLogin },
      mode: "hosted" as const,
    }
  })
