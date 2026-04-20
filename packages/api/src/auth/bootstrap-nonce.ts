// ── Bootstrap nonce signing ─────────────────────────────────────────────
//
// The CLI's `dreamer headed` command prints a one-shot URL of the form
// `http://127.0.0.1:<app>/__bootstrap?nonce=<signed>` to the terminal.
// Opening that URL in a browser lands at the Vite dev server, which
// proxies `/__bootstrap` to the Elysia API. The API verifies the nonce,
// mints a `dreamer_local` session cookie, and 302s the browser to `/`.
//
// Format: base64url(JSON.stringify({ iat, nonce })) + "." + base64url(hmac).
// HMAC-SHA256 over the encoded payload segment with DREAMER_LOCAL_TOKEN
// as the key (the same persisted local-mode secret that /__bootstrap and
// the CLI share — regenerated only if the user deletes the file under
// $DREAMER_HOME).
//
// TTL: 1 hour. The nonce is printed when `dreamer headed` starts; a user
// who takes longer than an hour to click it should restart the CLI. A
// shorter window makes nonce-replay less useful without being brittle
// enough to mis-fire on a slow laptop waking from sleep.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { DREAMER_LOCAL_TOKEN } from "../env"

const MAX_NONCE_AGE_MS = 60 * 60 * 1000 // 1 hour

export type BootstrapNoncePayload = {
  iat: number
  nonce: string
}

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64url")
}

function fromBase64Url(s: string): Buffer {
  return Buffer.from(s, "base64url")
}

function hmac(data: string, key: string): Buffer {
  return createHmac("sha256", key).update(data).digest()
}

function activeKey(): string {
  if (!DREAMER_LOCAL_TOKEN || DREAMER_LOCAL_TOKEN.length === 0) {
    // Local-mode only — env.ts auto-generates a token on first read, so
    // this is a true config failure (e.g. the fallback write path failed
    // and DREAMER_LOCAL_TOKEN was explicitly unset). Fail loud.
    throw new Error(
      "DREAMER_LOCAL_TOKEN is empty — bootstrap nonce cannot be signed",
    )
  }
  return DREAMER_LOCAL_TOKEN
}

/** Mint a fresh bootstrap nonce and return the signed, URL-safe token. */
export function signNonce(now: number = Date.now()): string {
  const key = activeKey()
  const payload: BootstrapNoncePayload = {
    iat: now,
    nonce: toBase64Url(randomBytes(16)),
  }
  const body = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"))
  const sig = toBase64Url(hmac(body, key))
  return `${body}.${sig}`
}

/**
 * Verify a nonce signed by `signNonce`. Returns the payload on success,
 * or `null` when:
 *  - structure is malformed
 *  - signature does not match the current DREAMER_LOCAL_TOKEN
 *  - payload fails to parse as JSON with `iat` and `nonce`
 *  - `iat` is older than 1 hour (expired) or in the future
 */
export function verifyNonce(
  raw: string,
  now: number = Date.now(),
): BootstrapNoncePayload | null {
  if (typeof raw !== "string" || raw.length === 0) return null
  const key = activeKey()

  const dot = raw.indexOf(".")
  if (dot <= 0 || dot === raw.length - 1) return null
  const body = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)

  let sigBytes: Buffer
  try {
    sigBytes = fromBase64Url(sig)
  } catch {
    return null
  }
  const expected = hmac(body, key)
  if (expected.length !== sigBytes.length) return null
  if (!timingSafeEqual(expected, sigBytes)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(body).toString("utf8"))
  } catch {
    return null
  }
  if (!isPayload(parsed)) return null

  // Age check: reject both expired and far-future timestamps (clock skew
  // pins could otherwise keep a stale nonce alive if the client's clock
  // ran ahead during signing).
  const age = now - parsed.iat
  if (age < -60_000) return null
  if (age > MAX_NONCE_AGE_MS) return null
  return parsed
}

function isPayload(v: unknown): v is BootstrapNoncePayload {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  return typeof obj.iat === "number" && typeof obj.nonce === "string"
}
