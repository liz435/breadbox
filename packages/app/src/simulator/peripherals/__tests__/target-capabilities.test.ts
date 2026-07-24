import { describe, expect, it } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { BOARD_TARGETS } from "@dreamer/schemas"
import { PinStateStore } from "../../pin-state-store"
import { PeripheralBus } from "../peripheral-bus"

function oled(): BoardComponent {
  return {
    id: "oled-1",
    type: "oled_display",
    name: "oled-1",
    x: 0,
    y: 0,
    rotation: 0,
    pins: { gnd: null, vcc: null, scl: null, sda: null },
    properties: {},
  }
}

describe("target peripheral capabilities", () => {
  it("reports an explicit skip before attaching I²C peripherals on targets without I²C", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "oled-1": oled() },
      wires: {},
      pinStore: new PinStateStore(),
      targetCapabilities: BOARD_TARGETS.rpi_pico.simulationCapabilities,
    })

    expect(bus.attachSkips).toEqual([{
      componentId: "oled-1",
      componentType: "oled_display",
      reason: "selected target does not simulate I2C",
    }])
  })

  it("does not preempt I²C attachment on a target that declares I²C", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "oled-1": oled() },
      wires: {},
      pinStore: new PinStateStore(),
      targetCapabilities: BOARD_TARGETS.arduino_uno.simulationCapabilities,
    })

    // No TWI was supplied, so this reaches the factory and reports its
    // native missing-bridge reason instead of a false target-capability skip.
    expect(bus.attachSkips[0]?.reason).toContain("TWI not wired")
  })
})
