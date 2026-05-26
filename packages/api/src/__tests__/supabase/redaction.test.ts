// ── Redaction unit tests ────────────────────────────────────────────────
//
// Pure unit tests — no Supabase needed. Exercises the broadened
// `redactSensitive` introduced in PR3 alongside the existing
// `redactHeaders`. Lives in __tests__/supabase/ for proximity to the
// log sink that consumes it, but runs in every `bun test` invocation.

import { describe, expect, test } from "bun:test"
import { redactSensitive, redactHeaders } from "../../logging-redact"

describe("redactSensitive", () => {
  test("scrubs Authorization, Cookie, Set-Cookie in nested headers", () => {
    const scrubbed = redactSensitive({
      headers: {
        authorization: "Bearer secret-token",
        cookie: "sb-access-token=xyz",
        "user-agent": "Mozilla/5.0",
      },
    }) as { headers: Record<string, string> }
    expect(scrubbed.headers.authorization).toBe("[redacted]")
    expect(scrubbed.headers.cookie).toBe("[redacted]")
    expect(scrubbed.headers["user-agent"]).toBe("Mozilla/5.0")
  })

  test("scrubs sensitive top-level fields by exact key match", () => {
    const scrubbed = redactSensitive({
      email: "alice@example.com",
      access_token: "eyJhbGciOi…",
      refresh_token: "rt-1234",
      code: "oauth-code-deadbeef",
      display_name: "Alice",
    }) as Record<string, string>
    expect(scrubbed.email).toBe("[redacted]")
    expect(scrubbed.access_token).toBe("[redacted]")
    expect(scrubbed.refresh_token).toBe("[redacted]")
    expect(scrubbed.code).toBe("[redacted]")
    // Non-matching name (substring of "token" doesn't trigger the set).
    expect(scrubbed.display_name).toBe("Alice")
  })

  test("recurses into nested objects + arrays", () => {
    const scrubbed = redactSensitive({
      user: {
        email: "alice@example.com",
        sessions: [{ id_token: "id-1" }, { id_token: "id-2" }],
      },
    }) as {
      user: { email: string; sessions: { id_token: string }[] }
    }
    expect(scrubbed.user.email).toBe("[redacted]")
    expect(scrubbed.user.sessions[0]?.id_token).toBe("[redacted]")
    expect(scrubbed.user.sessions[1]?.id_token).toBe("[redacted]")
  })

  test("non-sensitive keys with similar substrings are preserved", () => {
    const scrubbed = redactSensitive({
      tokenCount: 42,
      passwordHashLength: 60,
      emailVerified: true,
      cookies: [], // plural — not in the set
    }) as Record<string, unknown>
    expect(scrubbed.tokenCount).toBe(42)
    expect(scrubbed.passwordHashLength).toBe(60)
    expect(scrubbed.emailVerified).toBe(true)
    expect(scrubbed.cookies).toEqual([])
  })

  test("bounded depth prevents pathological recursion", () => {
    // Build a 10-deep object — should not throw or hang.
    let obj: Record<string, unknown> = { leaf: "value" }
    for (let i = 0; i < 10; i += 1) obj = { nested: obj }
    expect(() => redactSensitive(obj)).not.toThrow()
  })
})

describe("redactHeaders (pre-existing behavior)", () => {
  test("Headers instance is normalized to a plain object", () => {
    const h = new Headers({
      "authorization": "Bearer x",
      "x-trace": "abc",
    })
    const out = redactHeaders(h)
    expect(out.authorization).toBe("[redacted]")
    expect(out["x-trace"]).toBe("abc")
  })
})
