// ── /__bootstrap integration tests ───────────────────────────────────────
//
// Mounts the authRoutes plugin on an isolated Elysia instance and
// exercises both the local-mode (302 + cookie) and hosted-mode (404)
// branches end-to-end.
//
// The bootstrap route reads `process.env.DREAMER_HOSTED` at request
// time (see auth.ts) so we can flip modes per-test here without
// cross-file module-cache bleed.

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"
import { Elysia } from "elysia"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-bootstrap-route-"))
process.env.DATA_DIR = TEST_DATA_DIR
process.env.DREAMER_LOCAL_TOKEN = "bootstrap-route-test-key"
// env.ts captures every env-derived export at module-init. Set the
// union of env vars the sibling suites (admin, auth-github) expect so
// this file loading first doesn't freeze AUTH_SECRETS=[] or
// IS_HOSTED=false out from under them. The bootstrap route itself
// reads `process.env.DREAMER_HOSTED` at request time (not the frozen
// IS_HOSTED), so we flip it per-test in the describe blocks below.
process.env.AUTH_SECRETS ??= "test-secret-shared"
process.env.GITHUB_CLIENT_ID ??= "test-client-id"
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret"
process.env.ADMIN_GITHUB_LOGINS ??= "admin-login"
process.env.DREAMER_HOSTED ??= "1"

const ORIGINAL_HOSTED = process.env.DREAMER_HOSTED
delete process.env.DREAMER_HOSTED

const { authRoutes } = await import("../auth")
const { signNonce } = await import("../../auth/bootstrap-nonce")
const { deleteSession, readSession } = await import(
  "../../auth/session-store"
)

const app = new Elysia().use(authRoutes)

afterAll(async () => {
  if (ORIGINAL_HOSTED === undefined) delete process.env.DREAMER_HOSTED
  else process.env.DREAMER_HOSTED = ORIGINAL_HOSTED
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
})

async function req(path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init))
}

function parseSetCookies(
  res: Response,
): Record<string, { value: string; attrs: string }> {
  const out: Record<string, { value: string; attrs: string }> = {}
  const entries =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=\s*\w+=)/)
  for (const line of entries) {
    if (!line) continue
    const [pair, ...rest] = line.split(";")
    if (!pair) continue
    const eq = pair.indexOf("=")
    if (eq === -1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    out[name] = { value, attrs: rest.map((s) => s.trim()).join("; ") }
  }
  return out
}

describe("GET /__bootstrap — local mode (DREAMER_HOSTED unset)", () => {
  const createdSids: string[] = []
  beforeEach(() => {
    delete process.env.DREAMER_HOSTED
  })
  afterEach(async () => {
    for (const sid of createdSids) await deleteSession(sid)
    createdSids.length = 0
  })

  test("valid nonce → 302 to / and sets dreamer_local cookie", async () => {
    const nonce = signNonce()
    const res = await req(`/__bootstrap?nonce=${encodeURIComponent(nonce)}`)
    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("/")

    const cookies = parseSetCookies(res)
    const cookie = cookies["dreamer_local"]
    expect(cookie).toBeDefined()
    const sid = cookie?.value ?? ""
    expect(sid.length).toBeGreaterThan(0)
    createdSids.push(sid)

    // HttpOnly + Lax + Path=/, Secure NOT set (localhost = plain HTTP).
    const attrs = (cookie?.attrs ?? "").toLowerCase()
    expect(attrs).toContain("httponly")
    expect(attrs).toContain("samesite=lax")
    expect(attrs).toContain("path=/")
    expect(attrs).not.toContain("secure")

    // Session is real and owned by "local".
    const session = await readSession(sid)
    expect(session?.userId).toBe("local")
  })

  test("missing nonce → 401", async () => {
    const res = await req("/__bootstrap")
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe("missing nonce")
  })

  test("tampered signature → 401", async () => {
    const nonce = signNonce()
    const [body, sig] = nonce.split(".")
    const flipped = (sig?.[0] === "A" ? "B" : "A") + (sig?.slice(1) ?? "")
    const tampered = `${body}.${flipped}`
    const res = await req(
      `/__bootstrap?nonce=${encodeURIComponent(tampered)}`,
    )
    expect(res.status).toBe(401)
  })

  test("expired nonce → 401", async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const nonce = signNonce(twoHoursAgo)
    const res = await req(`/__bootstrap?nonce=${encodeURIComponent(nonce)}`)
    expect(res.status).toBe(401)
  })

  test("garbage nonce → 401", async () => {
    const res = await req("/__bootstrap?nonce=not-a-valid-token")
    expect(res.status).toBe(401)
  })
})

describe("GET /__bootstrap — hosted mode (DREAMER_HOSTED=1)", () => {
  beforeEach(() => {
    process.env.DREAMER_HOSTED = "1"
  })
  afterEach(() => {
    delete process.env.DREAMER_HOSTED
  })

  test("returns 404 regardless of nonce validity", async () => {
    // A valid nonce still 404s — the route is simply unavailable in
    // hosted mode because GitHub OAuth is the sign-in path there.
    const nonce = signNonce()
    const res = await req(`/__bootstrap?nonce=${encodeURIComponent(nonce)}`)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe("not found")
  })

  test("returns 404 even with garbage nonce (uniform behavior)", async () => {
    const res = await req("/__bootstrap?nonce=x")
    expect(res.status).toBe(404)
  })
})
