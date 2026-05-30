import { describe, test, expect } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { ShiftRegisterPeripheral } from "../shift-register"
import { PinStateStore } from "../../pin-state-store"
import type { PeripheralContext } from "../types"

const DATA = 8
const CLOCK = 11
const LATCH = 12

function makeChip(): BoardComponent {
  return {
    id: "sr-1",
    type: "shift_register",
    name: "74HC595",
    x: 2,
    y: 1,
    rotation: 0,
    // Explicit pins so the peripheral binds without wire resolution.
    pins: { data: DATA, clock: CLOCK, latch: LATCH },
    properties: {},
  }
}

function makeCtx(store: PinStateStore, component: BoardComponent): PeripheralContext {
  return {
    componentId: component.id,
    component,
    wires: {},
    pinStore: store,
    trace: () => {},
    scheduleEdge: () => {},
    attachTwi: () => () => {},
  }
}

/**
 * Drive the peripheral exactly like Arduino's shiftOut(MSBFIRST, byte): the MSB
 * is clocked in first. The DS level is set in the pin store before each rising
 * clock edge, mirroring how the chip samples the line.
 */
function shiftOutMsbFirst(
  p: ShiftRegisterPeripheral,
  store: PinStateStore,
  byte: number,
): void {
  for (let bitIndex = 7; bitIndex >= 0; bitIndex--) {
    const bit = ((byte >> bitIndex) & 1) as 0 | 1
    store.writeFromSketch(DATA, { mode: "OUTPUT", digitalValue: bit })
    p.onPinEdge({ pin: CLOCK, value: 1, simMs: 0, source: "avr" })
    p.onPinEdge({ pin: CLOCK, value: 0, simMs: 0, source: "avr" })
  }
}

function latch(p: ShiftRegisterPeripheral): void {
  p.onPinEdge({ pin: LATCH, value: 1, simMs: 0, source: "avr" })
  p.onPinEdge({ pin: LATCH, value: 0, simMs: 0, source: "avr" })
}

function outputsFor(byte: number): boolean[] {
  return Array.from({ length: 8 }, (_, i) => ((byte >> i) & 1) === 1)
}

describe("ShiftRegisterPeripheral — shiftOut decode", () => {
  test("watches data/clock/latch pins", () => {
    const p = new ShiftRegisterPeripheral(makeChip())
    expect(p.watchedPins.has(DATA)).toBe(true)
    expect(p.watchedPins.has(CLOCK)).toBe(true)
    expect(p.watchedPins.has(LATCH)).toBe(true)
  })

  test("MSBFIRST: Qi bit maps to byte bit i (chaser bytes)", () => {
    for (let i = 0; i < 8; i++) {
      const store = new PinStateStore()
      const p = new ShiftRegisterPeripheral(makeChip())
      p.attach(makeCtx(store, makeChip()))
      shiftOutMsbFirst(p, store, 1 << i)
      latch(p)
      expect(p.getState()?.outputs).toEqual(outputsFor(1 << i))
    }
  })

  test("arbitrary byte 0b10101010 latches Q1/Q3/Q5/Q7", () => {
    const store = new PinStateStore()
    const p = new ShiftRegisterPeripheral(makeChip())
    p.attach(makeCtx(store, makeChip()))
    shiftOutMsbFirst(p, store, 0b10101010)
    latch(p)
    expect(p.getState()?.outputs).toEqual(outputsFor(0b10101010))
  })

  test("outputs only update on the latch rising edge", () => {
    const store = new PinStateStore()
    const p = new ShiftRegisterPeripheral(makeChip())
    p.attach(makeCtx(store, makeChip()))
    shiftOutMsbFirst(p, store, 0xff)
    // No latch yet → storage register still all-low.
    expect(p.getState()?.outputs).toEqual(outputsFor(0))
    latch(p)
    expect(p.getState()?.outputs).toEqual(outputsFor(0xff))
  })

  test("reset clears shift + storage registers", () => {
    const store = new PinStateStore()
    const p = new ShiftRegisterPeripheral(makeChip())
    p.attach(makeCtx(store, makeChip()))
    shiftOutMsbFirst(p, store, 0xff)
    latch(p)
    expect(p.getState()?.outputs).toEqual(outputsFor(0xff))
    p.reset()
    expect(p.getState()?.outputs).toEqual(outputsFor(0))
  })
})
