// ── use-current-user tests ───────────────────────────────────────────────
//
// The hook is a thin subscription over a module-level promise cache,
// so the tests focus on two things:
//   1. The three modes the server can return ("hosted" | "local" | "dev")
//      each round-trip cleanly into the cache.
//   2. Safe defaults on 401 / network error → `{ user: null, mode: "hosted" }`
//      so the UI falls through to a login screen rather than throwing.
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

  test("resolves the hosted mode + user payload", async () => {
    restore = installFetchMock({
      ok: true,
      body: {
        user: { userId: "gh:alice", githubLogin: "alice" },
        mode: "hosted",
      },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.mode).toBe("hosted")
    expect(result.user?.githubLogin).toBe("alice")
  })

  test("resolves local mode with null user", async () => {
    restore = installFetchMock({
      ok: true,
      body: { user: null, mode: "local" },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.mode).toBe("local")
    expect(result.user).toBeNull()
  })

  test("resolves dev mode (skip-auth) when server says so", async () => {
    restore = installFetchMock({
      ok: true,
      body: {
        user: { userId: "local", githubLogin: "local" },
        mode: "dev",
      },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.mode).toBe("dev")
    expect(result.user?.userId).toBe("local")
  })

  test("falls back to { user: null, mode: 'hosted' } on 401", async () => {
    restore = installFetchMock({ ok: false, status: 401 })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.user).toBeNull()
    expect(result.mode).toBe("hosted")
  })

  test("falls back to the safe default on network error", async () => {
    restore = installFetchMock({ throws: true })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.user).toBeNull()
    expect(result.mode).toBe("hosted")
  })

  test("coerces unknown mode values to 'hosted'", async () => {
    restore = installFetchMock({
      ok: true,
      body: { user: null, mode: "not-a-real-mode" },
    })
    const mod = await freshModule()
    const result = await mod.refreshCurrentUser()
    expect(result.mode).toBe("hosted")
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
        mode: "hosted",
      },
    })
  })
  afterEach(() => {
    restore?.()
    restore = null
  })

  test("returns { loading: true, user: null, mode: 'hosted' } before resolve", async () => {
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
    expect(captured!.mode).toBe("hosted")
  })
})
