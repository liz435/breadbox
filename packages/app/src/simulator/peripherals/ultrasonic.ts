// ── UltrasonicPeripheral ───────────────────────────────────────────────────
//
// Simulates an HC-SR04 ultrasonic distance sensor in AVR mode. The sketch
// drives the trig pin; after a ≥8µs HIGH pulse the sensor responds on the
// echo pin with a HIGH pulse whose width = distanceCm × 58µs (speed of
// sound round-trip). The peripheral schedules the echo edges via the bus's
// microsecond scheduler so the AVR's compiled pulseIn() measures the same
// timing a real sensor would produce.
//
// Distance is driven externally by the inspector or ray-cast helper via
// setDistance(cm). Default mirrors what the renderer picks up for visual
// feedback.

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

// HC-SR04 electrical characteristics.
const MIN_TRIG_PULSE_US = 8          // anything shorter is ignored
const SENSOR_PROCESSING_MS = 0.5     // 500µs delay before echo starts
const US_PER_CM = 58                 // round-trip at ~340 m/s in air
const MIN_DISTANCE_CM = 2            // below this the sensor bottoms out
const MAX_DISTANCE_CM = 400          // above this the sensor times out

const TRACE_RING_SIZE = 32

type UltrasonicStateShape = Extract<PeripheralState, { kind: "ultrasonic" }>

export class UltrasonicPeripheral implements Peripheral<UltrasonicStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "ultrasonic_sensor"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "analogSensor",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private readonly explicitTrig: number | null
  private readonly explicitEcho: number | null

  private trigPin: number | null = null
  private echoPin: number | null = null
  /** null = no object in range → no echo pulse → pulseIn() reads 0 (timeout). */
  private distanceCm: number | null = null
  private trigHighAtSimMs = 0
  private awaitingEcho = false
  private lastPulseUs = 0

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    const trigPin = component.pins?.trigger
    const echoPin = component.pins?.echo
    this.explicitTrig = typeof trigPin === "number" && trigPin >= 0 ? trigPin : null
    this.explicitEcho = typeof echoPin === "number" && echoPin >= 0 ? echoPin : null

    // Seed from explicit pins so `getState()` returns a usable snapshot even
    // before `attach()` runs (lets the inspector read distance ahead of the
    // first sketch run and simplifies unit tests).
    this.trigPin = this.explicitTrig
    this.echoPin = this.explicitEcho
    if (this.trigPin !== null) this._watchedPins.add(this.trigPin)

    if (typeof component.properties?.distanceCm === "number") {
      this.distanceCm = component.properties.distanceCm
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx

    if (this.trigPin === null) {
      this.trigPin = findArduinoPinForComponentPin(this.component, "trigger", ctx.wires)
    }
    if (this.echoPin === null) {
      this.echoPin = findArduinoPinForComponentPin(this.component, "echo", ctx.wires)
    }

    if (this.trigPin !== null) this._watchedPins.add(this.trigPin)
    // Echo is OUTPUT from this peripheral's perspective — we drive it, not
    // watch it — so it does NOT go in watchedPins.
  }

  /**
   * External driver — ray-cast against the canvas environment. Pass `null`
   * when the ray misses or exceeds sensor range so the peripheral stops
   * emitting echo pulses and `pulseIn()` returns 0 (timeout), matching a
   * real HC-SR04.
   */
  setDistance(cm: number | null): void {
    if (cm === null) {
      if (this.distanceCm !== null) {
        this.distanceCm = null
        this.trace({
          simMs: 0,
          kind: "write",
          message: "setDistance null (out of range)",
        })
      }
      return
    }
    const clamped = Math.max(MIN_DISTANCE_CM, Math.min(MAX_DISTANCE_CM, cm))
    if (clamped === this.distanceCm) return
    this.distanceCm = clamped
    this.trace({
      simMs: 0,
      kind: "write",
      message: `setDistance ${clamped} cm`,
      detail: { distanceCm: clamped },
    })
  }

  onPinEdge(edge: PinEdge): void {
    if (edge.pin !== this.trigPin) return

    if (edge.value === 1) {
      this.trigHighAtSimMs = edge.simMs
      this.awaitingEcho = true
      return
    }

    // Falling edge of trig
    if (!this.awaitingEcho) return
    this.awaitingEcho = false
    const pulseUs = (edge.simMs - this.trigHighAtSimMs) * 1000
    if (pulseUs < MIN_TRIG_PULSE_US) {
      this.trace({
        simMs: edge.simMs,
        kind: "warn",
        message: `trig pulse ${pulseUs.toFixed(1)}µs < ${MIN_TRIG_PULSE_US}µs — ignored`,
        detail: { pulseUs },
      })
      return
    }
    if (this.echoPin === null) {
      this.trace({
        simMs: edge.simMs,
        kind: "warn",
        message: "echo pin not wired — no response scheduled",
      })
      return
    }

    // No object in ray-cast range → skip echo entirely so pulseIn() times
    // out and returns 0, matching a real HC-SR04.
    if (this.distanceCm === null) {
      this.lastPulseUs = 0
      this.trace({
        simMs: edge.simMs,
        kind: "derive",
        message: "trig ok but nothing in range — no echo",
        detail: { trigPulseUs: pulseUs },
      })
      return
    }

    const echoPulseMs = (this.distanceCm * US_PER_CM) / 1000
    const startMs = edge.simMs + SENSOR_PROCESSING_MS
    const endMs = startMs + echoPulseMs
    this.ctx?.scheduleEdge(this.echoPin, 1, startMs)
    this.ctx?.scheduleEdge(this.echoPin, 0, endMs)
    this.lastPulseUs = this.distanceCm * US_PER_CM
    this.trace({
      simMs: edge.simMs,
      kind: "derive",
      message: `trig ok → echo HIGH ${echoPulseMs.toFixed(3)}ms @ ${this.distanceCm}cm`,
      detail: {
        trigPulseUs: pulseUs,
        echoPulseUs: this.distanceCm * US_PER_CM,
        distanceCm: this.distanceCm,
      },
    })
  }

  onTick(_simMs: number): void { /* no-op; edges are scheduled by the bus */ }

  getState(): Readonly<UltrasonicStateShape> | null {
    if (this.trigPin === null && this.echoPin === null) return null
    return {
      kind: "ultrasonic",
      trigPin: this.trigPin,
      echoPin: this.echoPin,
      distanceCm: this.distanceCm,
      lastPulseUs: this.lastPulseUs,
    }
  }

  reset(): void {
    this.awaitingEcho = false
    this.trigHighAtSimMs = 0
    this.lastPulseUs = 0
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

export function createUltrasonicPeripheral(component: BoardComponent): UltrasonicPeripheral {
  return new UltrasonicPeripheral(component)
}
