// ── LcdPeripheral ──────────────────────────────────────────────────────────
//
// Receives display state from whichever driver owns the HD44780 protocol:
//   - Today: the transpile-mode stdlib `LiquidCrystal` class pushes via an
//     adapter in simulation-loop.ts.
//   - Future (post-transpiler drop): an AVR-side 4-bit parallel protocol
//     decoder will observe pin edges and call `writeDisplay` directly.
// The peripheral itself is driver-agnostic — any source can populate it via
// `writeDisplay`.

import type { BoardComponent, ComponentType } from "@dreamer/schemas"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"

type LcdStateShape = Extract<PeripheralState, { kind: "lcd" }>

export type LcdSnapshotSource = {
  cols: number
  rows: number
  textBuffer: string[]
} | null

const TRACE_RING_SIZE = 16

export class LcdPeripheral implements Peripheral<LcdStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "lcd_16x2"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "displaySink",
  ])
  readonly watchedPins: ReadonlySet<number> = new Set()

  private ctx: PeripheralContext | null = null
  private source: LcdSnapshotSource = null
  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
  }

  /**
   * Push a display snapshot into the peripheral. Called by whichever driver
   * currently owns HD44780 state (stdlib adapter today, AVR decoder later).
   */
  writeDisplay(source: LcdSnapshotSource, description = "write"): void {
    this.source = source
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

  onPinEdge(_edge: PinEdge): void {
    // LCD is not yet edge-driven in AVR mode. Phase 5 follow-up wires the
    // 4-bit parallel protocol decoder here.
  }

  onTick(_simMs: number): void { /* no-op */ }

  getState(): Readonly<LcdStateShape> | null {
    if (!this.source) return null
    return {
      kind: "lcd",
      cols: this.source.cols,
      rows: this.source.rows,
      textBuffer: [...this.source.textBuffer],
    }
  }

  reset(): void {
    this.source = null
    this.traces = []
  }

  getTrace(): ReadonlyArray<PeripheralTrace> {
    return this.traces
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
