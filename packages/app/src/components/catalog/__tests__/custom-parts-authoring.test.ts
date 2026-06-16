import { afterEach, describe, expect, test } from "bun:test"
import {
  extractPartId,
  fetchCustomPartSource,
  listCustomParts,
  removeCustomPart,
  saveCustomPartSource,
} from "@/components/catalog/custom-parts-api"
import { CUSTOM_PART_TEMPLATE } from "@/components/catalog/custom-part-template"
import { registerPluginModule } from "@/components/catalog/load-plugin"
import { createPluginHost } from "@/components/catalog/plugin-host"
import { getComponentDef } from "@/components/catalog/manager"
import { __resetCustomComponents, registerCustom } from "@/components/catalog/custom-store"

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  __resetCustomComponents()
})

describe("extractPartId", () => {
  test("pulls the id from the declared custom type", () => {
    expect(extractPartId(CUSTOM_PART_TEMPLATE)).toBe("my-sensor")
    expect(extractPartId('type: "custom:foo-bar"')).toBe("foo-bar")
    expect(extractPartId("type: 'custom:baz'")).toBe("baz")
  })

  test("returns null when no custom type is declared", () => {
    expect(extractPartId('type: "led"')).toBeNull()
    expect(extractPartId("no type here")).toBeNull()
  })
})

describe("custom-parts API client", () => {
  test("listCustomParts returns the parts array", async () => {
    mockFetch(() => new Response(JSON.stringify({ parts: [{ id: "a" }, { id: "b" }] }), { status: 200 }))
    expect(await listCustomParts()).toEqual([{ id: "a" }, { id: "b" }])
  })

  test("listCustomParts is resilient to errors", async () => {
    mockFetch(() => new Response("nope", { status: 500 }))
    expect(await listCustomParts()).toEqual([])
  })

  test("fetchCustomPartSource returns source text", async () => {
    mockFetch(() => new Response(JSON.stringify({ id: "a", source: "SRC" }), { status: 200 }))
    expect(await fetchCustomPartSource("a")).toBe("SRC")
  })

  test("saveCustomPartSource posts id+source and reports success", async () => {
    let capturedUrl = ""
    let capturedBody = ""
    mockFetch((url, init) => {
      capturedUrl = url
      capturedBody = String(init?.body ?? "")
      return new Response(JSON.stringify({ ok: true, id: "foo" }), { status: 200 })
    })
    const res = await saveCustomPartSource("foo", "const x = 1")
    expect(res).toEqual({ ok: true })
    expect(capturedUrl).toBe("/api/custom-parts")
    expect(JSON.parse(capturedBody)).toEqual({ id: "foo", source: "const x = 1" })
  })

  test("saveCustomPartSource surfaces server errors", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: false, error: "boom" }), { status: 422 }))
    expect(await saveCustomPartSource("foo", "x")).toEqual({ ok: false, error: "boom" })
  })

  test("removeCustomPart deletes the file and unregisters the type", async () => {
    const def = createPluginHost().defineComponent({
      type: "custom:gone",
      label: "Gone",
      pins: [{ name: "a", dx: 0, dy: 0 }],
    })
    registerCustom(def)
    expect(getComponentDef("custom:gone")).toBeDefined()

    mockFetch(() => new Response(null, { status: 200 }))
    expect(await removeCustomPart("gone")).toBe(true)
    expect(getComponentDef("custom:gone")).toBeUndefined()
  })
})

describe("starter template", () => {
  test("transpiles, registers, and resolves end-to-end", async () => {
    const js = new Bun.Transpiler({ loader: "ts" }).transformSync(CUSTOM_PART_TEMPLATE)
    const mod = await import(`data:text/javascript;base64,${btoa(js)}`)
    const res = registerPluginModule(mod.default)
    expect(res.ok).toBe(true)
    const def = getComponentDef("custom:my-sensor")
    expect(def?.label).toBe("My Sensor")
    expect(def?.defaultPins).toEqual({ vcc: null, gnd: null, sig: null })
  })
})
