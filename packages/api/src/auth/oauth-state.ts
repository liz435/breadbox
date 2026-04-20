// ── OAuth state signing ──────────────────────────────────────────────────
//
// The OAuth `state` parameter is a browser round-trip surface: we send it
// on `/start`, GitHub echoes it back unchanged on `/callback`. Anything
// we encode there must be tamper-evident or an attacker can forge the
// redirectPath and pivot our open-redirect into phishing.
//
// Format: base64url(JSON.stringify(payload)) + "." + base64url(hmac).
// HMAC-SHA256 over the *encoded* payload segment (i.e. over what we
// actually transmit, avoiding canonicalization pitfalls).
//
// Key rotation: the active signer is AUTH_SECRETS[0]. Verification walks
// every entry so rolling the list is a deploy-then-remove two-step. If
// AUTH_SECRETS is empty we throw — a mis-deployed hosted instance must
// fail loud rather than silently accept unsigned state.

import { createHmac, timingSafeEqual } from "node:crypto"
import { AUTH_SECRETS } from "../env"

// 15 min is the upper bound on how long a browser should reasonably take
// to bounce through GitHub's OAuth dance; anything older is an abandoned
// or replayed flow.
const MAX_STATE_AGE_MS = 15 * 60 * 1000

export type OAuthStatePayload = {
  nonce: string
  redirectPath: string
  iat: number
}

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64url")
}

function fromBase64Url(s: string): Buffer {
  return Buffer.from(s, "base64url")
}

function sign(data: string, secret: string): string {
  return toBase64Url(createHmac("sha256", secret).update(data).digest())
}

function activeSecret(): string {
  const secret = AUTH_SECRETS[0]
  if (!secret || secret.length === 0) {
    throw new Error(
      "AUTH_SECRETS is empty — hosted OAuth requires at least one signing key",
    )
  }
  return secret
}

export function signState(payload: OAuthStatePayload): string {
  const secret = activeSecret()
  const body = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"))
  const sig = sign(body, secret)
  return `${body}.${sig}`
}

export function verifyState(raw: string): OAuthStatePayload | null {
  // Throw on empty AUTH_SECRETS for the same reason as signing: a hosted
  // instance without keys must not silently accept state.
  if (AUTH_SECRETS.length === 0) {
    throw new Error(
      "AUTH_SECRETS is empty — cannot verify OAuth state without signing keys",
    )
  }
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

  let matched = false
  for (const secret of AUTH_SECRETS) {
    if (!secret) continue
    const expected = fromBase64Url(sign(body, secret))
    if (expected.length !== sigBytes.length) continue
    if (timingSafeEqual(expected, sigBytes)) {
      matched = true
      break
    }
  }
  if (!matched) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(body).toString("utf8"))
  } catch {
    return null
  }
  if (!isPayload(parsed)) return null
  if (Date.now() - parsed.iat > MAX_STATE_AGE_MS) return null
  return parsed
}

function isPayload(v: unknown): v is OAuthStatePayload {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj.nonce === "string" &&
    typeof obj.redirectPath === "string" &&
    typeof obj.iat === "number"
  )
}
