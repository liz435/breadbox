// ── Auth routes ─────────────────────────────────────────────────────────
//
// The four hosted-OAuth endpoints plus logout and the discovery endpoint:
//
//   GET  /api/auth/github/start     — mint state + nonce, 302 to github
//   GET  /api/auth/github/callback  — verify, exchange, create session
//   POST /api/auth/logout           — destroy session
//   GET  /api/auth/me               — discovery (never 401s)
//
// OAuth endpoints are hosted-only (404 in local mode — the CLI uses the
// bootstrap nonce path instead). Logout + me work in both modes so the
// same UI code can drive local and hosted sessions.
//
// The `dreamer_oauth_nonce` cookie is the CSRF binding between /start
// and /callback: state can be replayed from a lunchroom screen, but the
// nonce cookie is HttpOnly + SameSite=Lax and only the browser that hit
// /start has it.

import { Elysia } from "elysia"
import { z } from "zod"
import { verifyNonce } from "../auth/bootstrap-nonce"
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchUser,
  GitHubOAuthError,
  githubUserId,
} from "../auth/github-oauth"
import { signState, verifyState } from "../auth/oauth-state"
import {
  createSession,
  deleteSession,
  readSession,
} from "../auth/session-store"
import { DREAMER_DEV_SKIP_AUTH, IS_HOSTED } from "../env"
import { createLogger } from "../logger"

const log = createLogger("auth-routes")

const NONCE_COOKIE = "dreamer_oauth_nonce"
const SESSION_COOKIE = "dreamer_session"
const LOCAL_SESSION_COOKIE = "dreamer_local"

const NONCE_COOKIE_TTL_SECONDS = 10 * 60
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000

// ── redirectPath sanitizer ──────────────────────────────────────────────
//
// Accept only relative, same-origin paths to defeat open-redirect
// phishing (`?redirect=https://attacker.example/phish`). A valid path
// starts with `/` and does not start with `//` (protocol-relative) or
// `/\` (some browsers normalize that into a scheme).
function sanitizeRedirectPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/"
  if (!raw.startsWith("/")) return "/"
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/"
  // Cap length to avoid state bloat.
  return raw.length > 512 ? "/" : raw
}

function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

function callbackUriFrom(request: Request): string {
  // Derive the browser-facing origin from the incoming request. Railway
  // (and most PaaS proxies) terminate TLS upstream and forward to the
  // app over plain HTTP, so `request.url` can read as
  // `http://0.0.0.0:4111/...` while the user is actually at
  // `https://dreamer.example.com/...`. GitHub's OAuth flow does an
  // exact-match check against the `redirect_uri` we send, so we must
  // honor the forwarded-for headers to reconstruct the public URL.
  //
  // Precedence: X-Forwarded-* (if present) wins over request.url, since
  // those headers describe the edge that the browser actually hit.
  const url = new URL(request.url)
  const forwardedProto = request.headers.get("x-forwarded-proto")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const proto = (forwardedProto?.split(",")[0] ?? url.protocol.replace(/:$/, "")).trim()
  const host = (forwardedHost?.split(",")[0] ?? url.host).trim()
  return `${proto}://${host}/api/auth/github/callback`
}

const logoutBodySchema = z.object({}).partial()

