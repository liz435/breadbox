// ── ServoPeripheral ────────────────────────────────────────────────────────
//
// Handles both input paths in one place:
//   - Explicit `write(angle)` from the transpile-mode stdlib `Servo` class.
//   - 50Hz PWM pulse width measured from AVR pin edges.
// Emits `{ kind: "servo", pin, angle, attached }` state consumed by
// servo-renderer.tsx.

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
import { isComponentPowered } from "../power-availability"
import { powerModelFor } from "../power-model"

const SERVO_MIN_ANGLE = 0
const SERVO_MAX_ANGLE = 180

// Arduino Servo library pulse-width extremes.
const MIN_PULSE_US = 544
const MAX_PULSE_US = 2400

// Edge-pattern bounds for detecting "this is a servo frame" (vs audible tone
// or bit-banged traffic). 50Hz ± some tolerance, 0.4–2.6 ms HIGH pulse.
const FRAME_MIN_HZ = 30
const FRAME_MAX_HZ = 80
const PULSE_MIN_US = 400
const PULSE_MAX_US = 2600

// How long after the last edge we consider the PWM source silent. The AVR
// servo library stops driving the pin entirely when detached, so a quiet
// period of this duration flips the peripheral back to "no PWM signal".
const SILENCE_TIMEOUT_MS = 150
const SERVO_DEGREES_PER_SECOND = 300

const TRACE_RING_SIZE = 32

type ServoStateShape = Extract<PeripheralState, { kind: "servo" }>

