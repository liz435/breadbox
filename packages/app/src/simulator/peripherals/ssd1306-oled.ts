// ── SSD1306 OLED Peripheral ────────────────────────────────────────────────
//
// Models a 128×64 monochrome SSD1306 OLED on I²C address 0x3C, driven by
// Adafruit_SSD1306 over the AVR's TWI peripheral.
//
// Protocol (SSD1306 datasheet §8 / §10):
//   Each I²C transaction:
//     START → addr+W → control byte → N payload bytes → STOP
//   Control byte (bit 7 = Co continuation, bit 6 = D/C):
//     0x00 = commands stream     0x40 = data stream
//   Adafruit only uses Co=0 (the rest of the transaction is one stream),
//   so we ignore the Co bit and key off D/C.
//
//   Data writes go into GDDRAM with auto-increment under horizontal
//   addressing mode: byte → (col, page); col++; if col>colEnd then
//   col=colStart, page++; if page>pageEnd then page=pageStart. The
//   col/page pointers persist across STOP/START — Adafruit reissues
//   COL_ADDR + PAGE_ADDR before every full-frame flush so the pointer
//   is always re-anchored.
//
// Pixel layout: framebuffer[(y >> 3) * 128 + x] holds 8 vertical pixels;
// bit (y % 8) is row y, LSB on top (datasheet §8.7 / Fig 8-17).

import type { BoardComponent, ComponentType } from "@dreamer/schemas"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
  TwiSlaveHandler,
} from "./types"

type OledStateShape = Extract<PeripheralState, { kind: "oled" }>

const SSD1306_I2C_ADDR = 0x3c
const WIDTH = 128
const HEIGHT = 64
const PAGES = HEIGHT / 8
const FRAMEBUFFER_BYTES = WIDTH * PAGES // 1024
const TRACE_RING_SIZE = 16

const CTRL_COMMAND = 0x00
const CTRL_DATA = 0x40

// SSD1306 command opcodes — only the ones with parameters need to be
// listed here so the parser knows how many bytes to consume. Single-byte
// opcodes commit immediately (default).
const CMD_PARAM_COUNT: Readonly<Record<number, number>> = Object.freeze({
  0x20: 1, // SET_MEMORY_ADDR_MODE
  0x21: 2, // SET_COLUMN_ADDR (start, end)
  0x22: 2, // SET_PAGE_ADDR (start, end)
  0x81: 1, // SET_CONTRAST
  0x8d: 1, // SET_CHARGE_PUMP
  0xa8: 1, // SET_MULTIPLEX_RATIO
  0xd3: 1, // SET_DISPLAY_OFFSET
  0xd5: 1, // SET_DISPLAY_CLOCK_DIV
  0xd9: 1, // SET_PRECHARGE_PERIOD
  0xda: 1, // SET_COM_PINS
  0xdb: 1, // SET_VCOMH_DESELECT
})

const CMD_DISPLAY_OFF = 0xae
const CMD_DISPLAY_ON = 0xaf
const CMD_NORMAL_DISPLAY = 0xa6
const CMD_INVERT_DISPLAY = 0xa7

type Pending = { opcode: number; need: number; params: number[] }

