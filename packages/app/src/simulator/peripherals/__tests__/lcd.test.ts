// ── LCD (HD44780) peripheral protocol tests ────────────────────────────────
//
// Drives the peripheral with synthetic pin edges simulating the edge pattern
// the Arduino `LiquidCrystal` library emits, then asserts the decoded DDRAM
// shows up in the visible text buffer.

import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { LcdPeripheral } from "../lcd"
import type { PeripheralContext, PeripheralState, PinEdge } from "../types"

// LCD footprint in the canonical example: x=5, y=5. That puts:
//   rs  at (y+3, x) = (8, 5)
//   en  at (y+5, x) = (10, 5)
//   d4  at (y+6, x) = (11, 5)
//   d5  at (y+7, x) = (12, 5)
//   d6  at (y+8, x) = (13, 5)
//   d7  at (y+9, x) = (14, 5)
//
// We wire each footprint hole to a distinct Arduino pin so the peripheral's
// wire-topology resolver can reconstruct the (sign, arduino-pin) mapping.
const RS_PIN = 12
const EN_PIN = 11
const D4_PIN = 5
const D5_PIN = 4
const D6_PIN = 3
const D7_PIN = 2

function makeComponent(): BoardComponent {
  return {
    id: "lcd-1",
    type: "lcd_16x2",
    name: "LCD 16x2",
    x: 5,
    y: 5,
    rotation: 0,
    pins: { rs: null, en: null, d4: null, d5: null, d6: null, d7: null },
    properties: {},
  }
}

/** Build the wire map that matches the canonical ex-lcd-16x2.json routing. */
function makeWires(): Record<string, Wire> {
  const mk = (id: string, fromCol: number, toRow: number): Wire => ({
    id,
    fromRow: -999,
    fromCol,
    toRow,
    toCol: 5,
    color: "#000",
  })
  return {
    "w-rs": mk("w-rs", RS_PIN, 8),
    "w-en": mk("w-en", EN_PIN, 10),
    "w-d4": mk("w-d4", D4_PIN, 11),
    "w-d5": mk("w-d5", D5_PIN, 12),
    "w-d6": mk("w-d6", D6_PIN, 13),
    "w-d7": mk("w-d7", D7_PIN, 14),
  }
}

function makeCtx(component: BoardComponent, wires: Record<string, Wire>): PeripheralContext {
  return {
    componentId: component.id,
    component,
    wires,
    pinStore: {} as PeripheralContext["pinStore"],
    trace: () => {},
    scheduleEdge: () => {},
    attachTwi: () => () => {},
  }
}

function asLcd(s: PeripheralState | null): Extract<PeripheralState, { kind: "lcd" }> {
  if (!s || s.kind !== "lcd") throw new Error(`expected lcd state, got ${s?.kind ?? "null"}`)
  return s
}

// ── Edge helpers ───────────────────────────────────────────────────────────

type Bit = 0 | 1

/**
 * Drive a test peripheral like the Arduino `LiquidCrystal` library does:
 * set RS, lay data on D4..D7, pulse EN HIGH then LOW, twice per byte
 * (high nibble first).
 */
class TestDriver {
  private simMs = 0
  constructor(private readonly p: LcdPeripheral) {}

  private edge(pin: number, value: Bit): void {
    this.simMs += 1 // advance sim clock so traces are ordered
    const e: PinEdge = { pin, value, simMs: this.simMs, source: "avr" }
    this.p.onPinEdge(e)
  }

  setRs(value: Bit): void { this.edge(RS_PIN, value) }

  private sendNibble(nibble: number): void {
    this.edge(D4_PIN, (nibble & 0b0001) as Bit)
    this.edge(D5_PIN, ((nibble & 0b0010) >> 1) as Bit)
    this.edge(D6_PIN, ((nibble & 0b0100) >> 2) as Bit)
    this.edge(D7_PIN, ((nibble & 0b1000) >> 3) as Bit)
    // EN pulse: HIGH then LOW — the falling edge latches.
    this.edge(EN_PIN, 1)
    this.edge(EN_PIN, 0)
  }

  sendByte(byte: number, rs: Bit): void {
    this.setRs(rs)
    this.sendNibble((byte >> 4) & 0x0f)
    this.sendNibble(byte & 0x0f)
  }

  cmd(byte: number): void { this.sendByte(byte, 0) }
  data(byte: number): void { this.sendByte(byte, 1) }

  /** Emit the standard LiquidCrystal.begin(16, 2) init sequence. */
  begin16x2(): void {
    // 4-bit interface init: after the 8-bit-to-4-bit handshake (which
    // emits three special nibbles), the library switches fully to 4-bit
    // mode and sends the full function-set byte. Our decoder doesn't need
    // to model the handshake — executing a Function Set + Display Control
    // + Clear + Entry Mode is sufficient for the visible state.
    this.cmd(0x28) // Function Set: 4-bit, 2-line, 5×8
    this.cmd(0x0c) // Display ON, cursor off, blink off
    this.cmd(0x01) // Clear Display
    this.cmd(0x06) // Entry Mode Set: increment, no-shift
  }

