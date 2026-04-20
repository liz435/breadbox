// SSRF-guard tests. Stubs dns.promises.lookup via the module's
// exported _setLookupImplForTests hook so we don't depend on real DNS.

import { afterAll, beforeEach, describe, expect, test } from "bun:test"

const {
  assertSafeUrl,
  SsrfBlockedError,
  _setLookupImplForTests,
  _clearDnsCacheForTests,
} = await import("../ssrf-guard")

type LookupAddress = { address: string; family: number }

function mockLookup(addresses: LookupAddress[]) {
  return (async () => addresses) as unknown as Parameters<
    typeof _setLookupImplForTests
  >[0]
}

let restore: (() => void) | null = null

beforeEach(() => {
  _clearDnsCacheForTests()
  if (restore) {
    restore()
    restore = null
  }
})

afterAll(() => {
  if (restore) restore()
})

describe("IP literal blocklist", () => {
  test("127.0.0.1 rejected", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("10.0.0.1 rejected", async () => {
    await expect(assertSafeUrl("http://10.0.0.1/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("169.254.169.254 (cloud metadata) rejected", async () => {
    await expect(
      assertSafeUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  test("192.168.1.1 rejected", async () => {
    await expect(assertSafeUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("172.16.0.1 rejected", async () => {
    await expect(assertSafeUrl("http://172.16.0.1/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("172.31.255.255 rejected (top of 172.16/12)", async () => {
    await expect(
      assertSafeUrl("http://172.31.255.255/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  test("172.32.0.1 allowed (outside 172.16/12)", async () => {
    // Literal IP, no DNS needed.
    await assertSafeUrl("http://172.32.0.1/")
  })

  test("::1 rejected", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("fe80::1 (link-local) rejected", async () => {
    await expect(assertSafeUrl("http://[fe80::1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("public IPv4 literal allowed", async () => {
    await assertSafeUrl("http://8.8.8.8/")
  })
})

describe("DNS resolution", () => {
  test("hostname resolving to 127.0.0.1 rejected", async () => {
    restore = _setLookupImplForTests(
      mockLookup([{ address: "127.0.0.1", family: 4 }]),
    )
    await expect(
      assertSafeUrl("http://rebind.example.com/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  test("hostname resolving to public IP allowed", async () => {
    restore = _setLookupImplForTests(
      mockLookup([{ address: "93.184.216.34", family: 4 }]),
    )
    await assertSafeUrl("http://example.com/")
  })

  test("mixed result with any blocked address → reject", async () => {
    restore = _setLookupImplForTests(
      mockLookup([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    )
    await expect(
      assertSafeUrl("http://mixed.example.com/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  test("DNS cache is honored within TTL", async () => {
    let calls = 0
    const impl = (async () => {
      calls++
      return [{ address: "93.184.216.34", family: 4 }]
    }) as unknown as Parameters<typeof _setLookupImplForTests>[0]
    restore = _setLookupImplForTests(impl)

    await assertSafeUrl("http://cached.example.com/")
    await assertSafeUrl("http://cached.example.com/")
    await assertSafeUrl("http://cached.example.com/")
    expect(calls).toBe(1)
  })
})

describe("scheme + input validation", () => {
  test("file:// scheme rejected", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("gopher:// rejected", async () => {
    await expect(
      assertSafeUrl("gopher://example.com/1"),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  test("malformed URL rejected", async () => {
    await expect(assertSafeUrl("not-a-url")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })

  test("localhost hostname rejected (even without DNS)", async () => {
    await expect(assertSafeUrl("http://localhost/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    )
  })
})