export class Ssd1306Peripheral implements Peripheral<OledStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "oled_display"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "displaySink",
  ])
  readonly watchedPins: ReadonlySet<number> = new Set()

  private ctx: PeripheralContext | null = null
  private detachTwi: (() => void) | null = null
  private traces: PeripheralTrace[] = []

  // Hardware framebuffer, mutated in place.
  private gddram = new Uint8Array(FRAMEBUFFER_BYTES)
  // The number[] view exposed via getState() — same reference across frames.
  private framebufferSnapshot: number[] = new Array<number>(FRAMEBUFFER_BYTES).fill(0)
  private dirty = false

  // Addressing state (horizontal mode 0x00 only).
  private colStart = 0
  private colEnd = WIDTH - 1
  private pageStart = 0
  private pageEnd = PAGES - 1
  private col = 0
  private page = 0

  private displayOn = false
  private inverted = false
  // True once we've seen any I²C traffic — gates getState() so unconfigured
  // OLEDs report `null` (LibraryState renders the dark static placeholder).
  private hasReceivedAnyByte = false

  // Per-transaction state (reset on STOP).
  private controlByte: number | null = null
  private pending: Pending | null = null
  private dataBytesThisTxn = 0

  private readonly twiHandler: TwiSlaveHandler = {
    onWrite: (byte) => this.handleWrite(byte),
    onRead: () => 0x00, // Adafruit_SSD1306 never reads.
    onStop: () => this.handleStop(),
  }

  constructor(component: BoardComponent) {
    this.id = component.id
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    // attachTwi throws if AVR runner didn't wire TWI — that's the contract.
    this.detachTwi = ctx.attachTwi(SSD1306_I2C_ADDR, this.twiHandler)
  }

  onPinEdge(_edge: PinEdge): void { /* I²C is register-driven, not pin-driven */ }
  onTick(_simMs: number): void { /* no periodic work */ }

  getState(): Readonly<OledStateShape> | null {
    if (!this.hasReceivedAnyByte) return null
    if (this.dirty) {
      for (let i = 0; i < FRAMEBUFFER_BYTES; i++) {
        this.framebufferSnapshot[i] = this.gddram[i]
      }
      this.dirty = false
    }
    return {
      kind: "oled",
      width: WIDTH,
      height: HEIGHT,
      on: this.displayOn,
      inverted: this.inverted,
      framebuffer: this.framebufferSnapshot,
    }
  }

  reset(): void {
    this.detachTwi?.()
    this.detachTwi = null
    this.gddram.fill(0)
    for (let i = 0; i < FRAMEBUFFER_BYTES; i++) this.framebufferSnapshot[i] = 0
    this.dirty = false
    this.colStart = 0
    this.colEnd = WIDTH - 1
    this.pageStart = 0
    this.pageEnd = PAGES - 1
    this.col = 0
    this.page = 0
    this.displayOn = false
    this.inverted = false
    this.hasReceivedAnyByte = false
    this.controlByte = null
    this.pending = null
    this.dataBytesThisTxn = 0
    this.traces = []
    // Re-attach TWI on the next attach() — bus calls this from detachBoard
    // and a fresh attachBoard will re-instantiate via the factory.
  }

  getTrace(): ReadonlyArray<PeripheralTrace> {
    return this.traces
  }

  // ── Protocol state machine ───────────────────────────────────────────────

  private handleWrite(byte: number): boolean {
    this.hasReceivedAnyByte = true

    // First byte of every transaction is the control byte. Mask off Co (bit 7)
    // since Adafruit always uses Co=0 (stream-of-same-type for the rest of
    // the transaction); D/C (bit 6) selects command vs data.
    if (this.controlByte === null) {
      this.controlByte = byte & 0x40 ? CTRL_DATA : CTRL_COMMAND
      return true
    }

    if (this.controlByte === CTRL_DATA) {
      this.writeData(byte)
      return true
    }

    this.consumeCommandByte(byte)
    return true
  }

  private handleStop(): void {
    if (this.dataBytesThisTxn > 0) {
      this.trace({
        simMs: 0,
        kind: "write",
        message: "display",
        detail: { bytes: this.dataBytesThisTxn, col: this.col, page: this.page },
      })
    }
    this.controlByte = null
    this.pending = null
    this.dataBytesThisTxn = 0
    // NB: do NOT reset col/page — pointer state persists across STOP/START.
  }

  private writeData(byte: number): void {
    const idx = this.page * WIDTH + this.col
    if (idx >= 0 && idx < FRAMEBUFFER_BYTES && this.gddram[idx] !== byte) {
      this.gddram[idx] = byte
      this.dirty = true
    }
    this.dataBytesThisTxn++
    this.col++
    if (this.col > this.colEnd) {
      this.col = this.colStart
      this.page = this.page >= this.pageEnd ? this.pageStart : this.page + 1
    }
  }

  private consumeCommandByte(byte: number): void {
    if (this.pending) {
      this.pending.params.push(byte)
      if (this.pending.params.length >= this.pending.need) {
        this.commitCommand(this.pending.opcode, this.pending.params)
        this.pending = null
      }
      return
    }

    const need = CMD_PARAM_COUNT[byte] ?? 0
    if (need > 0) {
      this.pending = { opcode: byte, need, params: [] }
      return
    }

    this.commitCommand(byte, [])
  }

  private commitCommand(opcode: number, params: readonly number[]): void {
    // Start-line opcode is encoded in the low 6 bits of 0x40-0x7F. Adafruit
    // calls it during init; we don't model start-line scrolling so it's a no-op.
    if (opcode >= 0x40 && opcode <= 0x7f) return

    switch (opcode) {
      case CMD_DISPLAY_OFF:
        this.displayOn = false
        break
      case CMD_DISPLAY_ON:
        this.displayOn = true
        // Treat the panel turning on as a render-relevant transition so the
        // canvas repaints (state.on changed → useEffect dep changes).
        this.dirty = true
        break
      case CMD_NORMAL_DISPLAY:
        this.inverted = false
        this.dirty = true
        break
      case CMD_INVERT_DISPLAY:
        this.inverted = true
        this.dirty = true
        break
      case 0x21: // SET_COLUMN_ADDR
        this.colStart = params[0] & 0x7f
        this.colEnd = params[1] & 0x7f
        this.col = this.colStart
        break
      case 0x22: // SET_PAGE_ADDR
        this.pageStart = params[0] & 0x07
        this.pageEnd = params[1] & 0x07
        this.page = this.pageStart
        break
      // 0x20 (ADDR_MODE), 0x81 (contrast), 0x8d (charge pump), 0xa8 (mux),
      // 0xd3 (offset), 0xd5 (clock div), 0xd9 (precharge), 0xda (com pins),
      // 0xdb (vcomh): Adafruit fires these during begin(); we accept and
      // discard. A8/D3 etc would matter for non-128×64 panels but Adafruit's
      // canonical init values match the panel we model.
      default:
        break
    }
  }

  private trace(entry: Omit<PeripheralTrace, "ts">): void {
    this.traces.push({ ...entry, ts: Date.now() })
    if (this.traces.length > TRACE_RING_SIZE) {
      this.traces = this.traces.slice(-TRACE_RING_SIZE)
    }
    this.ctx?.trace(entry)
  }
}

export function createOledPeripheral(component: BoardComponent): Ssd1306Peripheral {
  return new Ssd1306Peripheral(component)
}
