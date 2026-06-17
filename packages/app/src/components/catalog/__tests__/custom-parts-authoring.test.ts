import { afterEach, describe, expect, test } from "bun:test"
import { API_ORIGIN } from "@dreamer/config"
import {
  detectFormat,
  extractPartId,
  fetchCustomPart,
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

  test("works for DSL (quoted) and code (unquoted) keys", () => {
    expect(extractPartId('"type": "custom:foo"')).toBe("foo")
    expect(extractPartId('type: "custom:bar"')).toBe("bar")
  })

  test("returns null when no custom type is declared", () => {
    expect(extractPartId('type: "led"')).toBeNull()
    expect(extractPartId("no type here")).toBeNull()
  })
})

describe("detectFormat", () => {
  test("a JSON object with a type is DSL; everything else is code", () => {
    expect(detectFormat('{ "type": "custom:x", "label": "X" }')).toBe("dsl")
    expect(detectFormat("export default (host) => host.defineComponent({})")).toBe("code")
    expect(detectFormat("{ not json")).toBe("code")
    expect(detectFormat('{ "label": "no type" }')).toBe("code")
  })
})

describe("custom-parts API client", () => {
  test("listCustomParts returns the parts array", async () => {
    mockFetch(() => new Response(
      JSON.stringify({ parts: [{ id: "a", format: "code" }, { id: "b", format: "dsl" }] }),
      { status: 200 },
    ))
    expect(await listCustomParts()).toEqual([
      { id: "a", format: "code" },
      { id: "b", format: "dsl" },
    ])
  })

  test("listCustomParts is resilient to errors", async () => {
    mockFetch(() => new Response("nope", { status: 500 }))
    expect(await listCustomParts()).toEqual([])
  })

  test("fetchCustomPart returns source and format", async () => {
    mockFetch(() => new Response(JSON.stringify({ id: "a", source: "SRC", format: "dsl" }), { status: 200 }))
    expect(await fetchCustomPart("a")).toEqual({ source: "SRC", format: "dsl" })
  })

  const JSON_HEADERS = { "content-type": "application/json" }

  test("saveCustomPartSource posts id+format+source and reports success", async () => {
    let capturedUrl = ""
    let capturedBody = ""
    mockFetch((url, init) => {
      capturedUrl = url
      capturedBody = String(init?.body ?? "")
      return new Response(JSON.stringify({ ok: true, id: "foo" }), { status: 200, headers: JSON_HEADERS })
    })
    const res = await saveCustomPartSource("foo", "code", "const x = 1")
    expect(res).toEqual({ ok: true })
    expect(capturedUrl).toBe(`${API_ORIGIN}/api/custom-parts`)
    expect(JSON.parse(capturedBody)).toEqual({ id: "foo", format: "code", source: "const x = 1" })
  })

  test("saveCustomPartSource surfaces server errors", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: false, error: "boom" }), { status: 422, headers: JSON_HEADERS }))
    expect(await saveCustomPartSource("foo", "code", "x")).toEqual({ ok: false, error: "boom" })
  })

  test("saveCustomPartSource detects the SPA fallback (route missing → HTML 200)", async () => {
    mockFetch(() => new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }))
    const res = await saveCustomPartSource("foo", "code", "x")
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toContain("rebuild the desktop sidecar")
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
