// ── LcdPeripheral — HD44780 4-bit parallel decoder ─────────────────────────
//
// Models a standard Hitachi HD44780-compatible character LCD (16×2 by
// default) driven in 4-bit mode — exactly what the Arduino `LiquidCrystal`
// library emits. Observes AVR pin edges on the six signal pins (RS, EN, D4..D7)
// and reconstructs the byte stream the sketch sent, executes the subset of
// commands the library actually uses, and maintains a DDRAM-backed text
// buffer the renderer reads via `getState()`.
//
// Protocol (HD44780 datasheet §5, applied to Arduino LiquidCrystal):
//   • RW is tied LOW by the Arduino library → we never read back from the
//     LCD, so only RS/EN/D4..D7 are modelled as inputs.
//   • RS=LOW → next byte is a command; RS=HIGH → next byte is a character.
//   • Every byte is transmitted as two 4-bit nibbles, high nibble first, on
//     D4..D7. Each nibble is latched by a rising-then-falling EN pulse; we
//     key off the falling edge since that's the one the datasheet specifies
//     as the latching transition (EN must be stable HIGH ≥450 ns first).
//
// Commands we honour:
//   0x01         Clear Display      — DDRAM = spaces; cursor → (0,0).
//   0x02         Return Home        — cursor → (0,0); display not shifted.
//   0x04..0x07   Entry Mode Set     — direction (+1 / -1) for cursor advance.
//                                     Shift-on-write is not modelled (the
//                                     visible window stays at address 0).
//   0x08..0x0F   Display Control    — display/cursor/blink on/off flags.
//   0x10..0x1F   Cursor/Display Shift — noop in our model.
//   0x20..0x3F   Function Set       — we always assume 4-bit, 2-line, 5×8.
//                                     Re-issued function-sets are no-ops.
//   0x40..0x7F   Set CGRAM Address  — noop (custom glyphs not modelled).
//   0x80..0xFF   Set DDRAM Address  — lower 7 bits = DDRAM index. 0x00..0x27
//                                     = row 0 (40 chars), 0x40..0x67 = row 1.
//                                     Out-of-range addresses snap the cursor
//                                     to the nearest legal row.
//
// What we do NOT model:
//   • Custom characters (CGRAM). Writing the CGRAM-address opcode is a noop
//     so sketches that set custom chars still parse cleanly; they just show
//     whatever character code the sketch writes later.
//   • Display shift (LiquidCrystal exposes this as scrollDisplayLeft() etc).
//   • The 8-bit interface mode. Arduino's library defaults to 4-bit for the
//     6-pin wiring the breadboard expects.
//   • Timing. A real HD44780 requires ~37µs per byte; the AVR sketch already
//     inserts those delays, and we commit instantly on the latching edge.

import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import { resolveComponentPins } from "@dreamer/schemas"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"

type LcdStateShape = Extract<PeripheralState, { kind: "lcd" }>

/** @deprecated legacy stdlib bridge — kept so transpile-mode callers don't break. */
export type LcdSnapshotSource = {
  cols: number
  rows: number
  textBuffer: string[]
} | null

// ── Signal-pin vocabulary ──────────────────────────────────────────────────

/** Names of the six HD44780 4-bit-mode pins we care about, in bit order. */
const SIGNAL_PIN_NAMES = ["rs", "en", "d4", "d5", "d6", "d7"] as const
type SignalName = (typeof SIGNAL_PIN_NAMES)[number]

type PinLevels = Record<SignalName, 0 | 1>

// ── DDRAM layout ───────────────────────────────────────────────────────────

/** HD44780 DDRAM is 40 cols × 2 rows; columns beyond the panel width are
 *  off-screen but still valid to write. */
const DDRAM_COLS = 40
const DDRAM_ROWS = 2

/** DDRAM address → (row, col) with row-0 window 0x00..0x27, row-1 0x40..0x67. */
function addressToRowCol(addr: number): { row: number; col: number } {
  const masked = addr & 0x7f
  if (masked >= 0x40) {
    return { row: 1, col: Math.min(DDRAM_COLS - 1, masked - 0x40) }
  }
  return { row: 0, col: Math.min(DDRAM_COLS - 1, masked) }
}

// ── Wire-topology resolver ─────────────────────────────────────────────────

/**
 * Walk the wire map to find which Arduino pin is connected to a given
 * component-footprint hole. Mirrors the breadboard cluster semantics other
 * peripherals use (ultrasonic, servo): only wires whose "other end" lands
 * in the same 5-column cluster as the footprint hole count as connected.
 */
