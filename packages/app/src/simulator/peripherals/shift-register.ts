// ── ShiftRegisterPeripheral (74HC595) ──────────────────────────────────────
//
// Models the serial-in / parallel-out 74HC595. The sketch bit-bangs three
// lines — DS (data), SHCP (shift clock), STCP (storage/latch clock) — usually
// through Arduino's `shiftOut()`. We reconstruct the chip's behaviour from the
// raw pin edges:
//
//   - On each SHCP (clock) RISING edge, sample the DS line and shift it into an
//     8-bit shift register (DS enters Q_A and shifts toward Q_H).
//   - On each STCP (latch) RISING edge, copy the shift register into the
//     storage register, which is what actually drives outputs Q0..Q7.
//
// Because it models the wires rather than the API, it is bit-order agnostic:
// `shiftOut(..., MSBFIRST, x)` and `LSBFIRST` both produce hardware-correct
// outputs. Emits `{ kind: "shift_register", outputs }`; the netlist builder
// turns each HIGH output into a 5V voltage source so wired LEDs light up.

import type { BoardComponent, ComponentType } from "@dreamer/schemas"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"

const TRACE_RING_SIZE = 32

type ShiftRegisterStateShape = Extract<PeripheralState, { kind: "shift_register" }>

export class ShiftRegisterPeripheral
  implements Peripheral<ShiftRegisterStateShape>
{
  readonly id: string
  readonly componentType: ComponentType = "shift_register"
  // The 595 sources current on its outputs from VCC — it needs external power
  // to do anything, even though the sim doesn't gate on it today.
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "requiresExternalPower",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private dataPin: number | null = null
  private clockPin: number | null = null
  private latchPin: number | null = null

  // Internal shift register (bit 0 = Q_A) and the latched storage register
  // that drives the outputs (bit i = Qi).
  private shiftReg = 0
  private storageReg = 0

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    const pins = component.pins ?? {}
    if (typeof pins.data === "number" && pins.data >= 0) this.dataPin = pins.data
    if (typeof pins.clock === "number" && pins.clock >= 0) this.clockPin = pins.clock
    if (typeof pins.latch === "number" && pins.latch >= 0) this.latchPin = pins.latch
    this.refreshWatched()
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  private refreshWatched(): void {
    this._watchedPins.clear()
    if (this.clockPin !== null) this._watchedPins.add(this.clockPin)
    if (this.latchPin !== null) this._watchedPins.add(this.latchPin)
    // DS is sampled from the pin store on the clock edge, but we still watch it
    // so a sketch that only re-drives DS keeps the peripheral in the pin index.
    if (this.dataPin !== null) this._watchedPins.add(this.dataPin)
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    // Pins are usually derived from wire topology, not explicit assignments.
    if (this.dataPin === null) {
      this.dataPin = findArduinoPinForComponentPin(this.component, "data", ctx.wires)
    }
    if (this.clockPin === null) {
      this.clockPin = findArduinoPinForComponentPin(this.component, "clock", ctx.wires)
    }
    if (this.latchPin === null) {
      this.latchPin = findArduinoPinForComponentPin(this.component, "latch", ctx.wires)
    }
    this.refreshWatched()
  }

  onPinEdge(edge: PinEdge): void {
    if (edge.pin === this.clockPin && edge.value === 1) {
      // Rising shift clock: sample DS now and push it into Q_A. Reading the pin
      // store (rather than tracking DS edges) matches the hardware — the level
      // present at the clock edge is what gets latched, including runs of
      // identical bits that produce no DS edge.
      const bit =
        this.dataPin !== null ? this.ctx?.pinStore.readDigital(this.dataPin) ?? 0 : 0
      this.shiftReg = ((this.shiftReg << 1) | bit) & 0xff
      return
    }
    if (edge.pin === this.latchPin && edge.value === 1) {
      // Rising latch: publish the shift register to the parallel outputs.
      if (this.storageReg !== this.shiftReg) {
        this.storageReg = this.shiftReg
        this.trace({
          simMs: edge.simMs,
          kind: "derive",
          message: `latch outputs=0b${this.storageReg.toString(2).padStart(8, "0")}`,
          detail: { value: this.storageReg },
        })
      }
    }
  }

  onTick(): void {
    // No time-based behaviour — outputs hold until the next latch.
  }

  getState(): Readonly<ShiftRegisterStateShape> | null {
    if (this.clockPin === null && this.latchPin === null && this.dataPin === null) {
      return null
    }
    const outputs: boolean[] = []
    for (let i = 0; i < 8; i++) {
      outputs.push(((this.storageReg >> i) & 1) === 1)
    }
    return {
      kind: "shift_register",
      data: this.dataPin,
      clock: this.clockPin,
      latch: this.latchPin,
      outputs,
    }
  }

  reset(): void {
    this.shiftReg = 0
    this.storageReg = 0
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

export function createShiftRegisterPeripheral(
  component: BoardComponent,
): ShiftRegisterPeripheral {
  return new ShiftRegisterPeripheral(component)
}
