// ── Per-request Supabase client (@supabase/ssr) ─────────────────────────
//
// Builds a fresh server client bound to one Elysia request's cookies.
// We use it strictly for `auth.getUser()` (verifies the access-token
// cookie, transparently refreshes via the refresh-token cookie) — never
// for DB queries. DB work goes through the service-role admin client
// after the middleware extracts the verified user id.
//
// Two-client design: keeps RLS scoping out of every query and makes
// ownership checks explicit in code where they can be reviewed.

import { createServerClient, type CookieOptions } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env"

type ElysiaCookieJar = {
  /** Raw `Cookie` header from the request. */
  cookieHeader: string | null
  /** Mutable set of `Set-Cookie` strings appended on response. */
  pendingSetCookies: string[]
}

function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return []
  const out: { name: string; value: string }[] = []
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!name) continue
    out.push({ name, value })
  }
  return out
}

function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const parts: string[] = [`${name}=${value}`]
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.path) parts.push(`Path=${options.path}`)
  else parts.push("Path=/")
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.httpOnly !== false) parts.push("HttpOnly")
  if (options.secure) parts.push("Secure")
  if (options.sameSite) {
    const ss =
      typeof options.sameSite === "string"
        ? options.sameSite
        : options.sameSite
          ? "Strict"
          : "Lax"
    parts.push(`SameSite=${ss[0]?.toUpperCase()}${ss.slice(1)}`)
  } else {
    parts.push("SameSite=Lax")
  }
  return parts.join("; ")
}

/**
 * Build a request-scoped Supabase server client. The caller passes the
 * raw `Cookie` header and an array we will push `Set-Cookie` strings
 * into on response. We never read or write `process.env` here.
 */
export function createRequestClient(jar: ElysiaCookieJar): SupabaseClient {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll(): { name: string; value: string }[] {
        return parseCookieHeader(jar.cookieHeader)
      },
      setAll(toSet): void {
        for (const { name, value, options } of toSet) {
          jar.pendingSetCookies.push(serializeCookie(name, value, options))
        }
      },
    },
  })
}

export type { ElysiaCookieJar }
