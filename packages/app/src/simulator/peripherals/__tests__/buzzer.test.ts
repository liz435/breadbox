import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { BuzzerPeripheral } from "../buzzer"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

function makeBuzzer(componentX = 5, componentY = 5, signalPin: number | null = null): BoardComponent {
  return {
    id: "buzzer-1",
    type: "buzzer",
    name: "Buzzer",
    x: componentX,
    y: componentY,
    rotation: 0,
    pins: { positive: signalPin, negative: null },
    properties: {},
  }
}

function wireFrom(pin: number, toRow: number, toCol: number): Wire {
  return { id: `w${pin}`, fromRow: -999, fromCol: pin, toRow, toCol, color: "#fbbf24" }
}

describe("BuzzerPeripheral — explicit tone/noTone", () => {
  test("onExplicitTone sets playing + frequency", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    p.onExplicitTone(440, undefined, 0)
    const state = p.getState()
    expect(state?.playing).toBe(true)
    expect(state?.frequencyHz).toBe(440)
  })

  test("onExplicitNoTone clears playing + frequency", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    p.onExplicitTone(440)
    p.onExplicitNoTone(0)
    const state = p.getState()
    expect(state?.playing).toBe(false)
    expect(state?.frequencyHz).toBeNull()
  })

  test("tone with duration auto-stops on tick past duration", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    p.onExplicitTone(440, 100, 0)
    expect(p.getState()?.playing).toBe(true)
    p.onTick(50)
    expect(p.getState()?.playing).toBe(true)
    p.onTick(120)
    expect(p.getState()?.playing).toBe(false)
  })

  test("sub-audible frequency is rejected", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    p.onExplicitTone(10, undefined, 0) // below AUDIBLE_MIN_HZ
    expect(p.getState()?.playing).toBe(false)
  })
})

describe("BuzzerPeripheral — AVR edge detection", () => {
  function edge(pin: number, value: 0 | 1, simMs: number) {
    return { pin, value, simMs, source: "avr" as const }
  }

  test("2 kHz square wave fills ring and emits tone", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    // 2kHz = 0.25ms half-period. 16 edges over ~4ms fills the 8-entry ring.
    for (let i = 0; i < 16; i++) {
      p.onPinEdge(edge(8, (i % 2) as 0 | 1, i * 0.25))
    }
    const state = p.getState()
    expect(state?.playing).toBe(true)
    expect(state?.frequencyHz).toBeGreaterThanOrEqual(1800)
    expect(state?.frequencyHz).toBeLessThanOrEqual(2200)
  })

  test("shiftOut-style bursts (3 edges in 120µs) do NOT emit tone", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    // 3 edges over 120µs — looks like 16kHz for a split second, but fails the
    // full-ring requirement. Silence timeout then clears it.
    p.onPinEdge(edge(8, 1, 0))
    p.onPinEdge(edge(8, 0, 0.04))
    p.onPinEdge(edge(8, 1, 0.08))
    const state = p.getState()
    expect(state?.playing).toBe(false)
  })

  test("silence timeout stops playing after no edges for 150ms", () => {
    const p = new BuzzerPeripheral(makeBuzzer(5, 5, 8))
    for (let i = 0; i < 16; i++) p.onPinEdge(edge(8, (i % 2) as 0 | 1, i * 0.25))
    expect(p.getState()?.playing).toBe(true)
    p.onTick(300) // 300ms after last edge
    expect(p.getState()?.playing).toBe(false)
  })
})

describe("board-aware audio integration", () => {
  test("tone-range edges on a pin with NO buzzer wired produce no buzzer state", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: {
        "sr-1": {
          id: "sr-1",
          type: "shift_register",
          name: "74HC595",
          x: 5,
          y: 5,
          rotation: 0,
          pins: { data: null, clock: null, latch: null },
          properties: {},
        },
      },
      wires: {},
      pinStore: new PinStateStore(),
    })
    // Simulate a fast square wave on D8 — looks audible but no buzzer exists.
    for (let i = 0; i < 16; i++) {
      bus.dispatchEdge({ pin: 8, value: (i % 2) as 0 | 1, simMs: i * 0.25, source: "avr" })
    }
    // No buzzer peripheral on the board → nothing to report.
    expect(Object.keys(bus.snapshot())).toHaveLength(0)
  })

  test("same edges on a pin WITH a buzzer wired fire the buzzer peripheral", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "buzzer-1": makeBuzzer(5, 5) },
      wires: { w1: wireFrom(8, 5, 5) },
      pinStore: new PinStateStore(),
    })
    for (let i = 0; i < 16; i++) {
      bus.dispatchEdge({ pin: 8, value: (i % 2) as 0 | 1, simMs: i * 0.25, source: "avr" })
    }
    const snap = bus.snapshot()
    expect(snap["buzzer-1"]?.kind).toBe("buzzer")
    const buzzer = snap["buzzer-1"]?.kind === "buzzer" ? snap["buzzer-1"] : null
    expect(buzzer?.playing).toBe(true)
  })
})

describe("BuzzerPeripheral — active buzzer", () => {
  function makeActive(pin: number): BoardComponent {
    return {
      id: "buzzer-1",
      type: "buzzer",
      name: "Buzzer",
      x: 5,
      y: 5,
      rotation: 0,
      pins: { positive: pin, negative: null },
      properties: { buzzerType: "active" },
    }
  }

  test("steady digitalWrite HIGH sounds at the fixed internal pitch", () => {
    const p = new BuzzerPeripheral(makeActive(8))
    p.onPinEdge({ pin: 8, value: 1, simMs: 0, source: "avr" })
    const state = p.getState()
    expect(state?.playing).toBe(true)
    expect(state?.frequencyHz).toBe(2300)
    // Stays on with no further edges — an active buzzer needs no waveform.
    p.onTick(500)
    expect(p.getState()?.playing).toBe(true)
  })

  test("digitalWrite LOW stops it after the off-delay", () => {
    const p = new BuzzerPeripheral(makeActive(8))
    p.onPinEdge({ pin: 8, value: 1, simMs: 0, source: "avr" })
    p.onPinEdge({ pin: 8, value: 0, simMs: 10, source: "avr" })
    p.onTick(50)
    expect(p.getState()?.playing).toBe(false)
  })

  test("passive buzzer stays silent on a steady HIGH level", () => {
    const passive: BoardComponent = {
      ...makeActive(8),
      properties: {},
    }
    const p = new BuzzerPeripheral(passive)
    p.onPinEdge({ pin: 8, value: 1, simMs: 0, source: "avr" })
    p.onTick(500)
    expect(p.getState()?.playing).toBe(false)
  })
})
