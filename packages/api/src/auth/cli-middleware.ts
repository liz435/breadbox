// ── CLI auth middleware (file-mode, single tenant) ──────────────────────
//
// Local-only deployment: no Supabase, no real auth. Every request is
// treated as the fixed local user (CLI_LOCAL_USER_ID). We still gate
// Host + Origin headers to defend against DNS-rebind attacks against
// the bound loopback port.

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

// Loopback hostnames. We gate on the request's *hostname*, not on a fixed
// host:port — because headed/serve mode binds an OS-assigned port whenever its
// preferred one (3004 UI / 4112 API) is taken (e.g. an orphaned sidecar from a
// prior launch). Pinning specific ports here would 403 every API call in that
// fallback case. A DNS-rebind attacker still arrives with their own domain in
// Host/Origin (e.g. "evil.com"), which is not loopback, so the rebind hole
// stays closed.
const LOOPBACK_HOSTNAMES = new Set<string>([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
])

// Non-loopback origins explicitly permitted: the configured APP_ORIGIN plus any
// comma-separated extras from BREADBOX_LOCAL_ORIGIN_ALLOWLIST. Loopback origins
// are always allowed regardless of this set.
function extraOriginAllowlist(): Set<string> {
  const extra = (process.env.BREADBOX_LOCAL_ORIGIN_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return new Set<string>([APP_ORIGIN, ...extra])
}

// The Host header is "hostname" or "hostname:port" ("[::1]:4112" for IPv6).
// Strip the port and check the hostname is loopback.
function hostAllowed(host: string): boolean {
  if (!host) return false
  const hostname = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1) // keep brackets: "[::1]"
    : (host.split(":")[0] ?? "")
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

// Allow any loopback origin (any port); otherwise fall back to an exact match
// against the configured non-loopback allowlist. originHeader may be a full
// Referer URL, so we normalise to its origin before the allowlist check.
function originAllowed(originHeader: string, extras: Set<string>): boolean {
  let url: URL
  try {
    url = new URL(originHeader)
  } catch {
    return false
  }
  if (LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase())) return true
  return extras.has(url.origin)
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
    if (originHeader && !originAllowed(originHeader, extraOriginAllowlist())) {
      set.status = 403
      throw new Error("origin not allowed")
    }

    // CLI mode is single-tenant: every authenticated path returns the
    // fixed local user. There is no opt-out — the Host/Origin gate above
    // is the only defense, and it's appropriate for loopback-only.
    return {
      auth: { userId: CLI_LOCAL_USER_ID, sessionId: null, mode: "dev" },
    }
  },
)