export const authRoutes = new Elysia({ name: "auth-routes" })
  // ── GET /api/auth/github/start ─────────────────────────────────────
  .get("/api/auth/github/start", async ({ request, query, cookie, set }) => {
    if (!IS_HOSTED) {
      set.status = 404
      return { error: "not found" }
    }

    const nonce = newNonce()
    const redirectPath = sanitizeRedirectPath(query.redirect)
    const state = signState({
      nonce,
      redirectPath,
      iat: Date.now(),
    })

    cookie[NONCE_COOKIE].set({
      value: nonce,
      httpOnly: true,
      secure: IS_HOSTED,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: NONCE_COOKIE_TTL_SECONDS,
    })

    const redirectUri = callbackUriFrom(request)
    try {
      const authorizeUrl = buildAuthorizeUrl({ state, redirectUri })
      set.status = 302
      set.headers["Location"] = authorizeUrl
      return ""
    } catch (err) {
      log.warn(
        `github /start failed: ${err instanceof Error ? err.message : err}`,
      )
      set.status = 500
      return { error: "oauth misconfigured" }
    }
  })

  // ── GET /api/auth/github/callback ──────────────────────────────────
  .get("/api/auth/github/callback", async ({ request, query, cookie, set }) => {
    if (!IS_HOSTED) {
      set.status = 404
      return { error: "not found" }
    }

    const code = typeof query.code === "string" ? query.code : ""
    const stateRaw = typeof query.state === "string" ? query.state : ""
    if (!code || !stateRaw) {
      set.status = 400
      return { error: "missing code or state" }
    }

    const payload = verifyState(stateRaw)
    if (!payload) {
      set.status = 400
      return { error: "invalid state" }
    }

    const nonceCookieValue =
      typeof cookie[NONCE_COOKIE]?.value === "string"
        ? (cookie[NONCE_COOKIE].value as string)
        : ""
    if (!nonceCookieValue || nonceCookieValue !== payload.nonce) {
      set.status = 400
      return { error: "nonce mismatch" }
    }
    // Clear the nonce cookie either way — it's single-use by design.
    cookie[NONCE_COOKIE].set({
      value: "",
      httpOnly: true,
      secure: IS_HOSTED,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    })

    try {
      const { accessToken } = await exchangeCode({
        code,
        redirectUri: callbackUriFrom(request),
      })
      const user = await fetchUser(accessToken)
      const userId = githubUserId(user.login)
      const { sid } = await createSession({
        userId,
        githubLogin: user.login,
        ttlMs: SESSION_TTL_MS,
      })

      cookie[SESSION_COOKIE].set({
        value: sid,
        httpOnly: true,
        secure: IS_HOSTED,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      })

      log.info(`signed in userId=${userId} login=${user.login}`)
      set.status = 302
      set.headers["Location"] = payload.redirectPath
      return ""
    } catch (err) {
      if (err instanceof GitHubOAuthError) {
        log.warn(`oauth error kind=${err.kind} status=${err.status ?? "-"}`)
      } else {
        log.warn(
          `oauth error: ${err instanceof Error ? err.message : err}`,
        )
      }
      set.status = 502
      return { error: "oauth failed" }
    }
  })

  // ── POST /api/auth/logout ──────────────────────────────────────────
  .post("/api/auth/logout", async ({ cookie, set }) => {
    logoutBodySchema.parse({})

    const hostedSid =
      typeof cookie[SESSION_COOKIE]?.value === "string"
        ? (cookie[SESSION_COOKIE].value as string)
        : ""
    const localSid =
      typeof cookie[LOCAL_SESSION_COOKIE]?.value === "string"
        ? (cookie[LOCAL_SESSION_COOKIE].value as string)
        : ""

    if (hostedSid) await deleteSession(hostedSid)
    if (localSid) await deleteSession(localSid)

    // Clear both so a single endpoint works in both modes.
    cookie[SESSION_COOKIE].set({
      value: "",
      httpOnly: true,
      secure: IS_HOSTED,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
    cookie[LOCAL_SESSION_COOKIE].set({
      value: "",
      httpOnly: true,
      secure: IS_HOSTED,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })

    set.status = 200
    return { ok: true }
  })

  // ── GET /__bootstrap ───────────────────────────────────────────────
  //
  // Local-mode only: the CLI prints a one-shot signed-nonce URL for the
  // user to open in their browser. We verify the HMAC, create a local
  // session keyed `userId: "local"`, set the `dreamer_local` cookie, and
  // 302 to `/`. Hosted mode returns 404 — OAuth handles sign-in there.
  //
  // The cookie is HttpOnly + SameSite=Lax + Path=/ so Vite's proxy and
  // the embedded static UI can both read it; Secure is false because
  // localhost is plain-HTTP. Max-Age mirrors the session TTL (30d) so
  // the browser drops it at the same time the server-side record
  // expires, avoiding a zombie cookie after logout or GC.
  //
  // Implementation note: the hosted-vs-local branch reads
  // `process.env.DREAMER_HOSTED` directly rather than the frozen
  // IS_HOSTED export so the route can be exercised from a test process
  // where another suite already captured env.ts with IS_HOSTED=true.
  // The env value never changes in production, so request-time reads
  // are cheap and equivalent.
  .get("/__bootstrap", async ({ request, cookie, set }) => {
    const isHostedNow = process.env.DREAMER_HOSTED === "1"
    if (isHostedNow) {
      set.status = 404
      return { error: "not found" }
    }

    const url = new URL(request.url)
    const raw = url.searchParams.get("nonce") ?? ""
    if (!raw) {
      set.status = 401
      return { error: "missing nonce" }
    }
    const payload = verifyNonce(raw)
    if (!payload) {
      set.status = 401
      return { error: "invalid or expired nonce" }
    }

    const { sid } = await createSession({
      userId: "local",
      githubLogin: "local",
      ttlMs: SESSION_TTL_MS,
    })

    cookie[LOCAL_SESSION_COOKIE].set({
      value: sid,
      httpOnly: true,
      secure: false, // localhost is plain HTTP
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    })

    log.info(`local bootstrap: minted session for userId=local`)
    set.status = 302
    set.headers["Location"] = "/"
    return ""
  })

  // ── GET /api/auth/me ───────────────────────────────────────────────
  //
  // Discovery endpoint — never 401s. Returns:
  //   - `user`: the current session user, or null if unauthenticated
  //   - `mode`: deployment mode the UI should render under
  //
  // Mode is a function of the server's env, not the request:
  //   - "hosted" when IS_HOSTED is on (Railway / multi-tenant)
  //   - "dev"    when !IS_HOSTED && DREAMER_DEV_SKIP_AUTH (bun run dev)
  //   - "local"  otherwise (dreamer headed)
  //
  // The client uses `mode` to decide which login affordance to show
  // when `user === null`: hosted redirects to GitHub OAuth, local shows
  // "restart `dreamer headed`", dev never gates at all.
  .get("/api/auth/me", async ({ cookie }) => {
    const mode: "hosted" | "local" | "dev" = IS_HOSTED
      ? "hosted"
      : DREAMER_DEV_SKIP_AUTH
        ? "dev"
        : "local"

    const cookieName = IS_HOSTED ? SESSION_COOKIE : LOCAL_SESSION_COOKIE
    const sid =
      typeof cookie[cookieName]?.value === "string"
        ? (cookie[cookieName].value as string)
        : ""
    if (!sid) return { user: null, mode }
    const session = await readSession(sid)
    if (!session) return { user: null, mode }
    return {
      user: {
        userId: session.userId,
        githubLogin: session.githubLogin,
      },
      mode,
    }
  })
