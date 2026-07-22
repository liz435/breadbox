import { describe, expect, test } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { RelayPeripheral } from "../relay"

function relay(): RelayPeripheral {
  const component: BoardComponent = {
    id: "relay-1", type: "relay", name: "Relay", x: 3, y: 5, rotation: 0,
    pins: { out: 7, com: null, no: null, nc: null }, properties: {},
  }
  return new RelayPeripheral(component)
}

describe("RelayPeripheral", () => {
  test("delays contact pull-in and release after GPIO transitions", () => {
    const p = relay()
    p.onPinEdge({ pin: 7, value: 1, simMs: 10, source: "avr" })
    expect(p.getState()?.energized).toBe(false)
    expect(p.getState()?.pending).toBe(true)
    p.onTick(16)
    expect(p.getState()?.energized).toBe(false)
    p.onTick(17)
    expect(p.getState()?.energized).toBe(true)

    p.onPinEdge({ pin: 7, value: 0, simMs: 20, source: "avr" })
    p.onTick(22)
    expect(p.getState()?.energized).toBe(true)
    p.onTick(23)
    expect(p.getState()?.energized).toBe(false)
  })

  test("drops contacts immediately when solved coil power disappears", () => {
    const p = relay()
    p.onPinEdge({ pin: 7, value: 1, simMs: 0, source: "avr" })
    p.onTick(7)
    expect(p.getState()?.energized).toBe(true)
    p.setPowered(false)
    expect(p.getState()?.energized).toBe(false)
    expect(p.getState()?.pending).toBe(false)
  })
})
