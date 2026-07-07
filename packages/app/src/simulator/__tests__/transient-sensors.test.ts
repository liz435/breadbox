// ── Phase C: electrical sensors through the solver ─────────────────────────
//
// With the transient solver on, potentiometer and photoresistor readings
// come from the SOLVED NODE VOLTAGE at the analog pin's landing point —
// wiring mistakes now have real consequences instead of the dial owning
// the value unconditionally.

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

/**
 * Pot divider board. Pot footprint: vcc (row, col), signal/wiper (row+1),
 * gnd (row+2). A0 (= pin 14) wires to the wiper row.
 */
function potBoard(value: number, opts?: { omitGnd?: boolean }): {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
} {
  const components: Record<string, BoardComponent> = {
    pot1: {
      id: "pot1", type: "potentiometer", name: "pot", x: 2, y: 5, rotation: 0,
      pins: { vcc: null, signal: null, gnd: null }, properties: { value },
    },
  }
  const wires: Record<string, Wire> = {
    w5v: makeWire("w5v", -999, -1, 5, 2), // 5V → vcc
    wA0: makeWire("wA0", -999, 14, 6, 2), // A0 → wiper
  }
  if (!opts?.omitGnd) {
    wires.wGnd = makeWire("wGnd", -999, -3, 7, 2) // gnd row → GND
  }
  return { components, wires }
}

function wiperVoltage(components: Record<string, BoardComponent>, wires: Record<string, Wire>): number {
  const analysis = analyzeCircuitTransient(components, wires, makePinStates(), undefined, {
    dtSimSeconds: 0.01,
    session: new TransientSession(),
  })
  const v = analysis.nodeVoltageAt?.({ row: 6, col: 2 })
  if (v === null || v === undefined) throw new Error("wiper node not resolved")
  return v
}

describe("potentiometer through the solver", () => {
  test("mid dial reads half the rail at the wiper node", () => {
    const { components, wires } = potBoard(50)
    const v = wiperVoltage(components, wires)
    expect(Math.abs(v - 2.5)).toBeLessThan(0.1)
  })

  test("25% dial reads a quarter of the rail", () => {
    const { components, wires } = potBoard(25)
    const v = wiperVoltage(components, wires)
    expect(Math.abs(v - 1.25)).toBeLessThan(0.1)
  })

  test("MISWIRED: missing GND leg floats the wiper to the rail — the dial no longer owns the value", () => {
    const { components, wires } = potBoard(50, { omitGnd: true })
    const v = wiperVoltage(components, wires)
    // No return path: the whole divider sits at ~5 V regardless of the dial.
    expect(v).toBeGreaterThan(4.5)
  })
})

describe("photoresistor through the solver", () => {
  /**
   * Classic LDR divider: 5V → 10 kΩ fixed → mid row → LDR → GND, A0 on the
   * mid row. Resistor footprint is fixed at cols 3/6; LDR pins are
   * (row, col) / (row+1, col).
   */
  function ldrBoard(light: number): {
    components: Record<string, BoardComponent>
    wires: Record<string, Wire>
  } {
    const components: Record<string, BoardComponent> = {
      rFixed: {
        id: "rFixed", type: "resistor", name: "R", x: 0, y: 3, rotation: 0,
        pins: { a: null, b: null }, properties: { resistance: 10000 },
      },
      ldr1: {
        id: "ldr1", type: "photoresistor", name: "LDR", x: 6, y: 5, rotation: 0,
        pins: { a: null, b: null }, properties: { light },
      },
    }
    const wires: Record<string, Wire> = {
      w5v: makeWire("w5v", -999, -1, 3, 3), // 5V → R.a
      wMid: makeWire("wMid", 3, 6, 5, 6), // R.b → LDR.a (mid node)
      wA0: makeWire("wA0", -999, 14, 5, 6), // A0 → mid node
      wGnd: makeWire("wGnd", -999, -3, 6, 6), // LDR.b → GND
    }
    return { components, wires }
  }

  function midVoltage(light: number): number {
    const { components, wires } = ldrBoard(light)
    const analysis = analyzeCircuitTransient(components, wires, makePinStates(), undefined, {
      dtSimSeconds: 0.01,
      session: new TransientSession(),
    })
    const v = analysis.nodeVoltageAt?.({ row: 5, col: 6 })
    if (v === null || v === undefined) throw new Error("mid node not resolved")
    return v
  }

  test("brighter light lowers the divider voltage (LDR resistance drops)", () => {
    const dark = midVoltage(0)
    const mid = midVoltage(50)
    const bright = midVoltage(100)
    expect(dark).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(bright)
    // Physical envelope: full-dark ≈ rail, full-bright well below 1 V.
    expect(dark).toBeGreaterThan(4)
    expect(bright).toBeLessThan(1)
  })
})