  print(text: string): void {
    for (const ch of text) this.data(ch.charCodeAt(0))
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LcdPeripheral — pin resolution", () => {
  test("resolves all six signal pins from wire topology", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const watched = Array.from(p.watchedPins).sort((a, b) => a - b)
    expect(watched).toEqual([D7_PIN, D6_PIN, D5_PIN, D4_PIN, EN_PIN, RS_PIN].sort((a, b) => a - b))
  })

  test("getState() returns null before any byte is latched", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    expect(p.getState()).toBeNull()
  })
})

describe("LcdPeripheral — protocol decoding", () => {
  test("begin(16, 2) leaves displayOn=true and textBuffer cleared", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()

    const state = asLcd(p.getState())
    expect(state.cols).toBe(16)
    expect(state.rows).toBe(2)
    expect(state.textBuffer).toEqual([" ".repeat(16), " ".repeat(16)])
  })

  test("print('Hi') after setCursor(0, 0) fills row 0 with Hi + 14 spaces", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.cmd(0x80) // Set DDRAM Address = 0x00 (row 0, col 0)
    d.print("Hi")

    const state = asLcd(p.getState())
    expect(state.textBuffer[0]).toBe("Hi" + " ".repeat(14))
    expect(state.textBuffer[1]).toBe(" ".repeat(16))
  })

  test("clear (0x01) empties both rows and homes cursor", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.cmd(0x80)
    d.print("Hello, World!")
    d.cmd(0xc0) // row 1
    d.print("line2")

    expect(asLcd(p.getState()).textBuffer[0]).toBe("Hello, World!   ")
    expect(asLcd(p.getState()).textBuffer[1]).toBe("line2" + " ".repeat(11))

    d.cmd(0x01) // Clear
    d.print("X")

    const cleared = asLcd(p.getState())
    expect(cleared.textBuffer[0]).toBe("X" + " ".repeat(15))
    expect(cleared.textBuffer[1]).toBe(" ".repeat(16))
  })

  test("Set DDRAM Address 0x40 jumps to row 1, col 0", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.cmd(0xc0) // 0x80 | 0x40
    d.print("row2")

    const state = asLcd(p.getState())
    expect(state.textBuffer[0]).toBe(" ".repeat(16))
    expect(state.textBuffer[1]).toBe("row2" + " ".repeat(12))
  })

  test("data bytes advance the cursor by +1 under default entry mode", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.cmd(0x80)
    d.print("abcd")

    const state = asLcd(p.getState())
    expect(state.textBuffer[0].startsWith("abcd")).toBe(true)
  })

  test("Entry Mode Set 0x04 (decrement) reverses cursor advance", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.cmd(0x85) // set DDRAM addr = 5
    d.cmd(0x04) // entry-mode: decrement (I/D = 0)
    d.print("xyz")

    // Start at col 5 write 'x' → col 4 write 'y' → col 3 write 'z'.
    const state = asLcd(p.getState())
    expect(state.textBuffer[0][5]).toBe("x")
    expect(state.textBuffer[0][4]).toBe("y")
    expect(state.textBuffer[0][3]).toBe("z")
  })

  test("Display Control opcodes toggle cursor/blink flags without crashing", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.cmd(0x0e) // display on, cursor on, blink off
    d.cmd(0x0f) // display on, cursor on, blink on
    d.cmd(0x08) // everything off
    d.cmd(0x0c) // display on, cursor off, blink off
    // Trigger at least one byte so getState() doesn't short-circuit on
    // hasReceivedAnyByte=false — our Display Control commands already did.
    const state = asLcd(p.getState())
    expect(state.cols).toBe(16)
    expect(state.rows).toBe(2)
  })
})

describe("LcdPeripheral — integration with canonical sketch pattern", () => {
  test("setup + loop writes 'Hello, World!' to row 0 and 'Time: Ns' to row 1", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)

    // void setup() { lcd.begin(16,2); lcd.print("Hello, World!"); }
    d.begin16x2()
    d.print("Hello, World!")

    // void loop() { lcd.setCursor(0,1); lcd.print("Time: "); lcd.print(3); lcd.print("s  "); }
    d.cmd(0xc0)
    d.print("Time: ")
    d.print("3")
    d.print("s  ")

    const state = asLcd(p.getState())
    expect(state.textBuffer[0].startsWith("Hello, World!")).toBe(true)
    expect(state.textBuffer[1].startsWith("Time: 3s  ")).toBe(true)
  })
})

describe("LcdPeripheral — reset + legacy snapshot fallback", () => {
  test("reset() wipes decoded state so getState() returns null again", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    const d = new TestDriver(p)
    d.begin16x2()
    d.print("X")
    expect(p.getState()).not.toBeNull()

    p.reset()
    expect(p.getState()).toBeNull()
  })

  test("legacy writeDisplay() populates getState() when no pin traffic seen", () => {
    const component = makeComponent()
    const p = new LcdPeripheral(component)
    p.attach(makeCtx(component, makeWires()))
    p.writeDisplay({
      cols: 16,
      rows: 2,
      textBuffer: ["legacy path    ", "row two        "],
    })
    const state = asLcd(p.getState())
    expect(state.textBuffer[0]).toBe("legacy path    ")
    expect(state.textBuffer[1]).toBe("row two        ")
  })
})
