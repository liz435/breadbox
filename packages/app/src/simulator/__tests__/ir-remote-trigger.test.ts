import { describe, test, expect, beforeEach } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { environmentSchema } from "@dreamer/schemas"
import { applySensorInputs, resetSensorBuses } from "../sensor-inputs"
import { irRemoteStore } from "../ir-remote-store"
import { PeripheralBus } from "../peripherals/peripheral-bus"
import { PinStateStore } from "../pin-state-store"
import { IrReceiverPeripheral } from "../peripherals/ir-receiver"

const ENV = environmentSchema.parse({})

function makeIr(): BoardComponent {
  return {
    id: "ir-1",
    type: "ir_receiver",
    name: "IR Receiver",
    x: 5,
    y: 5,
    rotation: 0,
    pins: { signal: 2 },
    properties: {},
  }
}

function setup() {
  const store = new PinStateStore()
  const bus = new PeripheralBus()
  const components = { "ir-1": makeIr() }
  bus.attachBoard({ components, wires: {}, pinStore: store })
  const peripheral = bus.get("ir-1") as IrReceiverPeripheral
  return { store, bus, components, peripheral }
}

describe("virtual IR remote → receiver", () => {
  beforeEach(() => resetSensorBuses())

  test("a remote broadcast fires the receiver's sendCode exactly once", () => {
    const { store, bus, components, peripheral } = setup()
    const baseEdges = bus.scheduledEdgeCount

    // First pass only arms the per-receiver cursor — nothing transmitted yet.
    applySensorInputs(components, {}, store, ENV, bus)
    expect(bus.scheduledEdgeCount).toBe(baseEdges)
    expect(peripheral.getState()?.transmitting).toBe(false)

    // Press a remote button.
    irRemoteStore.broadcast(0x20df10ef)

    // Next pass drains the broadcast → a NEC frame is scheduled.
    applySensorInputs(components, {}, store, ENV, bus)
    expect(peripheral.getState()?.lastCode).toBe(0x20df10ef)
    expect(peripheral.getState()?.transmitting).toBe(true)
    expect(bus.scheduledEdgeCount).toBeGreaterThan(baseEdges)

    // Let the frame finish, then a pass with no new broadcast must NOT re-fire.
    peripheral.onTick(200)
    expect(peripheral.getState()?.transmitting).toBe(false)
    applySensorInputs(components, {}, store, ENV, bus)
    expect(peripheral.getState()?.transmitting).toBe(false)
  })

  test("a broadcast made before the first pass does not replay (arming)", () => {
    const { store, bus, components, peripheral } = setup()
    const baseEdges = bus.scheduledEdgeCount

    // Clicked while the sketch was stopped — broadcast lands before any tick.
    irRemoteStore.broadcast(0x12345678)

    applySensorInputs(components, {}, store, ENV, bus)
    expect(bus.scheduledEdgeCount).toBe(baseEdges)
    expect(peripheral.getState()?.transmitting).toBe(false)
  })
})
