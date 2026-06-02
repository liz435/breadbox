// CLI auth middleware — Host/Origin gate tests.
//
// The gate must accept *any* loopback port, not just the 4111/4112/3004
// defaults: headed/serve mode falls back to an OS-assigned port when its
// preferred one is taken (e.g. an orphaned sidecar from a prior launch holds
// 4112). A port-pinned allowlist 403'd every API call in that case — the bug
// that surfaced as "403 when starting desktop app". We still reject
// non-loopback hosts/origins to keep the DNS-rebind defense intact.

import { describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import { cliAuthPlugin } from "../cli-middleware"

const app = new Elysia()
  .use(cliAuthPlugin)
  .get("/api/ping", () => "pong")

async function ping(headers: Record<string, string>): Promise<number> {
  const res = await app.handle(
    new Request("http://localhost/api/ping", { headers }),
  )
  return res.status
}

describe("host gate", () => {
  test("allows the preferred ports", async () => {
    expect(await ping({ host: "localhost:4112" })).toBe(200)
    expect(await ping({ host: "127.0.0.1:4111" })).toBe(200)
  })

  test("allows an OS-assigned fallback port (the regression)", async () => {
    expect(await ping({ host: "localhost:53187" })).toBe(200)
    expect(await ping({ host: "127.0.0.1:61023" })).toBe(200)
  })

  test("allows a bare loopback host with no port", async () => {
    expect(await ping({ host: "localhost" })).toBe(200)
  })

  test("allows IPv6 loopback with a port", async () => {
    expect(await ping({ host: "[::1]:4112" })).toBe(200)
  })

  test("rejects a non-loopback host (DNS-rebind defense)", async () => {
    expect(await ping({ host: "evil.com:4112" })).toBe(403)
    expect(await ping({ host: "192.168.1.20:4112" })).toBe(403)
  })

  test("rejects a missing host header", async () => {
    expect(await ping({})).toBe(403)
  })
})

describe("origin gate", () => {
  test("allows any loopback origin regardless of port", async () => {
    expect(
      await ping({ host: "localhost:4112", origin: "http://localhost:3004" }),
    ).toBe(200)
    expect(
      await ping({ host: "localhost:4112", origin: "http://localhost:51999" }),
    ).toBe(200)
    expect(
      await ping({ host: "localhost:4112", origin: "http://127.0.0.1:48080" }),
    ).toBe(200)
  })

  test("accepts a loopback Referer fallback (full URL with path)", async () => {
    expect(
      await ping({
        host: "localhost:4112",
        referer: "http://localhost:3004/projects/abc",
      }),
    ).toBe(200)
  })

  test("rejects a non-loopback origin", async () => {
    expect(
      await ping({ host: "localhost:4112", origin: "http://evil.com" }),
    ).toBe(403)
  })

  test("rejects a malformed origin", async () => {
    expect(
      await ping({ host: "localhost:4112", origin: "not-a-url" }),
    ).toBe(403)
  })
})
