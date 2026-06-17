import { beforeEach, describe, expect, test } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import type { NetlistContext } from "@/components/component-definition"
import { getComponentDef } from "@/components/catalog/manager"
import { getComponentRenderer } from "@/breadboard/component-renderers/index"
import { CustomPartRenderer } from "@/breadboard/component-renderers/custom-part-renderer"
import { registerPluginModule } from "@/components/catalog/load-plugin"
import { __resetCustomComponents } from "@/components/catalog/custom-store"
import type { CustomComponentModule } from "@/components/catalog/plugin-host"

// A representative custom part: an analog sensor whose output voltage tracks a
// `moisture` property. Exercises pins, properties, the pin/prop api, and sketch.
const soilMoisture: CustomComponentModule = (host) =>
  host.defineComponent({
    type: "custom:soil-moisture",
    label: "Soil Moisture",
    category: "input",
    pins: [
      { name: "vcc", dx: 0, dy: 0, role: "power" },
      { name: "gnd", dx: 0, dy: 1, role: "ground" },
      { name: "sig", dx: 0, dy: 2, role: "analog" },
    ],
    properties: { moisture: 50 },
    spicePrefix: "V",
    buildNetlist: (_comp, _ctx, api) => {
      const sig = api.pin("sig")
      const volts = (api.prop<number>("moisture", 50) / 100) * 5
      return { lines: [`V_${api.id} ${sig} 0 ${volts}`], nodeA: sig, nodeB: "0" }
    },
    generateSketch: (comp) => ({
      loopLines: [`  int v = analogRead(${comp.pins.sig}); // ${comp.name}`],
      hasPin: true,
    }),
  })

// Placed-instance fixture. BoardComponent.type accepts custom:* types directly.
function makeComp(overrides: Partial<BoardComponent> = {}): BoardComponent {
  return {
    id: "cm1",
    type: "custom:soil-moisture",
    name: "CM1",
    x: 2,
    y: 3,
    rotation: 0,
    pins: { vcc: null, gnd: null, sig: 7 },
    properties: { moisture: 80 },
    ...overrides,
  }
}

function makeCtx(footprint: NetlistContext["footprint"]): NetlistContext {
  return {
    footprint,
    resolveNode: (p) => `n_${p.row}_${p.col}`,
    pinStates: [],
    wires: {},
  }
}

describe("custom component registration", () => {
  beforeEach(() => {
    __resetCustomComponents()
  })

  test("registers and is resolvable via getComponentDef with derived pins", () => {
    const res = registerPluginModule(soilMoisture)
    expect(res.ok).toBe(true)

    const def = getComponentDef("custom:soil-moisture")
    expect(def?.label).toBe("Soil Moisture")
    expect(def?.defaultPins).toEqual({ vcc: null, gnd: null, sig: null })
    expect(def?.defaultProperties).toEqual({ moisture: 50 })
  })

  test("derives footprint points from declared pin offsets", () => {
    registerPluginModule(soilMoisture)
    const def = getComponentDef("custom:soil-moisture")
    const footprint = def?.footprint(3, 2, {})
    expect(footprint?.points).toEqual([
      { row: 3, col: 2 },
      { row: 4, col: 2 },
      { row: 5, col: 2 },
    ])
  })

  test("buildNetlist runs through the standard contract using the pin/prop api", () => {
    registerPluginModule(soilMoisture)
    const def = getComponentDef("custom:soil-moisture")
    if (!def?.buildNetlist) throw new Error("expected a buildNetlist")

    const comp = makeComp()
    const out = def.buildNetlist(comp, makeCtx(def.footprint(comp.y, comp.x, comp.properties)))
    // sig pin: dy=2 → row 3+2=5, col 2 → node "n_5_2"; moisture 80 → 4V
    expect(out?.lines).toEqual(["V_cm1 n_5_2 0 4"])
    expect(out?.nodeA).toBe("n_5_2")
  })

  test("uses the auto-box CustomPartRenderer when no renderer is supplied", () => {
    registerPluginModule(soilMoisture)
    expect(getComponentRenderer("custom:soil-moisture")).toBe(CustomPartRenderer)
  })

  test("uses the missing-part placeholder for an unregistered custom type", () => {
    expect(getComponentRenderer("custom:not-loaded")).toBe(CustomPartRenderer)
  })

  test("uses a custom-supplied renderer when present", () => {
    const StubRenderer = () => null
    const withRenderer: CustomComponentModule = (host) =>
      host.defineComponent({
        type: "custom:has-renderer",
        label: "Has Renderer",
        pins: [{ name: "a", dx: 0, dy: 0 }],
        renderer: StubRenderer,
      })
    registerPluginModule(withRenderer)
    expect(getComponentRenderer("custom:has-renderer")).toBe(StubRenderer)
  })

  test("isolates a throwing plugin callback instead of crashing", () => {
    const broken: CustomComponentModule = (host) =>
      host.defineComponent({
        type: "custom:broken",
        label: "Broken",
        pins: [{ name: "a", dx: 0, dy: 0 }],
        buildNetlist: () => {
          throw new Error("boom")
        },
      })
    registerPluginModule(broken)
    const def = getComponentDef("custom:broken")
    if (!def?.buildNetlist) throw new Error("expected a buildNetlist")
    const comp = makeComp()
    expect(def.buildNetlist(comp, makeCtx(def.footprint(comp.y, comp.x, comp.properties)))).toBeNull()
  })

  test("rejects invalid plugins", () => {
    expect(registerPluginModule("not a function").ok).toBe(false)

    const nonCustom: CustomComponentModule = (host) =>
      host.defineComponent({
        type: "led",
        label: "Nope",
        pins: [{ name: "a", dx: 0, dy: 0 }],
      })
    const res = registerPluginModule(nonCustom)
    expect(res.ok).toBe(false)
  })
})
