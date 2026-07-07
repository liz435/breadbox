// ── Strict hardware mode tests (ROADMAP Phase D) ───────────────────────────

import { describe, test, expect, afterEach } from "bun:test"
import type { AVRTWI, TWIEventHandler } from "avr8js"
import type { BoardComponent } from "@dreamer/schemas"
import { PeripheralBus } from "../peripherals/peripheral-bus"
import { LcdPeripheral } from "../peripherals/lcd"
import { PinStateStore } from "../pin-state-store"
import { writeWithContactBounce } from "../contact-bounce"
import { setStrictHardwareEnabled } from "../strict-hardware-flag"

afterEach(() => setStrictHardwareEnabled(null))

// ── Contact bounce ─────────────────────────────────────────────────────────

describe("contact bounce", () => {
  test("a press produces a chatter burst that settles at the final value", () => {
    const bus = new PeripheralBus()
    const store = new PinStateStore()
    bus.attachBoard({ components: {}, wires: {}, pinStore: store })

    const transitions: Array<{ value: 0 | 1; atMs: number }> = []
    writeWithContactBounce(2, 0, {
      bus,
      nowSimMs: 10,
      writeNow: (pin, value) => {
        expect(pin).toBe(2)
        transitions.push({ value, atMs: 10 })
      },
    })

    // The leading edge landed immediately; the chatter is queued in sim time.
    expect(transitions).toEqual([{ value: 0, atMs: 10 }])
    expect(bus.scheduledEdgeCount).toBeGreaterThanOrEqual(6)

    // Flush past the settle point: the pin store must end at the final value
    // after an even number of away/back flips.
    bus.flushScheduledEdges(12)
    expect(bus.scheduledEdgeCount).toBe(0)
    expect(store.readDigital(2)).toBe(0)
  })

  test("bounce edges interleave in time order (visible to a fast poller)", () => {
    const bus = new PeripheralBus()
    const store = new PinStateStore()
    bus.attachBoard({ components: {}, wires: {}, pinStore: store })

    const seen: Array<0 | 1> = []
    const originalWrite = store.writeExternal.bind(store)
    store.writeExternal = (pin, changes) => {
      if (changes.digitalValue !== undefined) seen.push(changes.digitalValue)
      originalWrite(pin, changes)
    }

    writeWithContactBounce(2, 1, {
      bus,
      nowSimMs: 0,
      writeNow: (pin, value) => originalWrite(pin, { digitalValue: value }),
    })
    // Poll in 0.1 ms steps like a tight loop() would.
    for (let t = 0; t <= 1.5; t += 0.1) bus.flushScheduledEdges(t)

    // Multiple transitions — an undebounced sketch counts several presses.
    expect(seen.length).toBeGreaterThanOrEqual(6)
    expect(seen.at(-1)).toBe(1)
    expect(seen).toContain(0)
  })
})

// ── LCD busy window ────────────────────────────────────────────────────────

function makeLcdComponent(): BoardComponent {
  return {
    id: "lcd-1",
    type: "lcd_16x2",
    name: "LCD",
    x: 0,
    y: 0,
    rotation: 0,
    // Explicit pin map: rs=7, en=8, d4..d7 = 9..12.
    pins: { rs: 7, en: 8, d4: 9, d5: 10, d6: 11, d7: 12 },
    properties: {},
  }
}

/** Send one byte as two EN-latched nibbles at the given sim times. */
function sendLcdByte(
  lcd: LcdPeripheral,
  byte: number,
  rs: 0 | 1,
  simMsHigh: number,
  simMsLow: number,
): void {
  const edge = (pin: number, value: 0 | 1, simMs: number) =>
    lcd.onPinEdge({ pin, value, simMs, source: "avr" })
  const nibble = (n: number, simMs: number) => {
    edge(7, rs, simMs)
    edge(12, ((n >> 3) & 1) as 0 | 1, simMs)
    edge(11, ((n >> 2) & 1) as 0 | 1, simMs)
    edge(10, ((n >> 1) & 1) as 0 | 1, simMs)
    edge(9, (n & 1) as 0 | 1, simMs)
    edge(8, 1, simMs)
    edge(8, 0, simMs) // falling edge latches
  }
  nibble(byte >> 4, simMsHigh)
  nibble(byte & 0x0f, simMsLow)
}

