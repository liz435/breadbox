// ── use-current-user tests ───────────────────────────────────────────────
//
// The hook is a thin subscription over a module-level promise cache,
// so the tests focus on two things:
//   1. The hosted and non-hosted (CLI/desktop) `/me` payloads each
//      round-trip cleanly into the cache via the `isHosted` flag.
//   2. Safe defaults on 401 / network error → `{ user: null, isHosted: true }`
//      so the UI falls through to a sign-in path rather than throwing.
//
// The hook itself is exercised through `renderToStaticMarkup` to confirm
// it returns `loading: true` on the very first render (when the promise
// is still in flight). `useSyncExternalStore`'s server snapshot is null,
// so the hook returns the loading shape.
//
// We reset the module between test groups via `import.meta.require` +
// `delete require.cache` semantics. Bun doesn't expose `require.cache`,
// so we re-import the module under test with a cache-busting query string
// to get fresh module-level state each time.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

// ── Fetch mock harness ──────────────────────────────────────────────────

type MockResponseSpec =
  | { ok: true; body: unknown }
  | { ok: false; status: number }
  | { throws: true }

function installFetchMock(spec: MockResponseSpec): () => void {
  const original = globalThis.fetch
  const fakeFetch = mock(async (): Promise<Response> => {
    if ("throws" in spec) throw new Error("network down")
    if (spec.ok) {
      return new Response(JSON.stringify(spec.body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response("", { status: spec.status })
  })
  // Preserve the `preconnect` side-property on the typeof fetch signature.
  const impl = Object.assign(fakeFetch, { preconnect: () => {} }) as typeof fetch
  globalThis.fetch = impl
  return () => {
    globalThis.fetch = original
  }
}

// Cache-bust the module between tests so each case starts from a fresh
// promise + snapshot cache. Bun resolves `?v=` suffixes as distinct
// module specifiers.
let importCounter = 0
async function freshModule() {
  importCounter += 1
  return (await import(
    `../use-current-user.ts?v=${importCounter}`
  )) as typeof import("../use-current-user")
}

// ── Module-level cache tests ─────────────────────────────────────────────

describe("refreshCurrentUser()", () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  test("resolves the hosted + user payload", async () => {
    restore = installFetchMock({
      ok: true,
      body: {
        user: { userId: "gh:alice", githubLogin: "alice" },
        isHosted: true,
      },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.isHosted).toBe(true)
    expect(result.user?.githubLogin).toBe("alice")
  })

  test("resolves the non-hosted (CLI/desktop) payload", async () => {
    restore = installFetchMock({
      ok: true,
      body: {
        user: { userId: "local", githubLogin: "local" },
        isHosted: false,
        hasApiKey: false,
      },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.isHosted).toBe(false)
    expect(result.user?.userId).toBe("local")
  })

  test("falls back to { user: null, isHosted: true } on 401", async () => {
    restore = installFetchMock({ ok: false, status: 401 })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.user).toBeNull()
    expect(result.isHosted).toBe(true)
  })

  test("falls back to the safe default on network error", async () => {
    restore = installFetchMock({ throws: true })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.user).toBeNull()
    expect(result.isHosted).toBe(true)
  })

  test("coerces a missing/invalid isHosted flag to true", async () => {
    restore = installFetchMock({
      ok: true,
      body: { user: null, isHosted: "not-a-bool" },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.isHosted).toBe(true)
  })
})

// ── Hook SSR behavior ────────────────────────────────────────────────────
//
// On the very first render — before the fetch promise resolves — the
// hook should return `{ loading: true }`. We drive this via
// `renderToStaticMarkup`: `useSyncExternalStore`'s server-snapshot is
// null, so the hook takes the loading branch regardless of the inflight
// request.

describe("useCurrentUser() initial render", () => {
  let restore: (() => void) | null = null
  beforeEach(() => {
    // Install a mock that resolves slowly — we don't actually wait
    // for it during the sync render test.
    restore = installFetchMock({
      ok: true,
      body: {
        user: { userId: "gh:alice", githubLogin: "alice" },
        isHosted: true,
      },
    })
  })
  afterEach(() => {
    restore?.()
    restore = null
  })

  test("returns { loading: true, user: null, isHosted: true } before resolve", async () => {
    const mod = await freshModule()
    let captured: ReturnType<typeof mod.useCurrentUser> | null = null
    function Probe() {
      captured = mod.useCurrentUser()
      return null
    }
    renderToStaticMarkup(<Probe />)
    expect(captured).not.toBeNull()
    expect(captured!.loading).toBe(true)
    expect(captured!.user).toBeNull()
    expect(captured!.isHosted).toBe(true)
  })
})