function resolveArduinoPinForHole(
  wires: Record<string, Wire>,
  targetRow: number,
  targetCol: number,
): number | null {
  const clusterOf = (col: number): "L" | "R" | null => {
    if (col >= 0 && col <= 4) return "L"
    if (col >= 5 && col <= 9) return "R"
    return null
  }
  const targetCluster = clusterOf(targetCol)
  if (!targetCluster) return null

  for (const w of Object.values(wires)) {
    if (w.fromRow === -999 && w.toRow === targetRow && clusterOf(w.toCol) === targetCluster) {
      return w.fromCol
    }
    if (w.toRow === -999 && w.fromRow === targetRow && clusterOf(w.fromCol) === targetCluster) {
      return w.toCol
    }
  }
  return null
}

// ── Trace buffer ───────────────────────────────────────────────────────────

const TRACE_RING_SIZE = 32

// ── Peripheral ─────────────────────────────────────────────────────────────

export class LcdPeripheral implements Peripheral<LcdStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "lcd_16x2"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "displaySink",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null

  // Geometry. The HD44780 supports 16×2 and 20×4; Arduino's `LiquidCrystal`
  // only exposes the 2-line 5×8 configuration, which is what the renderer
  // expects today. Cols can be driven by the begin(cols, rows) call — the
  // sketch's first Function Set carries the 2-line flag but not the width.
  private readonly cols: number
  private readonly rows: number

  // Pin → Arduino pin index. Populated from the explicit `component.pins`
  // map when present, otherwise resolved from the wire topology on attach.
  private signalPins: Record<SignalName, number | null> = {
    rs: null,
    en: null,
    d4: null,
    d5: null,
    d6: null,
    d7: null,
  }
  private levels: PinLevels = { rs: 0, en: 0, d4: 0, d5: 0, d6: 0, d7: 0 }

  // Nibble assembly: HD44780 4-bit mode needs two EN pulses per byte. The
  // first captured nibble is the high nibble; the second is the low nibble.
  private pendingHighNibble: number | null = null

  // DDRAM & cursor state.
  private ddram: string[][]
  private ddramRow = 0
  private ddramCol = 0
  /** +1 for left-to-right (default), -1 for right-to-left. LiquidCrystal's
   *  `leftToRight()` / `rightToLeft()` toggle this. */
  private cursorDirection: 1 | -1 = 1

  // Display flags (0x08..0x0F).
  private displayOn = false
  private cursorVisible = false
  private cursorBlink = false

  // Has the sketch issued any command yet? Gates getState() — an unconfigured
  // LCD returns null so the renderer can show its idle placeholder.
  private hasReceivedAnyByte = false

  // Fallback legacy snapshot source (stdlib transpile-mode writeDisplay).
  private legacySource: LcdSnapshotSource = null

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    const props = component.properties ?? {}
    // `cols` / `rows` are not in the component schema today but the LCD
    // renderer keys off a 16×2 grid. Leave room for future props but default
    // to standard.
    const colsProp = typeof props["cols"] === "number" ? props["cols"] : null
    const rowsProp = typeof props["rows"] === "number" ? props["rows"] : null
    this.cols = colsProp && colsProp > 0 ? colsProp : 16
    this.rows = rowsProp && rowsProp > 0 ? rowsProp : 2
    this.ddram = this.emptyDdram()

    // First-pass pin resolution from explicit pin assignments in the board
    // JSON. Most LCDs in the canonical examples store `null` here and rely
    // on wire-topology resolution at attach(); we still accept explicit
    // pins as an override.
    for (const name of SIGNAL_PIN_NAMES) {
      const v = component.pins?.[name]
      if (typeof v === "number" && v >= 0) this.signalPins[name] = v
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx

    // Fill in any pins that weren't assigned explicitly by walking the wire
    // topology. The component-pin resolver gives us the canonical footprint
    // row/col for each signal pin; we then look up which Arduino pin that
    // hole is wired to.
    const footprint = resolveComponentPins(
      ctx.component.type,
      ctx.component.y,
      ctx.component.x,
      ctx.component.properties,
    )
    for (const name of SIGNAL_PIN_NAMES) {
      if (this.signalPins[name] !== null) continue
      const hole = footprint[name]
      if (!hole) continue
      const pin = resolveArduinoPinForHole(ctx.wires, hole.row, hole.col)
      if (pin !== null) this.signalPins[name] = pin
    }

    // Rebuild the watched-pin set from everything we ended up bound to.
    this._watchedPins.clear()
    for (const name of SIGNAL_PIN_NAMES) {
      const p = this.signalPins[name]
      if (p !== null && p >= 0) this._watchedPins.add(p)
    }

    if (this._watchedPins.size < SIGNAL_PIN_NAMES.length) {
      this.trace({
        simMs: 0,
        kind: "warn",
        message: "LCD pins partially resolved — decoding may be incomplete",
        detail: {
          rs: this.signalPins.rs,
          en: this.signalPins.en,
          d4: this.signalPins.d4,
          d5: this.signalPins.d5,
          d6: this.signalPins.d6,
          d7: this.signalPins.d7,
        },
      })
    }
  }

  onPinEdge(edge: PinEdge): void {
    const name = this.nameOfPin(edge.pin)
    if (!name) return

    const prev = this.levels[name]
    this.levels[name] = edge.value

    // Latching edge: EN falling. Arduino's pulseEnable() pulls EN HIGH,
    // waits ≥1µs, then pulls it LOW — the high→low transition is when the
    // HD44780 samples D4..D7 and commits the nibble.
    if (name === "en" && prev === 1 && edge.value === 0) {
      this.latchNibble()
    }
  }

  onTick(_simMs: number): void { /* no periodic work */ }

  getState(): Readonly<LcdStateShape> | null {
    // Fallback to legacy-push source (transpile mode) when no pin traffic
    // has been decoded yet but an adapter has written a snapshot.
    if (!this.hasReceivedAnyByte) {
      if (this.legacySource) {
        return {
          kind: "lcd",
          cols: this.legacySource.cols,
          rows: this.legacySource.rows,
          textBuffer: [...this.legacySource.textBuffer],
        }
      }
      return null
    }
    return {
      kind: "lcd",
      cols: this.cols,
      rows: this.rows,
      textBuffer: this.visibleTextBuffer(),
    }
  }

  reset(): void {
    this.ddram = this.emptyDdram()
    this.ddramRow = 0
    this.ddramCol = 0
    this.cursorDirection = 1
    this.displayOn = false
    this.cursorVisible = false
    this.cursorBlink = false
    this.pendingHighNibble = null
    this.hasReceivedAnyByte = false
    this.legacySource = null
    this.levels = { rs: 0, en: 0, d4: 0, d5: 0, d6: 0, d7: 0 }
    this.traces = []
  }

  getTrace(): ReadonlyArray<PeripheralTrace> {
    return this.traces
  }

  /**
   * Legacy push-snapshot entry point for the pre-AVR transpile-mode
   * stdlib. New code should drive the LCD via pin edges — this exists so
   * any lingering adapter can still stuff a framebuffer in without
   * touching the decoder state.
   *
   * @deprecated prefer driving pin edges; will be removed once no callers remain.
   */
  writeDisplay(source: LcdSnapshotSource, description = "write"): void {
    this.legacySource = source
    this.trace({
      simMs: 0,
      kind: "write",
      message: description,
      detail: {
        cols: source?.cols ?? 0,
        rows: source?.rows ?? 0,
        preview: (source?.textBuffer?.[0] ?? "").slice(0, 16),
      },
    })
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private nameOfPin(pin: number): SignalName | null {
    for (const name of SIGNAL_PIN_NAMES) {
      if (this.signalPins[name] === pin) return name
    }
    return null
  }

  private latchNibble(): void {
    // Read the current data-pin levels as a 4-bit nibble. D7 is MSB.
    const nibble =
      ((this.levels.d7 & 1) << 3) |
      ((this.levels.d6 & 1) << 2) |
      ((this.levels.d5 & 1) << 1) |
      (this.levels.d4 & 1)

    if (this.pendingHighNibble === null) {
      this.pendingHighNibble = nibble
      return
    }
    const byte = (this.pendingHighNibble << 4) | nibble
    this.pendingHighNibble = null
    this.hasReceivedAnyByte = true

    if (this.levels.rs === 1) {
      this.writeChar(byte)
    } else {
      this.executeCommand(byte)
    }
  }

  private executeCommand(byte: number): void {
    // Decode in descending specificity: the bit-position determines the
    // opcode family. (HD44780 datasheet Table 6.)
    if (byte === 0x00) {
      // Not a documented opcode, but Arduino's library occasionally emits
      // a zero before init completes. Treat as noop.
      return
    }
    if (byte === 0x01) {
      this.ddram = this.emptyDdram()
      this.ddramRow = 0
      this.ddramCol = 0
      this.trace({ simMs: 0, kind: "write", message: "clear", detail: {} })
      return
    }
    if (byte === 0x02 || byte === 0x03) {
      this.ddramRow = 0
      this.ddramCol = 0
      this.trace({ simMs: 0, kind: "write", message: "home", detail: {} })
      return
    }
    if ((byte & 0xfc) === 0x04) {
      // Entry Mode Set: bit 1 = increment/decrement (I/D), bit 0 = shift (S).
      // We honour the I/D direction bit and ignore display-shift (S) since
      // we don't model scrolling the visible window.
      this.cursorDirection = (byte & 0x02) !== 0 ? 1 : -1
      this.trace({
        simMs: 0,
        kind: "write",
        message: "entry-mode",
        detail: { direction: this.cursorDirection },
      })
      return
    }
    if ((byte & 0xf8) === 0x08) {
      // Display On/Off Control: bit 2 = display, 1 = cursor, 0 = blink.
      this.displayOn = (byte & 0x04) !== 0
      this.cursorVisible = (byte & 0x02) !== 0
      this.cursorBlink = (byte & 0x01) !== 0
      this.trace({
        simMs: 0,
        kind: "write",
        message: "display-control",
        detail: {
          on: this.displayOn,
          cursor: this.cursorVisible,
          blink: this.cursorBlink,
        },
      })
      return
    }
    if ((byte & 0xf0) === 0x10) {
      // Cursor / Display Shift — not modelled.
      return
    }
    if ((byte & 0xe0) === 0x20) {
      // Function Set. We always operate as 4-bit, 2-line, 5×8. The first
      // function-set in Arduino's init actually drives an 8-bit byte as
      // two 4-bit nibbles; our decoder sees it as the assembled byte and
      // correctly lands here. No state to update.
      return
    }
    if ((byte & 0xc0) === 0x40) {
      // Set CGRAM Address — custom glyph write-pointer. Not modelled.
      return
    }
    if ((byte & 0x80) === 0x80) {
      const { row, col } = addressToRowCol(byte & 0x7f)
      this.ddramRow = row
      this.ddramCol = col
      this.trace({
        simMs: 0,
        kind: "write",
        message: "set-ddram-addr",
        detail: { row, col },
      })
      return
    }
    // Any remaining opcode is in a reserved range we don't need to model.
  }

  private writeChar(byte: number): void {
    // Printable ASCII maps 1:1 to HD44780 character codes in the ranges the
    // sketch typically uses (0x20..0x7E). Codes outside that stay as-is so
    // the renderer can decide how to draw them (today it just uses the raw
    // character, so non-ASCII codes render as-is via String.fromCharCode).
    const ch = String.fromCharCode(byte)
    if (this.ddramRow < DDRAM_ROWS && this.ddramCol < DDRAM_COLS) {
      this.ddram[this.ddramRow][this.ddramCol] = ch
    }
    // Advance cursor. Left-to-right past the end stops at DDRAM_COLS-1 so
    // subsequent writes keep overwriting the last column (matches real-LCD
    // behaviour when shift-on-write is off). Same for the start-of-line in
    // right-to-left mode.
    const next = this.ddramCol + this.cursorDirection
    if (next >= 0 && next < DDRAM_COLS) {
      this.ddramCol = next
    }
  }

  private emptyDdram(): string[][] {
    const rows: string[][] = []
    for (let r = 0; r < DDRAM_ROWS; r++) {
      rows.push(new Array<string>(DDRAM_COLS).fill(" "))
    }
    return rows
  }

  /** Slice the `rows × DDRAM_COLS` DDRAM down to `rows × cols` for display. */
  private visibleTextBuffer(): string[] {
    const out: string[] = []
    for (let r = 0; r < this.rows; r++) {
      const ddramRow = this.ddram[r] ?? new Array<string>(DDRAM_COLS).fill(" ")
      out.push(ddramRow.slice(0, this.cols).join(""))
    }
    return out
  }

  private trace(entry: Omit<PeripheralTrace, "ts">): void {
    this.traces.push({ ...entry, ts: Date.now() })
    if (this.traces.length > TRACE_RING_SIZE) {
      this.traces = this.traces.slice(-TRACE_RING_SIZE)
    }
    this.ctx?.trace(entry)
  }
}

export function createLcdPeripheral(component: BoardComponent): LcdPeripheral {
  return new LcdPeripheral(component)
}
