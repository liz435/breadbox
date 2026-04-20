// ── Auth plugin ─────────────────────────────────────────────────────────
//
// Global derive hook that threads an `auth: AuthContext` onto every
// request, or 401/403s closed if none can be resolved. Public routes are
// an explicit allowlist — everything else is authed.
//
// In local (CLI) mode the Host + Origin headers are the primary defense
// against DNS-rebind attacks: an attacker page flipping DNS to 127.0.0.1
// still sends its own domain in Host/Origin, so we reject before the
// cookie check ever runs.

import { timingSafeEqual } from "node:crypto"
import { Elysia } from "elysia"
import { APP_ORIGIN } from "@dreamer/config"
import type { AuthContext } from "./context"
import { readSession, refreshSession } from "./session-store"
import {
  DREAMER_DEV_SKIP_AUTH,
  IS_HOSTED,
} from "../env"

// Public endpoints — reachable without an auth context. Keep this set
// deliberately small; a stray entry here is a tenant-takeover bug.
const PUBLIC_PATHS = new Set<string>([
  "/api/capabilities",
  "/api/auth/github/start",
  "/api/auth/github/callback",
  "/api/auth/logout",
  "/api/auth/me",
  "/__bootstrap",
])

// Allowed Host headers in local mode. CLI binds either 4111 (dev) or
// 4112 (headed CLI); we accept loopback on both so `dreamer headed` and
// `bun run dev` share the same gate.
const LOCAL_HOST_ALLOW = new Set<string>([
  "localhost:4111",
  "127.0.0.1:4111",
  "localhost:4112",
  "127.0.0.1:4112",
])

function localOriginAllowlist(): Set<string> {
  const extra = (process.env.DREAMER_LOCAL_ORIGIN_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return new Set<string>([
    APP_ORIGIN,
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:3004",
    "http://127.0.0.1:3004",
    "http://localhost:4111",
    "http://127.0.0.1:4111",
    "http://localhost:4112",
    "http://127.0.0.1:4112",
    ...extra,
  ])
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still burn a constant-time compare against `a` itself so early-exit
    // on length mismatch doesn't leak a length oracle via timing.
    const buf = Buffer.from(a)
    timingSafeEqual(buf, buf)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function hostAllowed(host: string): boolean {
  for (const allowed of LOCAL_HOST_ALLOW) {
    if (timingSafeStringEqual(host, allowed)) return true
  }
  return false
}

function originAllowed(origin: string, allowlist: Set<string>): boolean {
  for (const allowed of allowlist) {
    if (timingSafeStringEqual(origin, allowed)) return true
  }
  return false
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  const parts = header.split(";")
  for (const part of parts) {
    const [rawK, ...rest] = part.split("=")
    if (!rawK) continue
    const k = rawK.trim()
    if (k !== name) continue
    return rest.join("=").trim()
  }
  return null
}

export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  async (ctx): Promise<{ auth: AuthContext | null } | Record<string, never>> => {
    // Idempotent: a prior derive (e.g. a test stand-in that injects a
    // synthetic owner) already produced auth — don't clobber or re-run
    // the Host/Origin gates, which would 403 test fixtures.
    if ("auth" in ctx && ctx.auth != null) return {}

    const { request, set } = ctx
    const url = new URL(request.url)
    if (PUBLIC_PATHS.has(url.pathname)) return { auth: null }

    // ── Local mode ──────────────────────────────────────────────────
    if (!IS_HOSTED) {
      const host = request.headers.get("host") ?? ""
      const originHeader =
        request.headers.get("origin") ?? request.headers.get("referer") ?? ""

      if (!hostAllowed(host)) {
        set.status = 403
        throw new Error("host not allowed")
      }
      if (originHeader) {
        let originOnly: string
        try {
          originOnly = new URL(originHeader).origin
        } catch {
          set.status = 403
          throw new Error("origin not allowed")
        }
        if (!originAllowed(originOnly, localOriginAllowlist())) {
          set.status = 403
          throw new Error("origin not allowed")
        }
      }

      if (DREAMER_DEV_SKIP_AUTH) {
        return { auth: { userId: "local", sessionId: null, mode: "dev" } }
      }

      const sid = readCookie(request.headers.get("cookie"), "dreamer_local")
      const session = sid ? await readSession(sid) : null
      if (!sid || !session) {
        set.status = 401
        throw new Error("unauthorized")
      }
      return { auth: { userId: session.userId, sessionId: sid, mode: "local" } }
    }

    // ── Hosted mode ─────────────────────────────────────────────────
    const sid = readCookie(request.headers.get("cookie"), "dreamer_session")
    const session = sid ? await readSession(sid) : null
    if (!sid || !session) {
      set.status = 401
      throw new Error("unauthorized")
    }
    // Fire-and-forget refresh; debounced inside session-store.
    void refreshSession(sid)
    return { auth: { userId: session.userId, sessionId: sid, mode: "hosted" } }
  },
)
