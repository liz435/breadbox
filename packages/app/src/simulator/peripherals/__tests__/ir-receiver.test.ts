import { describe, test, expect } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { IrReceiverPeripheral } from "../ir-receiver"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

function makeIr(signalPin: number | null = null): BoardComponent {
  return {
    id: "ir-1",
    type: "ir_receiver",
    name: "IR Receiver",
    x: 5,
    y: 5,
    rotation: 0,
    pins: { signal: signalPin },
    properties: {},
  }
}

describe("IrReceiverPeripheral — NEC envelope", () => {
  test("sendCode schedules leader + 32 bits + trailer", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "ir-1": makeIr(2) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    const p = bus.get("ir-1") as IrReceiverPeripheral
    // attach schedules one initial HIGH edge (idle).
    expect(bus.scheduledEdgeCount).toBe(1)

    p.sendCode(0x20DF10EF)
    // leader (2) + 32 bits × 2 + trailer (2) = 2 + 64 + 2 = 68 additional.
    expect(bus.scheduledEdgeCount).toBe(1 + 68)

    const state = p.getState()
    expect(state?.transmitting).toBe(true)
    expect(state?.lastCode).toBe(0x20DF10EF)
  })

  test("second sendCode while transmitting is dropped", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "ir-1": makeIr(2) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    const p = bus.get("ir-1") as IrReceiverPeripheral
    p.sendCode(0xAAAAAAAA)
    const countAfterFirst = bus.scheduledEdgeCount
    p.sendCode(0xBBBBBBBB)
    expect(bus.scheduledEdgeCount).toBe(countAfterFirst)
  })

  test("code with all-1 bits produces HIGH pulses ~1.69ms each", () => {
    const store = new PinStateStore()
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "ir-1": makeIr(2) },
      wires: {},
      pinStore: store,
    })
    const p = bus.get("ir-1") as IrReceiverPeripheral
    p.sendCode(0xFFFFFFFF)

    // Advance clock past leader (9 + 4.5 = 13.5 ms) to the start of bit 0.
    // Sample a window and count rising + falling edges within the 32 bit
    // positions. Just verify the total frame duration is roughly:
    //   9 + 4.5 + 32 × (0.56 + 1.69) + 0.56 = ~85.6 ms
    const deadline = 100
    let lastTransition = 0
    let prev = store.readDigital(2)
    for (let t = 0; t <= deadline; t += 0.05) {
      bus.flushScheduledEdges(t)
      const cur = store.readDigital(2)
      if (cur !== prev) {
        lastTransition = t
        prev = cur
      }
    }
    // Last transition should land near the end of the frame.
    expect(lastTransition).toBeGreaterThan(80)
    expect(lastTransition).toBeLessThan(95)
  })

  test("anchors the frame at the current sim time (no mid-run collapse)", () => {
    const store = new PinStateStore()
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "ir-1": makeIr(2) },
      wires: {},
      pinStore: store,
    })
    const p = bus.get("ir-1") as IrReceiverPeripheral

    // Advance the clock well past zero (as in a real run) — this also fires
    // the idle-HIGH seed edge and records nowSimMs on the bus.
    bus.flushScheduledEdges(5000)
    expect(bus.scheduledEdgeCount).toBe(0)

    p.sendCode(0x20df10ef)
    const total = bus.scheduledEdgeCount // 68 frame edges
    expect(total).toBe(68)

    // A flush at the current instant must NOT drain the whole frame. Only the
    // leader edge sitting exactly at nowSimMs fires; the rest stay in the
    // future. (The pre-fix bug anchored at 0, so every edge was ≤ 5000 and the
    // entire 68-edge envelope collapsed into this single flush.)
    bus.flushScheduledEdges(5000)
    expect(bus.scheduledEdgeCount).toBe(total - 1)

    // The frame only fully drains once the clock passes its ~68 ms envelope.
    bus.flushScheduledEdges(5100)
    expect(bus.scheduledEdgeCount).toBe(0)
  })

  test("on-tick clears transmitting flag after frame ends", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "ir-1": makeIr(2) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    const p = bus.get("ir-1") as IrReceiverPeripheral
    p.sendCode(0x00000000) // shortest bits (0s → 560µs HIGH each)
    expect(p.getState()?.transmitting).toBe(true)
    p.onTick(200) // well past frame duration
    expect(p.getState()?.transmitting).toBe(false)
  })
})
