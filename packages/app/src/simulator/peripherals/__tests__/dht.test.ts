import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { DhtPeripheral } from "../dht"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

function makeDht(
  signalPin: number | null = null,
  variant: "dht11" | "dht22" = "dht11",
  temp = 22,
  humidity = 50,
): BoardComponent {
  return {
    id: "dht-1",
    type: "dht_sensor",
    name: "DHT11",
    x: 5,
    y: 5,
    rotation: 0,
    pins: { signal: signalPin },
    properties: { variant, temperature: temp, humidity },
  }
}

function wireFrom(pin: number, toRow: number, toCol: number): Wire {
  return { id: `w${pin}`, fromRow: -999, fromCol: pin, toRow, toCol, color: "#fbbf24" }
}

describe("DhtPeripheral — explicit reading", () => {
  test("setReading clamps humidity + temperature", () => {
    const p = new DhtPeripheral(makeDht(4))
    p.setReading(999, 999)
    expect(p.getState()?.temperatureC).toBe(80)
    expect(p.getState()?.humidity).toBe(100)
    p.setReading(-999, -999)
    expect(p.getState()?.temperatureC).toBe(-40)
    expect(p.getState()?.humidity).toBe(0)
    p.setReading(25, 60)
    expect(p.getState()?.temperatureC).toBe(25)
    expect(p.getState()?.humidity).toBe(60)
  })
})

describe("DhtPeripheral — AVR start signal detection", () => {
  test("LOW pulse ≥1ms then release schedules a full response frame", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "dht-1": makeDht(4, "dht11", 23, 55) },
      wires: {},
      pinStore: new PinStateStore(),
    })

    // MCU: pull LOW, wait 2ms, release to INPUT_PULLUP.
    bus.dispatchEdge({ pin: 4, value: 0, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 4, value: 1, simMs: 2.0, source: "avr" })

    // 2 presence edges + 40 bits × 2 edges + 2 frame-end edges = 2 + 80 + 2 = 84
    expect(bus.scheduledEdgeCount).toBe(84)
  })

  test("LOW pulse < 1ms is ignored", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "dht-1": makeDht(4) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    bus.dispatchEdge({ pin: 4, value: 0, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 4, value: 1, simMs: 0.5, source: "avr" })
    expect(bus.scheduledEdgeCount).toBe(0)
  })

  test("wire-resolved signal pin fires response on start signal", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "dht-1": makeDht() },
      wires: {
        "w-sig": wireFrom(4, 5, 5), // D4 → row y+0 (signal)
      },
      pinStore: new PinStateStore(),
    })
    bus.dispatchEdge({ pin: 4, value: 0, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 4, value: 1, simMs: 2.0, source: "avr" })
    expect(bus.scheduledEdgeCount).toBeGreaterThan(0)
  })
})

describe("DhtPeripheral — bit encoding", () => {
  test("DHT11 trace shows correct byte values + checksum", () => {
    // temp=30, humidity=65 → bytes [65, 0, 30, 0, 95]
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "dht-1": makeDht(4, "dht11", 30, 65) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    bus.dispatchEdge({ pin: 4, value: 0, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 4, value: 1, simMs: 2.0, source: "avr" })

    const p = bus.get("dht-1")
    expect(p).toBeDefined()
    const deriveTrace = p!.getTrace().find((t) => t.kind === "derive")
    expect(deriveTrace).toBeDefined()
    expect(deriveTrace!.detail?.byte0).toBe(65)  // humidity integer
    expect(deriveTrace!.detail?.byte1).toBe(0)
    expect(deriveTrace!.detail?.byte2).toBe(30)  // temperature integer
    expect(deriveTrace!.detail?.byte3).toBe(0)
    expect(deriveTrace!.detail?.checksum).toBe(95)
  })

  test("DHT22 encodes 16-bit humidity + signed temperature", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "dht-1": makeDht(4, "dht22", -12.5, 48.7) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    bus.dispatchEdge({ pin: 4, value: 0, simMs: 0, source: "avr" })
    bus.dispatchEdge({ pin: 4, value: 1, simMs: 2.0, source: "avr" })

    const p = bus.get("dht-1")
    const deriveTrace = p!.getTrace().find((t) => t.kind === "derive")
    // humidity 48.7 × 10 = 487 → 0x01E7 → hi=0x01, lo=0xE7
    expect(deriveTrace!.detail?.byte0).toBe(0x01)
    expect(deriveTrace!.detail?.byte1).toBe(0xE7)
    // temp -12.5 × 10 = 125 with sign bit → hi byte = 0x80 (sign) | 0x00 = 0x80
    expect(deriveTrace!.detail?.byte2).toBe(0x80)
    expect(deriveTrace!.detail?.byte3).toBe(125)
  })
})