export class ServoPeripheral implements Peripheral<ServoStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "servo"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "positionActuator",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private angle = 0
  private motionEndsAtSimMs = 0
  private moving = false
  private attached = false
  private powered = true
  private boundPin: number | null = null

  // AVR-path pulse-width measurement state.
  private lastRisingSimMs = 0
  private lastFallingSimMs = 0
  private lastPulseWidthUs = 0
  private lastEdgeSimMs = 0
  private edgeRing: number[] = []
  private ringWriteIdx = 0
  private ringCount = 0

  // Bounded trace buffer.
  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    const signal = component.pins?.signal
    if (typeof signal === "number" && signal >= 0) {
      this._watchedPins.add(signal)
      this.boundPin = signal
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    if (ctx.components) {
      this.powered = isComponentPowered(
        this.component, ctx.components, ctx.wires, powerModelFor(this.component.type),
      )
    }
    if (this.boundPin === null) {
      const resolved = findArduinoPinForComponentPin(this.component, "signal", ctx.wires)
      if (resolved !== null) {
        this.boundPin = resolved
        this._watchedPins.add(resolved)
      }
    }
  }

  /** The power domain is the authority after the first completed solve. */
  setPowered(powered: boolean): void {
    if (this.powered === powered) return
    this.powered = powered
    if (!powered) {
      // A depowered servo no longer holds its requested position. Preserve
      // the last angle for the renderer, but report it detached and discard
      // partial pulse timing so a brownout cannot manufacture a command when
      // power returns.
      this.attached = false
      this.lastRisingSimMs = 0
      this.ringCount = 0
      this.moving = false
    }
    this.trace({
      simMs: 0,
      kind: "derive",
      message: powered ? "supply restored" : "supply below operating voltage",
      detail: { powered },
    })
  }

  /** Transpile-mode call from the stdlib Servo.attach(pin). */
  onExplicitAttach(pin: number): void {
    if (pin < 0) return
    this.boundPin = pin
    this._watchedPins.clear()
    this._watchedPins.add(pin)
    this.attached = true
    this.trace({
      simMs: 0,
      kind: "write",
      message: `attach pin=${pin}`,
      detail: { pin },
    })
  }

  /** Transpile-mode call from the stdlib Servo.write(angle). */
  onExplicitWrite(angle: number): void {
    if (!this.powered) return
    const clamped = Math.max(SERVO_MIN_ANGLE, Math.min(SERVO_MAX_ANGLE, angle))
    const travelMs = Math.abs(clamped - this.angle) / SERVO_DEGREES_PER_SECOND * 1000
    this.angle = clamped
    this.moving = travelMs > 0
    this.motionEndsAtSimMs = (this.ctx?.nowSimMs() ?? 0) + travelMs
    if (this.boundPin !== null) this.attached = true
    this.trace({
      simMs: 0,
      kind: "write",
      message: `write angle=${clamped}`,
      detail: { angle: clamped, pin: this.boundPin },
    })
  }

  /** Transpile-mode call from the stdlib Servo.detach(). */
  onExplicitDetach(): void {
    this.attached = false
    this.trace({
      simMs: 0,
      kind: "write",
      message: "detach",
      detail: { pin: this.boundPin },
    })
  }

  isAttached(): boolean {
    return this.attached
  }

  onPinEdge(edge: PinEdge): void {
    if (!this.powered) return
    if (edge.pin !== this.boundPin && !this._watchedPins.has(edge.pin)) return
    if (this.boundPin === null) this.boundPin = edge.pin

    this.lastEdgeSimMs = edge.simMs
    if (edge.value === 1) {
      this.lastRisingSimMs = edge.simMs
    } else if (this.lastRisingSimMs > 0) {
      this.lastFallingSimMs = edge.simMs
      this.lastPulseWidthUs = (edge.simMs - this.lastRisingSimMs) * 1000
    }

    this.edgeRing[this.ringWriteIdx] = edge.simMs
    this.ringWriteIdx = (this.ringWriteIdx + 1) % 8
    if (this.ringCount < 8) this.ringCount++

    if (this.ringCount < 3) return
    const oldestIdx = this.ringCount < 8
      ? (this.ringWriteIdx - this.ringCount + 8) % 8
      : this.ringWriteIdx
    const oldest = this.edgeRing[oldestIdx]
    const elapsedMs = edge.simMs - oldest
    if (elapsedMs <= 0) return
    const periods = (this.ringCount - 1) / 2
    const freqHz = (periods * 1000) / elapsedMs

    if (
      freqHz < FRAME_MIN_HZ ||
      freqHz > FRAME_MAX_HZ ||
      this.lastPulseWidthUs < PULSE_MIN_US ||
      this.lastPulseWidthUs > PULSE_MAX_US
    ) {
      return
    }

    const span = MAX_PULSE_US - MIN_PULSE_US
    const clampedPulse = Math.max(
      MIN_PULSE_US,
      Math.min(MAX_PULSE_US, this.lastPulseWidthUs),
    )
    const angle = Math.round(((clampedPulse - MIN_PULSE_US) / span) * SERVO_MAX_ANGLE)
    if (this.angle !== angle) {
      const travelMs = Math.abs(angle - this.angle) / SERVO_DEGREES_PER_SECOND * 1000
      this.angle = angle
      this.attached = true
      this.moving = travelMs > 0
      this.motionEndsAtSimMs = edge.simMs + travelMs
      this.trace({
        simMs: edge.simMs,
        kind: "derive",
        message: `avr pulse → angle=${angle}`,
        detail: { pulseUs: Math.round(this.lastPulseWidthUs), freqHz: Math.round(freqHz * 10) / 10 },
      })
    }
  }

  onTick(simMs: number): void {
    if (this.moving && simMs >= this.motionEndsAtSimMs) this.moving = false
    // AVR-only: if the pin goes silent, treat the servo as still attached at
    // its last commanded angle (real servos hold position). No state change.
    if (this.lastEdgeSimMs === 0) return
    if (simMs - this.lastEdgeSimMs <= SILENCE_TIMEOUT_MS) return
    this.ringCount = 0
    this.ringWriteIdx = 0
  }

  getState(): Readonly<ServoStateShape> | null {
    if (this.boundPin === null) return null
    return {
      kind: "servo",
      pin: this.boundPin,
      angle: this.angle,
      attached: this.attached,
      moving: this.moving,
    }
  }

  reset(): void {
    this.angle = 0
    this.motionEndsAtSimMs = 0
    this.moving = false
    this.attached = false
    this.powered = true
    this.lastRisingSimMs = 0
    this.lastFallingSimMs = 0
    this.lastPulseWidthUs = 0
    this.lastEdgeSimMs = 0
    this.edgeRing = []
    this.ringWriteIdx = 0
    this.ringCount = 0
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

export function createServoPeripheral(component: BoardComponent): ServoPeripheral {
  return new ServoPeripheral(component)
}
