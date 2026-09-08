import { describe, expect, test } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import {
  compileElectricalTopology,
  electricalTerminalKey,
} from "../electrical-topology"

function resistor(
  id: string,
  parentId: string | null = null,
): BoardComponent {
  return {
    id,
    type: "resistor",
    name: id,
    x: 0,
    y: 5,
    rotation: 0,
    parentId,
    pins: { a: null, b: null },
    properties: { resistance: 220 },
  }
}

function surface(id: string): BoardComponent {
  return {
    id,
    type: "breadboard_full",
    name: id,
    x: 0,
    y: 0,
    rotation: 0,
    parentId: null,
    pins: {},
    properties: {},
  }
}

function wire(id: string, fromCol: number, toCol: number): Wire {
  return { id, fromRow: 5, fromCol, toRow: 5, toCol, color: "#22c55e" }
}

describe("electrical topology contract", () => {
  test("maps every named terminal to the same resolved net used by consumers", () => {
    const components = { r1: resistor("r1") }
    const topology = compileElectricalTopology(components, {
      short: wire("short", 3, 6),
    })

    const a = topology.terminalToNet.get(electricalTerminalKey("r1", "a"))
    const b = topology.terminalToNet.get(electricalTerminalKey("r1", "b"))
    expect(a).toBeDefined()
    expect(b).toBe(a)
    expect(topology.terminals).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentId: "r1", pinName: "a", netId: a }),
      expect.objectContaining({ componentId: "r1", pinName: "b", netId: b }),
    ]))
  })

  test("keeps identical local coordinates isolated across surface boards", () => {
    const topology = compileElectricalTopology(
      {
        boardA: surface("boardA"),
        boardB: surface("boardB"),
        rA: resistor("rA", "boardA"),
        rB: resistor("rB", "boardB"),
      },
      {},
    )

    const a = topology.terminalToNet.get(electricalTerminalKey("rA", "a"))
    const b = topology.terminalToNet.get(electricalTerminalKey("rB", "a"))
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a).not.toBe(b)
  })
})
