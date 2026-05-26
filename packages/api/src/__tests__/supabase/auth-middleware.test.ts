// ── Supabase auth middleware integration tests ─────────────────────────
//
// Runs against a real local Supabase stack started via `bunx supabase
// start`. Each test creates a fresh user via the admin client, generates
// a session, attaches the resulting cookies to an Elysia request, and
// asserts the middleware's derived context.
//
// Skipped automatically when SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are unset so a Docker-less `bun test` doesn't
// flap. In CI, `bunx supabase start` runs before `bun test:api`.
//
// To run locally:
//   bunx supabase start
//   export SUPABASE_URL=http://127.0.0.1:54321
//   export SUPABASE_ANON_KEY="<from supabase status output>"
//   export SUPABASE_SERVICE_ROLE_KEY="<from supabase status output>"
//   DREAMER_MODE=hosted bun test src/__tests__/supabase

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import { createClient } from "@supabase/supabase-js"

// Gate: bail out if Supabase config is missing.
const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

const HAS_SUPABASE =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  SUPABASE_SERVICE_ROLE_KEY.length > 0

const describeOrSkip = HAS_SUPABASE ? describe : describe.skip

// Force hosted mode so the auth-plugin selector resolves to the Supabase
// middleware. Captured before any module that reads env loads.
if (HAS_SUPABASE) {
  process.env.DREAMER_MODE = "hosted"
  process.env.DREAMER_HOSTED = "1"
}

// Dynamic imports so env mutations land before module evaluation.
const { supabaseAuthPlugin } = HAS_SUPABASE
  ? await import("../../auth/supabase-middleware")
  : ({ supabaseAuthPlugin: null } as never)

// ── Helpers ─────────────────────────────────────────────────────────────

type GeneratedSession = {
  userId: string
  accessToken: string
  refreshToken: string
}

async function createTestUserSession(): Promise<GeneratedSession> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = `test-${crypto.randomUUID()}@dreamer.test`
  const password = `pw-${crypto.randomUUID()}`

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { user_name: "test-handle" },
    })
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message ?? "no user"}`)
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn, error: signInErr } =
    await anon.auth.signInWithPassword({ email, password })
  if (signInErr || !signIn.session) {
    throw new Error(`signIn failed: ${signInErr?.message ?? "no session"}`)
  }

  return {
    userId: created.user.id,
    accessToken: signIn.session.access_token,
    refreshToken: signIn.session.refresh_token,
  }
}

/**
 * Build the cookie name @supabase/ssr expects, which is keyed off the
 * Supabase project ref (last segment of the URL host before .supabase.co
 * or, locally, the literal "127" from 127.0.0.1). We mirror the chunked
 * cookie shape ssr uses: a single base64-prefixed JSON string keyed
 * `sb-<ref>-auth-token`.
 */
function authCookieFor(session: GeneratedSession): string {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0] ?? "local"
  const payload = JSON.stringify({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    token_type: "bearer",
    user: { id: session.userId },
  })
  // @supabase/ssr prefixes the cookie value with "base64-" when stored
  // as a chunked cookie. Plain JSON also works for the current SDK.
  return `sb-${ref}-auth-token=${encodeURIComponent(payload)}`
}

function buildApp() {
  return new Elysia()
    .use(supabaseAuthPlugin!)
    .get("/api/whoami", (ctx: unknown) => {
      const auth = (ctx as { auth?: { userId: string; mode: string } | null })
        .auth
      return auth ? { userId: auth.userId, mode: auth.mode } : { userId: null }
    })
}

// ── Tests ───────────────────────────────────────────────────────────────

describeOrSkip("supabase auth middleware", () => {
  let session: GeneratedSession

  beforeAll(async () => {
    session = await createTestUserSession()
  })

  afterAll(async () => {
    if (!HAS_SUPABASE || !session) return
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await admin.auth.admin.deleteUser(session.userId)
  })

  test("valid session cookie → 200 + userId on context", async () => {
    const app = buildApp()
    const res = await app.handle(
      new Request("http://localhost:4111/api/whoami", {
        headers: { cookie: authCookieFor(session), host: "localhost:4111" },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string; mode: string }
    expect(body.userId).toBe(session.userId)
    expect(body.mode).toBe("hosted")
  })

  test("missing cookie → 401", async () => {
    const app = buildApp()
    const res = await app.handle(
      new Request("http://localhost:4111/api/whoami", {
        headers: { host: "localhost:4111" },
      }),
    )
    expect(res.status).toBe(401)
  })

  test("public path bypasses the gate", async () => {
    const app = buildApp()
    const res = await app.handle(
      new Request("http://localhost:4111/api/capabilities", {
        headers: { host: "localhost:4111" },
      }),
    )
    // /api/capabilities isn't mounted on `app` here; we just want a
    // non-401 — Elysia returns 404 for an unhandled but-allowed path.
    expect(res.status).not.toBe(401)
  })
})
