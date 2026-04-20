// ── headed-auth URL construction smoke test ──────────────────────────────
//
// Exercises the URL-building helper that the `dreamer headed` command
// prints to the terminal. The full headed flow spawns Vite + Bun.serve;
// those aren't worth mocking for a unit test. What we do want to pin is
// the URL contract between CLI and the API's `/__bootstrap` handler:
// host+port+path and a nonce that verifies under the local token.
//
// Importing headed.ts pulls in every API route plugin by design — for
// the unit test we run the import behind the same DATA_DIR / local-token
// env setup that the API tests use so module-init doesn't scribble on a
// developer's real $DREAMER_HOME.

import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-headed-auth-"))
process.env.DATA_DIR = TEST_DATA_DIR
process.env.DREAMER_LOCAL_TOKEN = "headed-auth-test-key"

// Import the URL builder from its standalone module — not headed.ts —
// because headed.ts pulls in the generated web-ui-manifest whose asset
// paths may be stale in a dev checkout without a fresh `vite build`.
const { buildBootstrapUrl } = await import("../headed-bootstrap-url")
const { verifyNonce } = await import(
  "@dreamer/api/auth/bootstrap-nonce"
)

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
})

describe("buildBootstrapUrl", () => {
  test("produces a 127.0.0.1 URL on the requested app port", () => {
    const url = buildBootstrapUrl(3004)
    const parsed = new URL(url)
    expect(parsed.hostname).toBe("127.0.0.1")
    expect(parsed.port).toBe("3004")
    expect(parsed.pathname).toBe("/__bootstrap")
  })

  test("embeds a nonce that verifies under DREAMER_LOCAL_TOKEN", () => {
    const url = buildBootstrapUrl(3004)
    const parsed = new URL(url)
    const nonce = parsed.searchParams.get("nonce") ?? ""
    expect(nonce.length).toBeGreaterThan(0)
    const payload = verifyNonce(nonce)
    expect(payload).not.toBeNull()
    expect(typeof payload?.iat).toBe("number")
    expect(typeof payload?.nonce).toBe("string")
  })

  test("two calls produce distinct nonces", () => {
    const a = new URL(buildBootstrapUrl(3004)).searchParams.get("nonce")
    const b = new URL(buildBootstrapUrl(3004)).searchParams.get("nonce")
    expect(a).not.toBe(b)
  })

  test("respects the caller-provided port (e.g. bun run dev uses 3002)", () => {
    const url = buildBootstrapUrl(3002)
    expect(new URL(url).port).toBe("3002")
  })
})
