// ── bootstrap-nonce sign/verify roundtrip tests ──────────────────────────
//
// Module-local constants in env.ts are resolved at first-import time, so
// we set DREAMER_LOCAL_TOKEN *before* importing the nonce module. One
// rotation case uses Bun's `mock.module` pattern-adjacent trick: we
// re-import from a forked entry point that bumps the env between runs.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-bootstrap-nonce-"))
process.env.DATA_DIR = TEST_DATA_DIR
process.env.DREAMER_LOCAL_TOKEN = "test-local-token-key-A"
// env.ts is loaded once per test process and freezes every env-derived
// export at module-init. If this file triggers env.ts before admin or
// auth-github tests do, those suites later observe AUTH_SECRETS=[],
// GitHub creds empty, and IS_HOSTED=false — breaking their OAuth flow.
// Set the union of env vars the other suites expect so process-global
// state is compatible regardless of file ordering.
process.env.AUTH_SECRETS ??= "test-secret-shared"
process.env.GITHUB_CLIENT_ID ??= "test-client-id"
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret"
process.env.ADMIN_GITHUB_LOGINS ??= "admin-login"
process.env.DREAMER_HOSTED ??= "1"

const { signNonce, verifyNonce } = await import("../bootstrap-nonce")

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
})

describe("signNonce / verifyNonce", () => {
  test("roundtrip: sign → verify returns payload with matching nonce and iat", () => {
    const now = Date.now()
    const token = signNonce(now)
    expect(typeof token).toBe("string")
    expect(token).toContain(".")

    const payload = verifyNonce(token, now)
    expect(payload).not.toBeNull()
    expect(payload?.iat).toBe(now)
    expect(typeof payload?.nonce).toBe("string")
    expect((payload?.nonce ?? "").length).toBeGreaterThan(0)
  })

  test("two successive signs produce different tokens (random nonce)", () => {
    const a = signNonce()
    const b = signNonce()
    expect(a).not.toBe(b)
  })

  test("rejects empty or malformed input", () => {
    expect(verifyNonce("")).toBeNull()
    expect(verifyNonce("no-dot-separator")).toBeNull()
    expect(verifyNonce(".")).toBeNull()
    expect(verifyNonce("body.")).toBeNull()
    expect(verifyNonce(".sig")).toBeNull()
  })

  test("rejects a tampered signature", () => {
    const token = signNonce()
    const [body, sig] = token.split(".")
    expect(body).toBeTruthy()
    expect(sig).toBeTruthy()
    // Flip a byte in the signature — base64url is case-sensitive, so
    // swapping a char shifts the underlying bytes.
    const tampered = `${body}.${(sig?.[0] === "A" ? "B" : "A") + (sig?.slice(1) ?? "")}`
    expect(verifyNonce(tampered)).toBeNull()
  })

  test("rejects a tampered body (HMAC covers the encoded body)", () => {
    const token = signNonce()
    const [, sig] = token.split(".")
    // Replace the body with a new valid-JSON payload but reuse the old sig.
    const fakeBody = Buffer.from(
      JSON.stringify({ iat: Date.now(), nonce: "attacker" }),
      "utf8",
    ).toString("base64url")
    expect(verifyNonce(`${fakeBody}.${sig}`)).toBeNull()
  })

  test("rejects a nonce older than 1 hour", () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000 - 1000
    const token = signNonce(oneHourAgo)
    expect(verifyNonce(token)).toBeNull()
  })

  test("accepts a nonce within the 1-hour window", () => {
    const fiftyNineMinutesAgo = Date.now() - 59 * 60 * 1000
    const token = signNonce(fiftyNineMinutesAgo)
    expect(verifyNonce(token)).not.toBeNull()
  })

  test("rejects a nonce from the far future (clock-skew guard)", () => {
    const future = Date.now() + 10 * 60 * 1000
    const token = signNonce(future)
    // now is "now"; token.iat is 10 min ahead → rejected
    expect(verifyNonce(token)).toBeNull()
  })
})

describe("signNonce / verifyNonce — key rotation", () => {
  test("a token forged with the wrong key does not verify", async () => {
    // Simulates "rotate DREAMER_LOCAL_TOKEN between sign and verify":
    // craft a payload signed with a different key and confirm the
    // installed verifier (keyed by DREAMER_LOCAL_TOKEN loaded at module
    // init) rejects it. Exercising module-reload to rotate the active
    // key in-process isn't portable across Bun test runs; forging with a
    // known-wrong key tests the same property — HMAC mismatch → null.
    const { createHmac } = await import("node:crypto")
    const wrongKey = "different-key-than-test-local-token-key-A"
    const body = Buffer.from(
      JSON.stringify({ iat: Date.now(), nonce: "attacker" }),
      "utf8",
    ).toString("base64url")
    const sig = createHmac("sha256", wrongKey)
      .update(body)
      .digest()
      .toString("base64url")
    const forged = `${body}.${sig}`
    expect(verifyNonce(forged)).toBeNull()
  })
})
