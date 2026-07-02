import { describe, test, expect } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { Ssd1306Peripheral } from "../ssd1306-oled"
import type { PeripheralContext, PeripheralState, TwiSlaveHandler } from "../types"

function makeComponent(): BoardComponent {
  return {
    id: "oled-1",
    type: "oled_display",
    name: "SSD1306",
    x: 0,
    y: 0,
    rotation: 0,
    pins: { gnd: null, vcc: null, scl: null, sda: null },
    properties: {},
  }
}

/**
 * Build a peripheral context that captures the TWI slave handler the
 * SSD1306 registers, so tests can drive it directly.
 */
function makeCtx(): { ctx: PeripheralContext; getHandler: () => TwiSlaveHandler } {
  let captured: TwiSlaveHandler | null = null
  const ctx: PeripheralContext = {
    componentId: "oled-1",
    component: makeComponent(),
    wires: {},
    pinStore: {} as PeripheralContext["pinStore"],
    trace: () => {},
    scheduleEdge: () => {},
    nowSimMs: () => 0,
    attachTwi: (_addr, handler) => {
      captured = handler
      return () => { captured = null }
    },
  }
  return {
    ctx,
    getHandler: () => {
      if (!captured) throw new Error("SSD1306 did not register TWI handler on attach")
      return captured
    },
  }
}

/** Send a command transaction: START → addr → 0x00 control → opcode + params → STOP. */
function sendCommands(handler: TwiSlaveHandler, bytes: number[]): void {
  handler.onWrite(0x00) // control byte: command stream
  for (const b of bytes) handler.onWrite(b)
  handler.onStop()
}

/** Send a data transaction: START → addr → 0x40 control → data bytes → STOP. */
function sendData(handler: TwiSlaveHandler, bytes: number[]): void {
  handler.onWrite(0x40) // control byte: data stream
  for (const b of bytes) handler.onWrite(b)
  handler.onStop()
}

/** Adafruit_SSD1306 v2.5.x init sequence (canonical for 128×64). */
const ADAFRUIT_INIT_SEQUENCE = [
  0xae,             // DISPLAY_OFF
  0xd5, 0x80,       // CLOCK_DIV
  0xa8, 0x3f,       // MULTIPLEX_RATIO 63
  0xd3, 0x00,       // DISPLAY_OFFSET 0
  0x40,             // START_LINE 0
  0x8d, 0x14,       // CHARGE_PUMP enable
  0x20, 0x00,       // ADDR_MODE horizontal
  0xa1,             // SEGMENT_REMAP
  0xc8,             // COM_OUTPUT_SCAN_DESC
  0xda, 0x12,       // COM_PINS_CONFIG
  0x81, 0xcf,       // CONTRAST
  0xd9, 0xf1,       // PRECHARGE_PERIOD
  0xdb, 0x40,       // VCOMH_DESELECT
  0xa4,             // DISPLAY_ALL_ON_RESUME
  0xa6,             // NORMAL_DISPLAY
  0x2e,             // DEACTIVATE_SCROLL
  0xaf,             // DISPLAY_ON
]

function asOled(s: PeripheralState | null): Extract<PeripheralState, { kind: "oled" }> {
  if (!s || s.kind !== "oled") throw new Error(`expected oled state, got ${s?.kind ?? "null"}`)
  return s
}

