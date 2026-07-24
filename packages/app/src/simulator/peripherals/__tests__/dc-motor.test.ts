import { describe, expect, test } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { DcMotorPeripheral } from "../dc-motor"

const component: BoardComponent = {
  id: "motor-1", type: "dc_motor", name: "Motor", x: 2, y: 4, rotation: 0,
  pins: { signal: 9 }, properties: {},
}

describe("DcMotorPeripheral", () => {
  test("ramps rotor speed instead of changing it instantaneously", () => {
    const p = new DcMotorPeripheral(component)
    p.onTick(0)
    p.onPinEdge({ pin: 9, value: 1, simMs: 0, source: "avr" })
    p.onTick(60)
    expect(p.getState()?.speed).toBeGreaterThan(0)
    expect(p.getState()?.speed).toBeLessThan(1)
    p.onTick(600)
    expect(p.getState()?.speed).toBeGreaterThan(0.95)
  })

  // Losing supply removes torque, not momentum. Zeroing speed on the spot
  // would read as an instant mechanical stop, and — because the gate re-runs
  // every solved frame — would also flatten the rotor on every PWM low phase.
  test("power loss drops the drive request and lets the rotor coast down", () => {
    const p = new DcMotorPeripheral(component)
    p.onTick(0)
    p.onPinEdge({ pin: 9, value: 1, simMs: 0, source: "avr" })
    p.onTick(300)
    const spinning = p.getState()?.speed ?? 0
    expect(p.getState()?.moving).toBe(true)

    p.setPowered(false)
    p.onTick(310)
    const coasting = p.getState()?.speed ?? 0
    expect(coasting).toBeLessThan(spinning)
    expect(coasting).toBeGreaterThan(0)

    p.onTick(900)
    expect(p.getState()?.moving).toBe(false)
  })

  test("an unpowered motor ignores a drive command", () => {
    const p = new DcMotorPeripheral(component)
    p.onTick(0)
    p.setPowered(false)
    p.onPinEdge({ pin: 9, value: 1, simMs: 0, source: "avr" })
    p.onTick(600)
    expect(p.getState()?.speed).toBe(0)
  })
})
