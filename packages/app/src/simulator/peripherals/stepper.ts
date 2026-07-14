// ── StepperPeripheral (28BYJ-48 + ULN2003) ─────────────────────────────────
//
// Models a 4-phase unipolar stepper behind a ULN2003 driver, driven by the
// Arduino `Stepper` library (or raw digitalWrites) on IN1–IN4. Rather than
// tracking a specific step sequence, it reconstructs the *magnetic field angle*
// the four coils produce and follows it — which is exactly what the rotor does.
//
//   coils at 0°/90°/180°/270°  →  field vector = (IN1−IN3, IN2−IN4)
//   fieldAngle = atan2(IN2−IN4, IN1−IN3)
//
// Accumulating the unwrapped field angle gives continuous rotation, correct in
// direction and magnitude, for every drive mode people actually use on this
// motor (wave, two-coil full-step, half-step). The degenerate raw-bipolar
// pattern (1010/0101) collapses the vector to zero — which is physically why a
// 28BYJ-48 doesn't turn when driven that way — so we simply hold on a null
// vector. One full electrical revolution (360° of field) = 4 full steps; the
// visible output shaft turns `4 / stepsPerRev` of a turn per electrical rev.

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
const RAD2DEG = 180 / Math.PI

type StepperStateShape = Extract<PeripheralState, { kind: "stepper" }>

/** Wrap an angle delta (radians) to (−π, π] so unwrapping takes the short way. */
function wrapPi(a: number): number {
  let x = a
  while (x > Math.PI) x -= 2 * Math.PI
  while (x <= -Math.PI) x += 2 * Math.PI
  return x
}

export class StepperPeripheral implements Peripheral<StepperStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "stepper_motor"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "positionActuator",
    "requiresExternalPower",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private readonly stepsPerRev: number
  // IN1..IN4 → Arduino pin numbers (index 0..3).
  private inPins: (number | null)[] = [null, null, null, null]

  // Accumulated field angle (radians) and the last field angle for unwrapping.
  private accumRad = 0
  private lastFieldRad: number | null = null

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    const props = component.properties ?? {}
    this.stepsPerRev =
      typeof props.stepsPerRev === "number" && props.stepsPerRev > 0 ? props.stepsPerRev : 2048
    const pins = component.pins ?? {}
    const names = ["in1", "in2", "in3", "in4"] as const
    names.forEach((n, i) => {
      const p = pins[n]
      if (typeof p === "number" && p >= 0) this.inPins[i] = p
    })
    this.refreshWatched()
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  private refreshWatched(): void {
    this._watchedPins.clear()
    for (const p of this.inPins) if (p !== null) this._watchedPins.add(p)
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    // Derive any unassigned IN pins from the wire topology.
    const names = ["in1", "in2", "in3", "in4"] as const
    names.forEach((n, i) => {
      if (this.inPins[i] === null) {
        this.inPins[i] = findArduinoPinForComponentPin(this.component, n, ctx.wires)
      }
    })
    this.refreshWatched()
  }

  onPinEdge(edge: PinEdge): void {
    if (!this._watchedPins.has(edge.pin)) return
    this.updateField(edge.simMs)
  }

  onTick(): void {
    // Field is recomputed on every coil edge; nothing time-based to advance.
  }

  /** Read the four coil levels, form the field vector, and accumulate the
   *  unwrapped rotation. A zero vector (opposing coils / all off) holds. */
  private updateField(simMs: number): void {
    const store = this.ctx?.pinStore
    if (!store) return
    const lvl = (i: number): number => {
      const p = this.inPins[i]
      return p !== null ? store.readDigital(p) : 0
    }
    const fx = lvl(0) - lvl(2) // IN1 − IN3
    const fy = lvl(1) - lvl(3) // IN2 − IN4
    if (fx === 0 && fy === 0) return // no torque direction — hold

    const field = Math.atan2(fy, fx)
    if (this.lastFieldRad !== null) {
      this.accumRad += wrapPi(field - this.lastFieldRad)
    }
    this.lastFieldRad = field
    this.trace({
      simMs,
      kind: "derive",
      message: `field ${(field * RAD2DEG).toFixed(0)}° → shaft ${this.outputAngleDeg().toFixed(1)}°`,
      detail: { fx, fy },
    })
  }

  /** Output-shaft angle (degrees): 360° of field = 4 full steps of the
   *  `stepsPerRev`-step output revolution. */
  private outputAngleDeg(): number {
    return this.accumRad * RAD2DEG * (4 / this.stepsPerRev)
  }

  getState(): Readonly<StepperStateShape> | null {
    if (!this.inPins.some((p) => p !== null)) return null
    return { kind: "stepper", angle: this.outputAngleDeg() }
  }

  reset(): void {
    this.accumRad = 0
    this.lastFieldRad = null
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

export function createStepperPeripheral(component: BoardComponent): StepperPeripheral {
  return new StepperPeripheral(component)
}
