import { describe, test, expect } from "bun:test"
import type { AVRTWI, TWIEventHandler } from "avr8js"
import type { BoardComponent } from "@dreamer/schemas"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

// Same fake TWI as in peripheral-bus-twi.test.ts. Duplicated rather than
// extracted because the dependency surface is tiny and tests should stay
// readable in isolation.
function createFakeTwi(): AVRTWI {
  const fake = {
    eventHandler: undefined as unknown as TWIEventHandler,
    completeStart() {},
    completeStop() {},
    completeConnect() {},
    completeWrite() {},
    completeRead() {},
  }
  return fake as unknown as AVRTWI
}

function makeOled(id: string): BoardComponent {
  return {
    id,
    type: "oled_display",
    name: id,
    x: 0,
    y: 0,
    rotation: 0,
    pins: { gnd: null, vcc: null, scl: null, sda: null },
    properties: {},
  }
}

function pushFrame(twi: AVRTWI, addr: number, controlByte: number, payload: number[]): void {
  twi.eventHandler.start(false)
  twi.eventHandler.connectToSlave(addr, true)
  twi.eventHandler.writeByte(controlByte)
  for (const b of payload) twi.eventHandler.writeByte(b)
  twi.eventHandler.stop()
}

describe("PeripheralBus snapshot — stability under JSON.stringify", () => {
  test("identical I²C frames produce identical JSON snapshots", () => {
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeOled("oled-1") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })

    // Init + a small data write.
    pushFrame(twi, 0x3c, 0x00, [0xaf])                  // DISPLAY_ON
    pushFrame(twi, 0x3c, 0x00, [0x21, 0, 127])           // COL_ADDR
    pushFrame(twi, 0x3c, 0x00, [0x22, 0, 7])             // PAGE_ADDR
    pushFrame(twi, 0x3c, 0x40, [0xaa, 0x55, 0xff, 0x00]) // 4 data bytes
    const snap1 = JSON.stringify(bus.snapshot())

    // Re-running the *same* sequence should produce the same JSON, because
    // the framebuffer ends up with the same bytes and the dirty-flag should
    // not cause spurious changes.
    pushFrame(twi, 0x3c, 0x00, [0x21, 0, 127])
    pushFrame(twi, 0x3c, 0x00, [0x22, 0, 7])
    pushFrame(twi, 0x3c, 0x40, [0xaa, 0x55, 0xff, 0x00])
    const snap2 = JSON.stringify(bus.snapshot())

    expect(snap2).toBe(snap1)
  })

  test("framebuffer serializes as a JSON array (not Uint8Array → '{}')", () => {
    // Regression guard: if the snapshot ever switches to Uint8Array, JSON
    // would silently emit `{}` and the simulation-loop change-detection at
    // line 217 would never fire. The library state would never sync.
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeOled("oled-1") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })

    pushFrame(twi, 0x3c, 0x00, [0xaf])
    pushFrame(twi, 0x3c, 0x40, [0x12, 0x34])

    const snap = bus.snapshot()
    const json = JSON.stringify(snap)
    // Must contain a real array literal — not the empty-object stringification
    // that Uint8Array produces.
    expect(json).toContain("[")
    expect(json).toContain("18,52") // 0x12, 0x34 in decimal
  })
})
