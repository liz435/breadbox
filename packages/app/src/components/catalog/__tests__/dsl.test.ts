import { describe, expect, test } from "bun:test"
import { customComponentDslSchema, type BoardComponent } from "@dreamer/schemas"
import type { NetlistContext } from "@/components/component-definition"
import { dslToComponentDefinition } from "@/components/catalog/dsl-to-definition"

// The DSL equivalent of the `my-sensor` code part: an analog sensor whose signal
// pin is driven to value/100 * 5V, with an analogRead sketch line.
const MY_SENSOR_DSL = {
  type: "custom:my-sensor",
  label: "My Sensor",
  category: "input",
  pins: [
    { name: "vcc", dx: 0, dy: 0, role: "power" },
    { name: "gnd", dx: 0, dy: 1, role: "ground" },
    { name: "sig", dx: 0, dy: 2, role: "analog" },
  ],
  properties: { value: 50 },
  electrical: {
    elements: [{ kind: "source", plus: "sig", minus: "0", volts: "value / 100 * 5" }],
  },
  sketch: { loop: ["int v = analogRead({{pin.sig}}); // {{name}}"] },
}

function makeComp(): BoardComponent {
  return {
    id: "cm1",
    type: "custom:my-sensor",
    name: "CM1",
    x: 2,
    y: 3,
    rotation: 0,
    pins: { vcc: null, gnd: null, sig: 7 },
    properties: { value: 80 },
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

describe("custom component DSL", () => {
  test("compiles to a definition with derived pins/props/footprint", () => {
    const dsl = customComponentDslSchema.parse(MY_SENSOR_DSL)
    const def = dslToComponentDefinition(dsl)
    expect(def.label).toBe("My Sensor")
    expect(def.category).toBe("input")
    expect(def.defaultPins).toEqual({ vcc: null, gnd: null, sig: null })
    expect(def.defaultProperties).toEqual({ value: 50 })
    expect(def.footprint(3, 2, {}).points).toEqual([
      { row: 3, col: 2 },
      { row: 4, col: 2 },
      { row: 5, col: 2 },
    ])
  })

  test("buildNetlist resolves pins and evaluates the volts expression", () => {
    const dsl = customComponentDslSchema.parse(MY_SENSOR_DSL)
    const def = dslToComponentDefinition(dsl)
    if (!def.buildNetlist) throw new Error("expected buildNetlist")
    const comp = makeComp()
    const out = def.buildNetlist(comp, makeCtx(def.footprint(comp.y, comp.x, comp.properties)))
    // sig pin: dy=2 → row 5, col 2 → "n_5_2"; minus "0" → ground; value 80 → 4V
    expect(out?.lines).toEqual(["V_cm1_0 n_5_2 0 4"])
    expect(out?.nodeA).toBe("n_5_2")
    expect(out?.nodeB).toBe("0")
  })

  test("generateSketch expands {{pin.*}} and {{name}} templates", () => {
    const dsl = customComponentDslSchema.parse(MY_SENSOR_DSL)
    const def = dslToComponentDefinition(dsl)
    if (!def.generateSketch) throw new Error("expected generateSketch")
    const sketch = def.generateSketch(makeComp())
    expect(sketch?.loopLines).toEqual(["int v = analogRead(7); // CM1"])
    expect(sketch?.hasPin).toBe(true)
  })

  test("a resistor + input_impedance network with expressions", () => {
    const dsl = customComponentDslSchema.parse({
      type: "custom:divider",
      label: "Divider",
      pins: [
        { name: "vcc", dx: 0, dy: 0 },
        { name: "out", dx: 0, dy: 1 },
        { name: "gnd", dx: 0, dy: 2 },
      ],
      properties: { rTop: 1000, rBot: 2000 },
      electrical: {
        elements: [
          { kind: "resistor", a: "vcc", b: "out", ohms: "rTop" },
          { kind: "resistor", a: "out", b: "gnd", ohms: "rBot" },
          { kind: "input_impedance", pin: "out" },
        ],
      },
    })
    const def = dslToComponentDefinition(dsl)
    if (!def.buildNetlist) throw new Error("expected buildNetlist")
    const comp: BoardComponent = {
      id: "d1",
      type: "custom:divider",
      name: "D1",
      x: 0,
      y: 0,
      rotation: 0,
      pins: { vcc: null, out: null, gnd: null },
      properties: { rTop: 1000, rBot: 2000 },
    }
    const out = def.buildNetlist(comp, makeCtx(def.footprint(comp.y, comp.x, comp.properties)))
    // vcc→(0,0)=n_0_0, out→(0,1)? no: dy increments row. vcc dy0→n_0_0, out dy1→n_1_0, gnd dy2→n_2_0
    expect(out?.lines).toEqual([
      "R_d1_0 n_0_0 n_1_0 1000",
      "R_d1_1 n_1_0 n_2_0 2000",
      "R_d1_2 n_1_0 0 10000",
    ])
  })
})
