// ── CLI auth middleware (file-mode, single tenant) ──────────────────────
//
// Local-only deployment: no Supabase, no real auth. Every request is
// treated as the fixed local user (CLI_LOCAL_USER_ID). We still gate
// Host + Origin headers to defend against DNS-rebind attacks against
// the bound loopback port.

import { timingSafeEqual } from "node:crypto"
import { Elysia } from "elysia"
import { APP_ORIGIN } from "@dreamer/config"
import type { AuthContext } from "./context"
import { CLI_LOCAL_USER_ID } from "../supabase/env"

const PUBLIC_PATHS = new Set<string>([
  "/api/capabilities",
  "/api/auth/me",
  "/api/eval/dashboard",
  "/api/eval/summary",
  "/api/eval/all",
])

const AUTHED_PREFIXES = ["/api", "/project", "/agent"] as const

function isAuthedApiPath(pathname: string): boolean {
  for (const prefix of AUTHED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true
  }
  return false
}

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

export const cliAuthPlugin = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  async (ctx): Promise<{ auth: AuthContext | null } | Record<string, never>> => {
    if ("auth" in ctx && ctx.auth != null) return {}

    const { request, set } = ctx
    const url = new URL(request.url)

    if (PUBLIC_PATHS.has(url.pathname)) return { auth: null }
    if (!isAuthedApiPath(url.pathname)) return { auth: null }

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

    // CLI mode is single-tenant; DREAMER_DEV_SKIP_AUTH is implied. The
    // dev flag still exists for symmetry with tests but doesn't change
    // behavior here.
    return {
      auth: { userId: CLI_LOCAL_USER_ID, sessionId: null, mode: "dev" },
    }
  },
)
