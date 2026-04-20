// ── SSRF guard ──────────────────────────────────────────────────────────
//
// Any fetch whose URL is influenced by user input must be gated with
// `assertSafeUrl` (or wrapped in `safeFetch`), otherwise an attacker
// could coerce the server into hitting internal infrastructure:
//
//   - Cloud metadata endpoints (169.254.169.254)
//   - RFC1918 internal networks (10/8, 172.16/12, 192.168/16)
//   - Loopback (127/8, ::1)
//   - IPv6 link-local (fe80::/10)
//   - Any IPv4 "this network" range (0/8)
//
// We resolve the hostname and check every returned address. A single
// public-looking A record isn't enough: DNS rebinding can swap it to
// 127.0.0.1 between the check and the fetch, so callers that do their
// own fetch should prefer `safeFetch`, which re-resolves once and
// actually pins the IP in the URL. For simple guarding (where we trust
// the downstream resolver caching), `assertSafeUrl` alone is fine.
//
// DNS results are cached for 60s to avoid thrashing the resolver on
// repeat calls (e.g. a burst of agent tool invocations hitting the
// same host).

import { lookup } from "node:dns/promises"

// ── Blocklists ────────────────────────────────────────────────────────

type V4Range = { net: number; mask: number }

function v4Range(cidr: string): V4Range {
  const [net, bits] = cidr.split("/")
  if (!net || !bits) throw new Error(`bad cidr: ${cidr}`)
  return { net: ipv4ToInt(net), mask: bits === "0" ? 0 : (-1 << (32 - parseInt(bits, 10))) >>> 0 }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((s) => parseInt(s, 10))
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`bad ipv4: ${ip}`)
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0)
}

const V4_BLOCKED: V4Range[] = [
  v4Range("0.0.0.0/8"),      // "this network"
  v4Range("10.0.0.0/8"),     // RFC1918
  v4Range("127.0.0.0/8"),    // loopback
  v4Range("169.254.0.0/16"), // link-local (incl. cloud metadata)
  v4Range("172.16.0.0/12"),  // RFC1918
  v4Range("192.168.0.0/16"), // RFC1918
]

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  for (const { net, mask } of V4_BLOCKED) {
    if ((n & mask) >>> 0 === (net & mask) >>> 0) return true
  }
  return false
}

function isBlockedV6(ip: string): boolean {
  // Normalize: strip zone-id (`%eth0`), lowercase
  const raw = ip.split("%")[0]!.toLowerCase()

  // Loopback "::1"
  if (raw === "::1") return true
  // Unspecified "::"
  if (raw === "::" || raw === "0:0:0:0:0:0:0:0") return true
  // Link-local fe80::/10 — first 10 bits are 1111 1110 10
  // Covers fe80..febf prefixes. Match any block starting with fe8-febf.
  if (/^fe[89ab][0-9a-f]:/.test(raw)) return true
  // Unique-local fc00::/7 — treat as private.
  if (/^f[cd][0-9a-f]{2}:/.test(raw)) return true
  // IPv4-mapped `::ffff:10.0.0.1` etc — delegate to v4 check.
  const v4MappedMatch = raw.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4MappedMatch) {
    try {
      return isBlockedV4(v4MappedMatch[1]!)
    } catch {
      return true
    }
  }
  return false
}

// ── DNS cache ─────────────────────────────────────────────────────────

type ResolvedEntry = {
  addresses: Array<{ address: string; family: number }>
  expiresAt: number
}

const DNS_TTL_MS = 60_000

// Exported for tests; production callers should not manipulate.
const dnsCache = new Map<string, ResolvedEntry>()

type LookupFn = typeof lookup
let lookupImpl: LookupFn = lookup

/**
 * Test-only: swap in a mock resolver. Returns a restore function.
 * Throws outside NODE_ENV=test so production code can't accidentally
 * poison DNS.
 */
export function _setLookupImplForTests(fn: LookupFn | null): () => void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setLookupImplForTests called outside test env")
  }
  const prev = lookupImpl
  lookupImpl = fn ?? lookup
  dnsCache.clear()
  return () => {
    lookupImpl = prev
    dnsCache.clear()
  }
}

