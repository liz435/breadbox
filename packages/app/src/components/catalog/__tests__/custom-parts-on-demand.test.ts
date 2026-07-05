import { afterEach, describe, expect, test } from "bun:test"
import { ensureCustomPartsRegistered } from "@/components/catalog/custom-parts-on-demand"
import { __resetCustomComponents, getCustomDef } from "@/components/catalog/custom-store"
import { registerDslPart } from "@/components/catalog/load-plugin"

const DSL_SOURCE = JSON.stringify({
  type: "custom:demand-part",
  label: "Demand Part",
  pins: [{ name: "sig", dx: 0, dy: 0, role: "analog" }],
  electrical: { elements: [{ kind: "source", plus: "sig", minus: "0", volts: "5" }] },
})

const realFetch = globalThis.fetch

function mockPartSource(source: string): { calls: () => number } {
  let calls = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls += 1
    if (String(input).endsWith("/source")) {
      return new Response(JSON.stringify({ source, format: "dsl" }), { status: 200 })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { calls: () => calls }
}

afterEach(() => {
  globalThis.fetch = realFetch
  __resetCustomComponents()
})

describe("ensureCustomPartsRegistered", () => {
  test("fetches and registers an unknown custom part", async () => {
    mockPartSource(DSL_SOURCE)
    expect(getCustomDef("custom:demand-part")).toBeUndefined()
    await ensureCustomPartsRegistered(["custom:demand-part", "led"])
    expect(getCustomDef("custom:demand-part")?.label).toBe("Demand Part")
  })

  test("skips built-ins and already-registered parts", async () => {
    const mock = mockPartSource(DSL_SOURCE)
    const registered = registerDslPart(DSL_SOURCE)
    expect(registered.ok).toBe(true)
    await ensureCustomPartsRegistered(["led", "custom:demand-part"])
    expect(mock.calls()).toBe(0)
  })

  test("dedupes concurrent requests for the same type", async () => {
    const mock = mockPartSource(DSL_SOURCE)
    const first = ensureCustomPartsRegistered(["custom:demand-part"])
    const second = ensureCustomPartsRegistered(["custom:demand-part", "custom:demand-part"])
    await Promise.all([first, second])
    expect(mock.calls()).toBe(1)
    expect(getCustomDef("custom:demand-part")).toBeDefined()
  })

  test("a failed fetch does not register anything and does not throw", async () => {
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response("nope", { status: 404 })) as typeof fetch
    await ensureCustomPartsRegistered(["custom:missing-part"])
    expect(getCustomDef("custom:missing-part")).toBeUndefined()
  })
})
