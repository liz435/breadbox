import { describe, expect, test } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { analyzeButtonWiring } from "../component-pin-resolver"

function makeButton(): BoardComponent {
  return {
    id: "btn-1",
    type: "button",
    name: "Button",
    x: 3,
    y: 10,
    rotation: 0,
    pins: { a: null, b: null },
    properties: {},
  }
}

function signalWire(id: string, pin: number, toRow: number, toCol: number): Wire {
  return {
    id,
    fromRow: -999,
    fromCol: pin,
    toRow,
    toCol,
    color: "#22c55e",
  }
}

describe("analyzeButtonWiring", () => {
  test("resolves one-sided signal + opposite ground reference", () => {
    const button = makeButton()
    const wires: Record<string, Wire> = {
      s: signalWire("s", 2, 10, 3),
      g: signalWire("g", -3, 11, 6),
    }

    const result = analyzeButtonWiring(button, wires)
    expect(result.inputPin).toBe(2)
    expect(result.hasGroundReference).toBe(true)
    expect(result.hasSignalOnBothSides).toBe(false)
  })

  test("detects missing opposite-side reference", () => {
    const button = makeButton()
    const wires: Record<string, Wire> = {
      s: signalWire("s", 2, 10, 3),
    }

    const result = analyzeButtonWiring(button, wires)
    expect(result.inputPin).toBe(2)
    expect(result.hasGroundReference).toBe(false)
    expect(result.hasPowerReference).toBe(false)
  })

  test("rejects both-side signal topology", () => {
    const button = makeButton()
    const wires: Record<string, Wire> = {
      s1: signalWire("s1", 2, 10, 3),
      s2: signalWire("s2", 4, 11, 6),
    }

    const result = analyzeButtonWiring(button, wires)
    expect(result.inputPin).toBeNull()
    expect(result.hasSignalOnBothSides).toBe(true)
  })
})