describe("LCD busy window (strict mode)", () => {
  test("bytes spaced past 37 µs are accepted; rushed bytes are dropped", () => {
    setStrictHardwareEnabled(true)
    const lcd = new LcdPeripheral(makeLcdComponent())

    let t = 0
    // Respectful init: function set, display on, clear — 2 ms apart.
    sendLcdByte(lcd, 0x28, 0, t, t + 0.001); t += 2
    sendLcdByte(lcd, 0x0c, 0, t, t + 0.001); t += 2
    sendLcdByte(lcd, 0x01, 0, t, t + 0.001); t += 2 // Clear: busy 1.52 ms
    expect(lcd.droppedBusyBytes).toBe(0)

    // 'H' written respectfully lands in DDRAM…
    sendLcdByte(lcd, 0x48, 1, t, t + 0.001); t += 0.005
    // …then 'i' rushed 5 µs later hits the busy window and is dropped.
    sendLcdByte(lcd, 0x69, 1, t, t + 0.001)

    expect(lcd.droppedBusyBytes).toBe(1)
    const state = lcd.getState()
    expect(state?.kind).toBe("lcd")
    expect(state?.kind === "lcd" && state.textBuffer[0].startsWith("H ")).toBe(true)
  })

  test("clear/home hold the bus for 1.52 ms", () => {
    setStrictHardwareEnabled(true)
    const lcd = new LcdPeripheral(makeLcdComponent())
    let t = 0
    sendLcdByte(lcd, 0x28, 0, t, t + 0.001); t += 2
    sendLcdByte(lcd, 0x0c, 0, t, t + 0.001); t += 2
    sendLcdByte(lcd, 0x01, 0, t, t + 0.001) // Clear at t
    // 1 ms later — still busy (needs 1.52 ms): dropped.
    sendLcdByte(lcd, 0x48, 1, t + 1.0, t + 1.001)
    expect(lcd.droppedBusyBytes).toBe(1)
    // 2 ms later — accepted.
    sendLcdByte(lcd, 0x48, 1, t + 2.0, t + 2.001)
    expect(lcd.droppedBusyBytes).toBe(1)
  })

  test("legacy mode accepts rushed bytes (no busy modelling)", () => {
    setStrictHardwareEnabled(false)
    const lcd = new LcdPeripheral(makeLcdComponent())
    let t = 0
    sendLcdByte(lcd, 0x28, 0, t, t + 0.001); t += 0.002
    sendLcdByte(lcd, 0x48, 1, t, t + 0.001); t += 0.002
    sendLcdByte(lcd, 0x69, 1, t, t + 0.001)
    expect(lcd.droppedBusyBytes).toBe(0)
  })
})

// ── I²C address collisions ─────────────────────────────────────────────────

type FakeTwi = AVRTWI & {
  acks: boolean[]
  reads: number[]
  connects: boolean[]
}

function createFakeTwi(): FakeTwi {
  const fake = {
    eventHandler: undefined as unknown as TWIEventHandler,
    acks: [] as boolean[],
    reads: [] as number[],
    connects: [] as boolean[],
    completeStart() {},
    completeStop() {},
    completeConnect(ack: boolean) { this.connects.push(ack) },
    completeWrite(ack: boolean) { this.acks.push(ack) },
    completeRead(value: number) { this.reads.push(value) },
  }
  return fake as unknown as FakeTwi
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

describe("I²C address collision (strict mode)", () => {
  test("legacy mode: second device at 0x3C is skipped with a clear reason", () => {
    setStrictHardwareEnabled(false)
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeOled("oled-1"), "oled-2": makeOled("oled-2") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })
    expect(bus.attachSkips.length).toBe(1)
    expect(bus.attachSkips[0].reason).toContain("already owns")
    expect(bus.i2cAddressCollisions.length).toBe(0)
  })

  test("strict mode: both devices attach, the collision is recorded, and both receive writes", () => {
    setStrictHardwareEnabled(true)
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    bus.attachBoard({
      components: { "oled-1": makeOled("oled-1"), "oled-2": makeOled("oled-2") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })
    expect(bus.attachSkips.length).toBe(0)
    expect(bus.i2cAddressCollisions).toEqual([0x3c])

    // Drive DISPLAY_ON through the shared address — BOTH panels turn on,
    // which is exactly the confusing double-response of a real collision.
    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x3c, true)
    twi.eventHandler.writeByte(0x00)
    twi.eventHandler.writeByte(0xaf)
    twi.eventHandler.stop()

    const snapshot = bus.snapshot()
    const s1 = snapshot["oled-1"]
    const s2 = snapshot["oled-2"]
    expect(s1?.kind === "oled" && s1.on).toBe(true)
    expect(s2?.kind === "oled" && s2.on).toBe(true)
  })

  test("reads are the wired-AND of all responding devices", () => {
    setStrictHardwareEnabled(true)
    const bus = new PeripheralBus()
    const twi = createFakeTwi()
    // Two OLEDs collide at 0x3C; SSD1306 onRead always answers 0x00, so the
    // wired-AND of both is 0x00 — while an unowned address must stay 0xFF
    // (idle bus, nothing pulls a bit low).
    bus.attachBoard({
      components: { "oled-1": makeOled("oled-1"), "oled-2": makeOled("oled-2") },
      wires: {},
      pinStore: new PinStateStore(),
      twi,
    })
    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x3c, false)
    twi.eventHandler.readByte(true)
    expect(twi.reads.at(-1)).toBe(0x00)

    // Unowned address still reads 0xFF (idle bus, nothing pulls down).
    twi.eventHandler.start(false)
    twi.eventHandler.connectToSlave(0x50, false)
    twi.eventHandler.readByte(true)
    expect(twi.reads.at(-1)).toBe(0xff)
  })
})
