// ── Request-context isolation tests ─────────────────────────────────────
//
// AsyncLocalStorage threads a per-request context through the async call
// stack without explicit plumbing. The risk of using `als.enterWith` (vs.
// the recommended `als.run`) is that the store installs on the current
// async resource permanently — a Bun runtime change that reuses async
// resources across requests could silently bleed one user's identity
// into another's logs.
//
// These tests are the load-bearing assertion that today's `enterWith`
// pattern actually isolates contexts in practice. If a future runtime
// change breaks this, the test fails before tenants do.

import { describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import {
  getRequestContext,
  requestContextPlugin,
  runWithRequestContext,
} from "../request-context"

describe("getRequestContext / runWithRequestContext", () => {
  test("returns null outside any request scope", () => {
    expect(getRequestContext()).toBeNull()
  })

  test("runWithRequestContext threads the value to async continuations", async () => {
    await runWithRequestContext(
      { userId: "u1", requestId: "r1" },
      async () => {
        expect(getRequestContext()?.userId).toBe("u1")
        await new Promise((r) => setTimeout(r, 5))
        // Surviving an await is the load-bearing property.
        expect(getRequestContext()?.userId).toBe("u1")
      },
    )
  })

  test("nested runs restore the outer context on exit", async () => {
    await runWithRequestContext(
      { userId: "outer", requestId: "r-outer" },
      async () => {
        expect(getRequestContext()?.userId).toBe("outer")
        await runWithRequestContext(
          { userId: "inner", requestId: "r-inner" },
          () => {
            expect(getRequestContext()?.userId).toBe("inner")
          },
        )
        expect(getRequestContext()?.userId).toBe("outer")
      },
    )
  })
})

describe("requestContextPlugin — concurrent isolation", () => {
  // Build a minimal app that injects a synthetic auth context per
  // request and uses the plugin to populate ALS, then reads the
  // active userId from a handler that contains an await. Two
  // simultaneous requests must each see their own userId — not the
  // other's, and not the last-installed one.
  function buildApp() {
    return new Elysia()
      .derive({ as: "global" }, ({ request }) => {
        const url = new URL(request.url)
        const userId = url.searchParams.get("user") ?? null
        return { auth: { userId, sessionId: null, mode: "dev" as const } }
      })
      .use(requestContextPlugin)
      .get("/whoami", async () => {
        // Force an await so the context has to survive a microtask.
        await new Promise((r) => setTimeout(r, 10))
        const ctx = getRequestContext()
        return { userId: ctx?.userId ?? null, requestId: ctx?.requestId ?? null }
      })
  }

  test("two simultaneous requests see distinct userIds", async () => {
    const app = buildApp()
    const [aRes, bRes] = await Promise.all([
      app.handle(new Request("http://localhost/whoami?user=alice")),
      app.handle(new Request("http://localhost/whoami?user=bob")),
    ])
    const a = (await aRes.json()) as { userId: string; requestId: string }
    const b = (await bRes.json()) as { userId: string; requestId: string }
    expect(a.userId).toBe("alice")
    expect(b.userId).toBe("bob")
    // requestId is generated per request; two requests must produce two ids.
    expect(a.requestId).not.toBe(b.requestId)
  })

  test("each request gets a unique requestId across a burst", async () => {
    const app = buildApp()
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        app
          .handle(new Request(`http://localhost/whoami?user=u${i}`))
          .then((r) => r.json() as Promise<{ userId: string; requestId: string }>),
      ),
    )
    // Each user should match its own request, and all request ids unique.
    for (let i = 0; i < results.length; i += 1) {
      expect(results[i]!.userId).toBe(`u${i}`)
    }
    const ids = new Set(results.map((r) => r.requestId))
    expect(ids.size).toBe(results.length)
  })
})