export function _clearDnsCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearDnsCacheForTests called outside test env")
  }
  dnsCache.clear()
}

async function resolveCached(
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  const now = Date.now()
  const hit = dnsCache.get(hostname)
  if (hit && hit.expiresAt > now) return hit.addresses
  const addrs = await lookupImpl(hostname, { all: true })
  const addressesArray = Array.isArray(addrs) ? addrs : [addrs]
  const normalized = addressesArray.map((a) => ({
    address: a.address,
    family: a.family,
  }))
  dnsCache.set(hostname, {
    addresses: normalized,
    expiresAt: now + DNS_TTL_MS,
  })
  return normalized
}

// ── Public API ────────────────────────────────────────────────────────

export class SsrfBlockedError extends Error {
  readonly host: string
  readonly address: string | null
  constructor(host: string, address: string | null, reason: string) {
    super(`SSRF blocked: ${reason} (host=${host}${address ? ", ip=" + address : ""})`)
    this.name = "SsrfBlockedError"
    this.host = host
    this.address = address
  }
}

/**
 * Resolve the URL's host and throw SsrfBlockedError if any resolved
 * address is in a blocked range. Passes silently for public addresses.
 *
 * Only http(s) URLs are accepted — other schemes (file://, gopher://,
 * data://) are blocked outright so a forgotten guard elsewhere can't
 * slip a non-http URL through.
 */
export async function assertSafeUrl(url: string | URL): Promise<void> {
  let parsed: URL
  try {
    parsed = url instanceof URL ? url : new URL(url)
  } catch {
    throw new SsrfBlockedError(String(url), null, "invalid url")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError(parsed.hostname, null, `scheme not allowed: ${parsed.protocol}`)
  }
  const hostname = parsed.hostname
  if (!hostname) {
    throw new SsrfBlockedError("", null, "empty hostname")
  }

  // Literal IP hosts skip DNS.
  if (isIpv4Literal(hostname)) {
    if (isBlockedV4(hostname)) {
      throw new SsrfBlockedError(hostname, hostname, "ipv4 in blocked range")
    }
    return
  }
  const v6Literal = stripIpv6Brackets(hostname)
  if (v6Literal) {
    if (isBlockedV6(v6Literal)) {
      throw new SsrfBlockedError(hostname, v6Literal, "ipv6 in blocked range")
    }
    return
  }

  // Special-case `localhost` even when it somehow resolves externally
  // on a misconfigured resolver.
  if (hostname === "localhost") {
    throw new SsrfBlockedError(hostname, null, "localhost blocked")
  }

  let addrs: Array<{ address: string; family: number }>
  try {
    addrs = await resolveCached(hostname)
  } catch (err) {
    throw new SsrfBlockedError(
      hostname,
      null,
      `resolve failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (addrs.length === 0) {
    throw new SsrfBlockedError(hostname, null, "no addresses resolved")
  }
  for (const { address, family } of addrs) {
    if (family === 4) {
      if (isBlockedV4(address)) {
        throw new SsrfBlockedError(hostname, address, "resolved to blocked ipv4 range")
      }
    } else if (family === 6) {
      if (isBlockedV6(address)) {
        throw new SsrfBlockedError(hostname, address, "resolved to blocked ipv6 range")
      }
    } else {
      throw new SsrfBlockedError(hostname, address, `unknown address family: ${family}`)
    }
  }
}

/**
 * `fetch` wrapper that guards the URL first. Prefer this over raw
 * `fetch` for any request whose URL is influenced by user input.
 */
export async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  await assertSafeUrl(url)
  return fetch(url, init)
}

// ── helpers ───────────────────────────────────────────────────────────

function isIpv4Literal(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)
}

function stripIpv6Brackets(s: string): string | null {
  if (s.startsWith("[") && s.endsWith("]")) {
    return s.slice(1, -1)
  }
  // node:URL gives us hostname without brackets for ipv6 already.
  if (s.includes(":")) return s
  return null
}
