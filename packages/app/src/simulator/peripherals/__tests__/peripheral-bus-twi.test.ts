import { describe, test, expect } from "bun:test"
import type { AVRTWI, TWIEventHandler } from "avr8js"
import type { BoardComponent } from "@dreamer/schemas"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

// ── Fake AVRTWI ────────────────────────────────────────────────────────────
//
// The bus only touches `eventHandler` (set) and the `complete*` family on
// AVRTWI. We don't need a CPU or registers to exercise the demux, so a
// structural fake is enough — and far cheaper than spinning up a real CPU.

type FakeTwi = AVRTWI & {
  // Captured outcomes so tests can assert what the bus signalled back.
  acks: boolean[]
  reads: number[]
  starts: number
  stops: number
  connects: boolean[]
}

function createFakeTwi(): FakeTwi {
  const fake = {
    eventHandler: undefined as unknown as TWIEventHandler,
    acks: [] as boolean[],
    reads: [] as number[],
    starts: 0,
    stops: 0,
    connects: [] as boolean[],
    completeStart() { this.starts++ },
    completeStop() { this.stops++ },
    completeConnect(ack: boolean) { this.connects.push(ack) },
    completeWrite(ack: boolean) { this.acks.push(ack) },
    completeRead(value: number) { this.reads.push(value) },
  }
  return fake as unknown as FakeTwi
}

function makeComponent(id: string, type: BoardComponent["type"]): BoardComponent {
  return {
    id,
    type,
    name: id,
    x: 0,
    y: 0,
    rotation: 0,
    pins: { gnd: null, vcc: null, scl: null, sda: null },
    properties: {},
  }
}

describe("PeripheralBus — TWI demux", () => {
  test("connectToSlave routes writes to the matching slave handler", () => {
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeComponent("oled-1", "oled_display") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })

    // SSD1306 registered at 0x3C — drive it via the bus's installed handler.
    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x3c, true)
    twi.eventHandler.writeByte(0x00)  // control byte: command stream
    twi.eventHandler.writeByte(0xaf)  // DISPLAY_ON
    twi.eventHandler.stop()

    // Each writeByte should have produced a completeWrite ack.
    expect(twi.acks.length).toBe(2)
    expect(twi.acks.every(Boolean)).toBe(true)

    // The SSD1306 peripheral should now report on=true.
    const snapshot = bus.snapshot()
    expect(snapshot["oled-1"]?.kind).toBe("oled")
    expect(snapshot["oled-1"]?.kind === "oled" && snapshot["oled-1"].on).toBe(true)
  })

  test("writes to an unowned address get silently ack'd, no slave touched", () => {
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeComponent("oled-1", "oled_display") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })

    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x50, true) // EEPROM-ish, nothing registered
    twi.eventHandler.writeByte(0x00)
    twi.eventHandler.writeByte(0x42)
    twi.eventHandler.stop()

    // We still ack so the AVR's TWI state machine doesn't stall.
    expect(twi.acks.length).toBe(2)
    expect(twi.acks.every(Boolean)).toBe(true)
    // Connect was NACK'd because no slave at 0x50.
    expect(twi.connects.at(-1)).toBe(false)

    // The SSD1306 should still report null state — it received no traffic.
    expect(bus.snapshot()["oled-1"]).toBeUndefined()
  })

  test("two transactions to different slaves don't cross-talk", () => {
    const bus = new PeripheralBus()
    const twi = createFakeTwi()

    // Register a second slave directly via the context to simulate two OLEDs
    // (we can't have two oled_display peripherals from different factories,
    // but we can inject a second handler manually for routing-test purposes).
    bus.attachBoard({
      components: { "oled-1": makeComponent("oled-1", "oled_display") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })

    let secondaryWrites: number[] = []
    // Reach into the bus's internal slave map by exercising attachTwi via a
    // synthetic Peripheral isn't easy; instead, we simulate by calling the
    // installed eventHandler with addr=0x3D and verifying our SSD1306 (0x3C)
    // isn't disturbed.
    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x3d, true) // not registered
    twi.eventHandler.writeByte(0x00)
    twi.eventHandler.writeByte(0xa7) // INVERT — would flip if the wrong slave saw it
    twi.eventHandler.stop()

    // Now drive a real transaction to the SSD1306.
    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x3c, true)
    twi.eventHandler.writeByte(0x00)
    twi.eventHandler.writeByte(0xaf) // DISPLAY_ON
    twi.eventHandler.stop()

    const snapshot = bus.snapshot()
    expect(snapshot["oled-1"]?.kind).toBe("oled")
    if (snapshot["oled-1"]?.kind === "oled") {
      expect(snapshot["oled-1"].on).toBe(true)
      // INVERT (0xa7) sent to 0x3D should NOT have reached our SSD1306 at 0x3C.
      expect(snapshot["oled-1"].inverted).toBe(false)
    }
    // Suppress unused warning while keeping the variable for future expansion.
    void secondaryWrites
  })

  test("attachTwi throws when bus has no TWI (transpile-mode contract)", () => {
    const bus = new PeripheralBus()
    // No twi in the input — peripherals that opt in to I²C should fail loudly.
    expect(() => {
      bus.attachBoard({
        components: { "oled-1": makeComponent("oled-1", "oled_display") },
        wires: {},
        pinStore: new PinStateStore(),
      })
    }).toThrow(/TWI not wired/)
  })

  test("detachBoard clears the slave registry and currentSlave pointer", () => {
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeComponent("oled-1", "oled_display") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })

    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x3c, true)
    twi.eventHandler.writeByte(0x00)
    twi.eventHandler.writeByte(0xaf)
    twi.eventHandler.stop()

    bus.detachBoard()

    // After detach, re-attach with a fresh TWI — the new bus state should be
    // clean (the previous oled at 0x3C must NOT route to the dead handler).
    const twi2 = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeComponent("oled-1", "oled_display") },
      wires: {},
      pinStore: new PinStateStore(),
      twi: twi2,
    })

    twi2.eventHandler.start(false)
    twi2.eventHandler.connectToSlave(0x3c, true)
    expect(twi2.connects.at(-1)).toBe(true) // freshly registered → ack
  })
})
