// ── External-supply fault diagnostics ────────────────────────────────────
//
// Fault checks used to run over `railSources` — the MCU board rails only —
// so an MB102 channel could sit in overcurrent or collapse entirely and the
// user got no warning at all, even though PowerDomain classified it every
// frame. These assert that every solved supply is checked against the limits
// it declares, not against a hardcoded rail constant.

import { describe, expect, test } from "bun:test"
import { createDefaultPinStates, type BoardComponent, type Wire } from "@dreamer/schemas"
import { analyzeCircuit } from "../circuit-solver"

/** MB102 spanning both rail pairs, plus a load across the left channel. */
function boardWithPsuLoad(loadOhms: number): {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
} {
  const components: Record<string, BoardComponent> = {
    psu: {
      id: "psu", type: "power_supply", name: "PSU", x: 0, y: 0, rotation: 0,
      pins: {}, properties: { leftVoltage: 5, rightVoltage: 3.3 },
    },
    load: {
      id: "load", type: "resistor", name: "R", x: 0, y: 10, rotation: 0,
      pins: {}, properties: { resistance: loadOhms },
    },
  }
  // The resistor lands on holes (10,3) and (10,6) — opposite bus clusters.
  // Bridge each cluster to one side of the PSU's left channel: col -1 (inner)
  // is the + rail, col -2 (outer edge) the − rail (rails are continuous
  // along their length).
  const wires: Record<string, Wire> = {
    wPlus: { id: "wPlus", fromRow: 10, fromCol: 3, toRow: 0, toCol: -1, color: "red" },
    wMinus: { id: "wMinus", fromRow: 10, fromCol: 6, toRow: 0, toCol: -2, color: "black" },
  }
  return { components, wires }
}

describe("solved supply faults", () => {
  test("a lightly loaded MB102 channel raises no supply fault", () => {
    const { components, wires } = boardWithPsuLoad(1000) // ~5mA
    const result = analyzeCircuit(components, wires, createDefaultPinStates())
    const supplyFaults = result.warnings.filter(
      (w) => w.type === "overcurrent" || w.type === "undervoltage" || w.type === "short_circuit",
    )
    expect(supplyFaults).toEqual([])
  })

  test("an overloaded MB102 channel is reported against its own 700mA limit", () => {
    // ~5V / 2Ω ≈ 2.5A, far past the module's declared limit.
    const { components, wires } = boardWithPsuLoad(2)
    const result = analyzeCircuit(components, wires, createDefaultPinStates())

    const faults = result.warnings.filter(
      (w) => w.type === "overcurrent" || w.type === "short_circuit" || w.type === "undervoltage",
    )
    expect(faults.length).toBeGreaterThan(0)
    // Named by the supply's own label, not "5V rail" — the board rails are
    // not involved in this circuit at all.
    expect(faults.some((w) => w.message.includes("PSU left"))).toBe(true)
  })

  test("the solver publishes the external channel as a solved supply", () => {
    const { components, wires } = boardWithPsuLoad(2)
    const result = analyzeCircuit(components, wires, createDefaultPinStates())
    const left = result.supplies.find((s) => s.id === "psu:left")
    expect(left).toBeDefined()
    expect(left?.currentLimitMa).toBe(700)
    expect(left?.currentMa).toBeGreaterThan(700)
  })
})