describe("Ssd1306Peripheral — protocol parsing", () => {
  test("getState returns null before any I²C traffic", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx } = makeCtx()
    p.attach(ctx)
    expect(p.getState()).toBeNull()
  })

  test("Adafruit init sequence ends with displayOn=true", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), ADAFRUIT_INIT_SEQUENCE)
    const state = asOled(p.getState())
    expect(state.on).toBe(true)
    expect(state.inverted).toBe(false)
  })

  test("DISPLAY_OFF (0xAE) toggles displayOn back to false", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), [0xaf]) // ON
    expect(asOled(p.getState()).on).toBe(true)
    sendCommands(getHandler(), [0xae]) // OFF
    expect(asOled(p.getState()).on).toBe(false)
  })

  test("INVERT_DISPLAY (0xA7) flips inverted; NORMAL (0xA6) restores", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), [0xaf, 0xa7])
    expect(asOled(p.getState()).inverted).toBe(true)
    sendCommands(getHandler(), [0xa6])
    expect(asOled(p.getState()).inverted).toBe(false)
  })

  test("data write at (0,0) lands in framebuffer[0]", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    // Set addressing range to full panel and reset pointers.
    sendCommands(getHandler(), [0x21, 0, 127]) // COL_ADDR
    sendCommands(getHandler(), [0x22, 0, 7])   // PAGE_ADDR
    sendCommands(getHandler(), [0xaf])          // DISPLAY_ON
    sendData(getHandler(), [0xff, 0x81, 0x00])  // 3 bytes at start
    const state = asOled(p.getState())
    expect(state.framebuffer[0]).toBe(0xff)
    expect(state.framebuffer[1]).toBe(0x81)
    expect(state.framebuffer[2]).toBe(0x00)
  })

  test("col auto-increment wraps to next page at colEnd", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), [0x21, 126, 127]) // COL_ADDR 126..127
    sendCommands(getHandler(), [0x22, 0, 1])     // PAGE_ADDR 0..1
    sendCommands(getHandler(), [0xaf])
    // Write 4 bytes: (126,0)=0xa, (127,0)=0xb, then wrap to (126,1)=0xc, (127,1)=0xd
    sendData(getHandler(), [0x0a, 0x0b, 0x0c, 0x0d])
    const fb = asOled(p.getState()).framebuffer
    expect(fb[0 * 128 + 126]).toBe(0x0a)
    expect(fb[0 * 128 + 127]).toBe(0x0b)
    expect(fb[1 * 128 + 126]).toBe(0x0c)
    expect(fb[1 * 128 + 127]).toBe(0x0d)
  })

  test("col/page pointer persists across STOP/START (no reset on STOP)", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), [0x21, 0, 127])
    sendCommands(getHandler(), [0x22, 0, 7])
    sendCommands(getHandler(), [0xaf])
    // First chunk: 3 bytes → pointer is now at col=3, page=0
    sendData(getHandler(), [0x11, 0x22, 0x33])
    // Second chunk (separate transaction): should continue from col=3
    sendData(getHandler(), [0x44, 0x55])
    const fb = asOled(p.getState()).framebuffer
    expect(fb[0]).toBe(0x11)
    expect(fb[1]).toBe(0x22)
    expect(fb[2]).toBe(0x33)
    expect(fb[3]).toBe(0x44)
    expect(fb[4]).toBe(0x55)
  })

  test("Adafruit display() flush of 1024 bytes fills the framebuffer", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), ADAFRUIT_INIT_SEQUENCE)
    // Adafruit's display() prefix:
    sendCommands(getHandler(), [0x22, 0, 0xff]) // PAGE_ADDR (clamped to 0..7)
    sendCommands(getHandler(), [0x21, 0, 127])  // COL_ADDR

    // Generate a recognisable pattern.
    const expected = new Array<number>(1024).fill(0).map((_, i) => i & 0xff)
    // Wire's 32-byte buffer means up to 31 data bytes per transaction.
    for (let off = 0; off < expected.length; off += 31) {
      sendData(getHandler(), expected.slice(off, off + 31))
    }
    const fb = asOled(p.getState()).framebuffer
    for (let i = 0; i < 1024; i++) {
      expect(fb[i]).toBe(expected[i])
    }
  })

  test("snapshot reference is reused when framebuffer unchanged", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), [0xaf])
    sendData(getHandler(), [0xa5])
    const fb1 = asOled(p.getState()).framebuffer
    // Same value rewritten — peripheral skips dirty marking, snapshot ref stays.
    sendData(getHandler(), [0xa5])
    const fb2 = asOled(p.getState()).framebuffer
    expect(fb2).toBe(fb1) // strict reference equality
  })

  test("snapshot reference is stable identity even when bytes change", () => {
    // The view array is reused in place — the reference doesn't change between
    // dirty cycles, only the contents. (React useEffect dep on framebuffer
    // reference would NOT fire here; but useEffect dep on `state.on` toggle
    // and other primitives covers the transition cases. Document the contract.)
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    sendCommands(getHandler(), [0xaf])
    sendData(getHandler(), [0x01])
    const fbA = asOled(p.getState()).framebuffer
    sendData(getHandler(), [0x02])
    const fbB = asOled(p.getState()).framebuffer
    expect(fbB).toBe(fbA)
    expect(fbB[1]).toBe(0x02)
  })
})

describe("Ssd1306Peripheral — addressing modes", () => {
  test("page mode: 0xB0/col-nibble commands position writes, col wraps in page", () => {
    const p = new Ssd1306Peripheral(makeComponent())
    const { ctx, getHandler } = makeCtx()
    p.attach(ctx)
    const h = getHandler()

    sendCommands(h, [0xaf]) // display on
    sendCommands(h, [0x20, 0x02]) // page addressing mode
    sendCommands(h, [0xb3, 0x05, 0x10]) // page 3, column 5 (low=5, high=0)
    sendData(h, [0xff, 0x81])

    const s = p.getState()
    if (s?.kind !== "oled") throw new Error("expected oled state")
    expect(s.framebuffer[3 * 128 + 5]).toBe(0xff)
    expect(s.framebuffer[3 * 128 + 6]).toBe(0x81)
    // Page never advances in page mode: fill past the row end and check page 4 untouched.
    sendCommands(h, [0xb3, 0x0f, 0x17]) // page 3, column 127
    sendData(h, [0x55, 0x66]) // second byte wraps to column 0 of the SAME page
    const s2 = p.getState()
    if (s2?.kind !== "oled") throw new Error("expected oled state")
    expect(s2.framebuffer[3 * 128 + 127]).toBe(0x55)
    expect(s2.framebuffer[3 * 128 + 0]).toBe(0x66)
    expect(s2.framebuffer[4 * 128 + 0]).toBe(0)
  })

  test("i2cAddress property registers the slave at 0x3D", () => {
    const component = { ...makeComponent(), properties: { i2cAddress: 0x3d } }
    const registeredAddrs: number[] = []
    const ctx: PeripheralContext = {
      componentId: "oled-1",
      component,
      wires: {},
      pinStore: {} as PeripheralContext["pinStore"],
      trace: () => {},
      scheduleEdge: () => {},
      nowSimMs: () => 0,
      attachTwi: (addr, _handler) => {
        registeredAddrs.push(addr)
        return () => {}
      },
    }
    const p = new Ssd1306Peripheral(component)
    p.attach(ctx)
    expect(registeredAddrs).toEqual([0x3d])
  })
})
