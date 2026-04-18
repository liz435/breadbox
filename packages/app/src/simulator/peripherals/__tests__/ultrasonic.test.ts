import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { UltrasonicPeripheral } from "../ultrasonic"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

function makeSensor(
  trigPin: number | null = null,
  echoPin: number | null = null,
): BoardComponent {
  return {
    id: "us-1",
    type: "ultrasonic_sensor",
    name: "HC-SR04",
    x: 7,
    y: 5,
    rotation: 0,
    pins: {
      trigger: trigPin,
      echo: echoPin,
      vcc: null,
      gnd: null,
    },
    properties: {},
  }
}

function wireFrom(pin: number, toRow: number, toCol: number): Wire {
  return { id: `w${pin}`, fromRow: -999, fromCol: pin, toRow, toCol, color: "#fbbf24" }
}

describe("UltrasonicPeripheral — explicit pins", () => {
  test("setDistance clamps to [2, 400]", () => {
    const p = new UltrasonicPeripheral(makeSensor(7, 8))
    p.setDistance(1)
    expect(p.getState()?.distanceCm).toBe(2)
    p.setDistance(500)
    expect(p.getState()?.distanceCm).toBe(400)
    p.setDistance(42)
    expect(p.getState()?.distanceCm).toBe(42)
  })

  test("trig pulse below 8µs is ignored — no scheduleEdge", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "us-1": makeSensor(7, 8) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    // 5µs HIGH pulse — below HC-SR04 threshold.
    bus.dispatchEdge({ pin: 7, value: 1, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 7, value: 0, simMs: 0.005, source: "avr" })
    expect(bus.scheduledEdgeCount).toBe(0)
  })

  test("valid 10µs trig pulse schedules two echo edges", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "us-1": makeSensor(7, 8) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    const p = bus.get("us-1") as UltrasonicPeripheral
    p.setDistance(20)

    bus.dispatchEdge({ pin: 7, value: 1, simMs: 1.0, source: "avr" })
    bus.dispatchEdge({ pin: 7, value: 0, simMs: 1.01, source: "avr" }) // 10µs HIGH
    expect(bus.scheduledEdgeCount).toBe(2)
  })
})

describe("UltrasonicPeripheral — wire-resolved pins", () => {
  test("resolves trig + echo from wire topology", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "us-1": makeSensor() },
      wires: {
        "w-trig": wireFrom(7, 5, 7), // D7 → row y+0 (trig)
        "w-echo": wireFrom(8, 6, 7), // D8 → row y+1 (echo)
      },
      pinStore: new PinStateStore(),
    })
    const state = bus.get("us-1")?.getState()
    expect(state?.kind).toBe("ultrasonic")
    const us = state?.kind === "ultrasonic" ? state : null
    expect(us?.trigPin).toBe(7)
    expect(us?.echoPin).toBe(8)
  })

  test("dispatching trig pulse on resolved pin schedules echo", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "us-1": makeSensor() },
      wires: {
        "w-trig": wireFrom(7, 5, 7),
        "w-echo": wireFrom(8, 6, 7),
      },
      pinStore: new PinStateStore(),
    })
    const p = bus.get("us-1") as UltrasonicPeripheral
    p.setDistance(50)

    bus.dispatchEdge({ pin: 7, value: 1, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 7, value: 0, simMs: 0.01, source: "avr" })
    // distance 50 cm → echo pulse 50 × 58 = 2900µs = 2.9ms
    expect(bus.scheduledEdgeCount).toBe(2)
  })
})

describe("UltrasonicPeripheral — scheduler flush", () => {
  test("flushScheduledEdges writes to pinStore at the right time", () => {
    const store = new PinStateStore()
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "us-1": makeSensor(7, 8) },
      wires: {},
      pinStore: store,
    })
    const p = bus.get("us-1") as UltrasonicPeripheral
    p.setDistance(20) // 20 × 58 = 1160µs = 1.16ms pulse

    bus.dispatchEdge({ pin: 7, value: 1, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 7, value: 0, simMs: 0.01, source: "avr" })

    // Echo starts at trig-fall + 500µs = 0.51ms, ends at 0.51 + 1.16 = 1.67ms.
    // Advance sim clock past echo start — should fire echo HIGH.
    bus.flushScheduledEdges(0.6)
    expect(store.readDigital(8)).toBe(1)
    expect(bus.scheduledEdgeCount).toBe(1)

    // Advance past echo end — fire echo LOW.
    bus.flushScheduledEdges(2.0)
    expect(store.readDigital(8)).toBe(0)
    expect(bus.scheduledEdgeCount).toBe(0)
  })

  test("echo pulse width matches expected distance formula", () => {
    const store = new PinStateStore()
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "us-1": makeSensor(7, 8) },
      wires: {},
      pinStore: store,
    })
    ;(bus.get("us-1") as UltrasonicPeripheral).setDistance(100) // 5800µs

    bus.dispatchEdge({ pin: 7, value: 1, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 7, value: 0, simMs: 0.01, source: "avr" })

    let highAtMs = 0
    let lowAtMs = 0

    // Step through time and record the HIGH/LOW transition timestamps.
    for (let t = 0; t <= 10; t += 0.01) {
      const before = store.readDigital(8)
      bus.flushScheduledEdges(t)
      const after = store.readDigital(8)
      if (before === 0 && after === 1) highAtMs = t
      if (before === 1 && after === 0) lowAtMs = t
    }

    const pulseMs = lowAtMs - highAtMs
    // Expected: distance × 58 µs = 100 × 58 = 5800 µs = 5.8 ms
    expect(pulseMs).toBeGreaterThan(5.7)
    expect(pulseMs).toBeLessThan(5.9)
  })
})
