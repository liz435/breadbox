// ── Board-level transistor test (ROADMAP Phase A′, app side) ──────────────
//
// Exercises the full path: catalog def → netlist builder → spicey Q element
// → TransientSession → component electrical state. A classic low-side BJT
// switch: D13 drives the base through 10 kΩ; the collector load is 220 Ω
// from the 5 V rail; emitter grounded.

import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"
import { TransientSession } from "../transient-session"
import { analyzeCircuitTransient } from "../circuit-solver"

function makePinStates(
  overrides: Array<{ pin: number } & Partial<PinState>> = [],
): PinState[] {
  const states = createDefaultPinStates()
  for (const o of overrides) states[o.pin] = { ...states[o.pin], ...o }
  return states
}

function makeWire(id: string, fromRow: number, fromCol: number, toRow: number, toCol: number): Wire {
  return { id, fromRow, fromCol, toRow, toCol, color: "#22c55e" }
}

function board(): { components: Record<string, BoardComponent>; wires: Record<string, Wire> } {
  const components: Record<string, BoardComponent> = {
    rColl: {
      id: "rColl", type: "resistor", name: "Rc", x: 0, y: 3, rotation: 0,
      pins: { a: null, b: null }, properties: { resistance: 220 },
    },
    rBase: {
      id: "rBase", type: "resistor", name: "Rb", x: 0, y: 5, rotation: 0,
      pins: { a: null, b: null }, properties: { resistance: 10000 },
    },
    t1: {
      id: "t1", type: "transistor", name: "Q1", x: 6, y: 7, rotation: 0,
      pins: { collector: null, base: null, emitter: null },
      properties: { polarity: "npn", beta: 200 },
    },
  }
  const wires: Record<string, Wire> = {
    w5v: makeWire("w5v", -999, -1, 3, 3), // 5V → Rc.a
    wCol: makeWire("wCol", 3, 6, 7, 6), // Rc.b → collector
    wPin: makeWire("wPin", -999, 13, 5, 3), // D13 → Rb.a
    wBase: makeWire("wBase", 5, 6, 8, 6), // Rb.b → base
    wGnd: makeWire("wGnd", -999, -3, 9, 6), // emitter → GND
  }
  return { components, wires }
}

describe("BJT switch on the breadboard", () => {
  test("base HIGH saturates the transistor (VCE < 0.3 V, IC ≈ 21 mA)", () => {
    const session = new TransientSession()
    const { components, wires } = board()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const analysis = analyzeCircuitTransient(components, wires, pinStates, undefined, {
      dtSimSeconds: 0.01,
      session,
    })
    expect(analysis.netlist).toContain("Q_t1")
    expect(analysis.netlist).toContain(".model QMOD_t1 NPN")

    const t1 = analysis.componentStates.get("t1")
    expect(t1).toBeDefined()
    expect(t1!.isActive).toBe(true)
    expect(Math.abs(t1!.voltage)).toBeLessThan(0.3) // VCE collapsed
    expect(t1!.current).toBeGreaterThan(18) // mA through the collector
    expect(t1!.current).toBeLessThan(24)
  })

  test("base LOW cuts the transistor off (collector floats to the rail)", () => {
    const session = new TransientSession()
    const { components, wires } = board()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 0 }])

    const analysis = analyzeCircuitTransient(components, wires, pinStates, undefined, {
      dtSimSeconds: 0.01,
      session,
    })
    const t1 = analysis.componentStates.get("t1")
    expect(t1).toBeDefined()
    expect(Math.abs(t1!.current)).toBeLessThan(0.05) // ~no collector current
    expect(Math.abs(t1!.voltage)).toBeGreaterThan(4.5) // VCE ≈ rail
  })
})
