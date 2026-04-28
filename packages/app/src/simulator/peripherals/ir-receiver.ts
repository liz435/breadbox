// ── IrReceiverPeripheral ───────────────────────────────────────────────────
//
// Simulates a 38kHz IR receiver module (e.g., TSOP38238, VS1838B) in AVR
// mode. Real IR receivers DEMODULATE the 38kHz carrier internally and
// output a clean active-LOW envelope, so this peripheral emits that
// envelope directly rather than trying to simulate carrier cycles.
//
// Protocol: NEC (used by most Arduino IRremote tutorials).
//   - 9 ms LOW leader
//   - 4.5 ms HIGH space
//   - 32 bits: 560 µs LOW + (560 µs HIGH = 0, 1.69 ms HIGH = 1)
//   - 560 µs LOW trailer
//   - Idle HIGH until next command
//
// The code is sent as 32 bits, MSB first. Layout: address (8), address_inv
// (8), command (8), command_inv (8). We just ship whatever 32-bit integer
// the inspector sends — if the user wants a specific Arduino IRremote
// hex like 0x20DF10EF, that's shipped verbatim.

import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"

// NEC timings (all in ms).
const LEADER_LOW_MS = 9.0
const LEADER_HIGH_MS = 4.5
const BIT_LOW_MS = 0.56
const BIT_HIGH_ZERO_MS = 0.56
const BIT_HIGH_ONE_MS = 1.69
const TRAILER_LOW_MS = 0.56

// Idle line is HIGH (active-low receiver output). Frame ends HIGH.
const TRACE_RING_SIZE = 32

type IrStateShape = Extract<PeripheralState, { kind: "ir_receiver" }>

export class IrReceiverPeripheral implements Peripheral<IrStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "ir_receiver"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "digitalSensor",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private readonly explicitSignal: number | null

  private signalPin: number | null = null
  private lastCode: number | null = null
  private transmitting = false
  private transmitEndSimMs = 0

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    const explicit = component.pins?.signal ?? component.pins?.data ?? component.pins?.out
    this.explicitSignal = typeof explicit === "number" && explicit >= 0 ? explicit : null
    if (this.explicitSignal !== null) {
      this.signalPin = this.explicitSignal
      // We don't watch this pin — the peripheral drives it, not reads from it.
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    if (this.signalPin === null) {
      const resolved = findArduinoPinForComponentPin(this.component, ["out", "signal", "data"], ctx.wires)
      if (resolved !== null) this.signalPin = resolved
    }
    // Seed the line HIGH (idle state for an active-low IR receiver).
    if (this.signalPin !== null) {
      ctx.scheduleEdge(this.signalPin, 1, 0)
    }
  }

  /**
   * Trigger an IR transmission of the given 32-bit NEC code. Drops the
   * request if a frame is already in flight so back-to-back button presses
   * don't overlap envelopes.
   */
  sendCode(code: number, startAtSimMs?: number): void {
    if (!this.ctx || this.signalPin === null) {
      this.trace({
        simMs: 0,
        kind: "warn",
        message: "sendCode with no context/pin — ignored",
      })
      return
    }
    if (this.transmitting) {
      this.trace({
        simMs: 0,
        kind: "warn",
        message: `sendCode 0x${code.toString(16)} while frame in flight — dropped`,
      })
      return
    }

    const u32 = code >>> 0
    this.lastCode = u32
    this.transmitting = true

    const startMs = startAtSimMs ?? 0 // Caller may not know sim time; scheduler uses ≤nowSimMs so 0 fires immediately.
    let t = startMs

    // Leader.
    this.ctx.scheduleEdge(this.signalPin, 0, t)
    t += LEADER_LOW_MS
    this.ctx.scheduleEdge(this.signalPin, 1, t)
    t += LEADER_HIGH_MS

    // 32 bits, MSB first.
    for (let i = 31; i >= 0; i--) {
      const is1 = (u32 >>> i) & 1
      this.ctx.scheduleEdge(this.signalPin, 0, t)
      t += BIT_LOW_MS
      this.ctx.scheduleEdge(this.signalPin, 1, t)
      t += is1 ? BIT_HIGH_ONE_MS : BIT_HIGH_ZERO_MS
    }

    // Trailer — short LOW then back to idle HIGH.
    this.ctx.scheduleEdge(this.signalPin, 0, t)
    t += TRAILER_LOW_MS
    this.ctx.scheduleEdge(this.signalPin, 1, t)

    this.transmitEndSimMs = t + 1 // small buffer
    this.trace({
      simMs: startMs,
      kind: "derive",
      message: `NEC 0x${u32.toString(16).toUpperCase()} (ends ${this.transmitEndSimMs.toFixed(1)}ms)`,
      detail: { code: u32, endMs: this.transmitEndSimMs },
    })
  }

  onPinEdge(_edge: PinEdge): void {
    // IR receiver drives the pin; it doesn't observe sketch-side edges.
  }

  onTick(simMs: number): void {
    if (this.transmitting && simMs >= this.transmitEndSimMs) {
      this.transmitting = false
      this.transmitEndSimMs = 0
    }
  }

  getState(): Readonly<IrStateShape> | null {
    if (this.signalPin === null) return null
    return {
      kind: "ir_receiver",
      signalPin: this.signalPin,
      lastCode: this.lastCode,
      transmitting: this.transmitting,
    }
  }

  reset(): void {
    this.transmitting = false
    this.transmitEndSimMs = 0
    this.lastCode = null
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

export function createIrReceiverPeripheral(component: BoardComponent): IrReceiverPeripheral {
  return new IrReceiverPeripheral(component)
}
