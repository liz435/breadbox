import { describe, test, expect, beforeEach } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { pinHasCapability, resetCapabilityCache } from "../capability-query"

function buzzerOn(pin: number): BoardComponent {
  return {
    id: "buzzer-1",
    type: "buzzer",
    name: "Buzzer",
    x: 5,
    y: 5,
    rotation: 0,
    pins: { positive: null, negative: null },
    properties: {},
  }
}

function shiftRegOn(): BoardComponent {
  return {
    id: "sr-1",
    type: "shift_register",
    name: "74HC595",
    x: 5,
    y: 5,
    rotation: 0,
    pins: { data: null, clock: null, latch: null },
    properties: {},
  }
}

function wireFromPin(pin: number, toRow: number, toCol: number): Wire {
  return {
    id: `wire-d${pin}`,
    fromRow: -999,
    fromCol: pin,
    toRow,
    toCol,
    color: "#fbbf24",
  }
}

describe("pinHasCapability", () => {
  beforeEach(() => resetCapabilityCache())

  test("buzzer wired to D8 makes pinHasCapability(8, soundSource) true", () => {
    const components = { "buzzer-1": buzzerOn(8) }
    const wires = { "w1": wireFromPin(8, 5, 5) }
    expect(pinHasCapability(8, "soundSource", components, wires)).toBe(true)
  })

  test("shift register on D8 does not mark D8 as soundSource", () => {
    const components = { "sr-1": shiftRegOn() }
    const wires = { "w1": wireFromPin(8, 5, 5) }
    expect(pinHasCapability(8, "soundSource", components, wires)).toBe(false)
  })

  test("unwired pin returns false", () => {
    expect(pinHasCapability(12, "soundSource", {}, {})).toBe(false)
  })

  test("cache invalidates on components/wires identity change", () => {
    const comps1 = { "sr-1": shiftRegOn() }
    const wires1 = { "w1": wireFromPin(8, 5, 5) }
    expect(pinHasCapability(8, "soundSource", comps1, wires1)).toBe(false)

    // Swap in a buzzer-containing board — new identity, cache must refresh.
    const comps2 = { "buzzer-1": buzzerOn(8) }
    const wires2 = { "w1": wireFromPin(8, 5, 5) }
    expect(pinHasCapability(8, "soundSource", comps2, wires2)).toBe(true)
  })
})
