// ── DC motor mechanical state ────────────────────────────────────────────
// A compact first-order rotor model. Electrical elements remain in the
// netlist; this state returns a bounded back-EMF fraction to that model.

import type { BoardComponent, ComponentType } from "@dreamer/schemas"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"
import type { Peripheral, PeripheralCapability, PeripheralContext, PeripheralState, PeripheralTrace, PinEdge } from "./types"

const MOTOR_TIME_CONSTANT_MS = 120
type MotorState = Extract<PeripheralState, { kind: "dc_motor" }>

export class DcMotorPeripheral implements Peripheral<MotorState> {
  readonly id: string
  readonly componentType: ComponentType = "dc_motor"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set(["positionActuator", "requiresExternalPower"])
  private readonly component: BoardComponent
  private readonly watched = new Set<number>()
  private pin: number | null
  private requested = 0
  private speed = 0
  private powered = true
  private lastTickMs: number | null = null

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    this.pin = typeof component.pins.signal === "number" ? component.pins.signal : null
    if (this.pin !== null && this.pin >= 0) this.watched.add(this.pin)
  }

  get watchedPins(): ReadonlySet<number> { return this.watched }
  attach(ctx: PeripheralContext): void {
    if (this.pin === null) {
      this.pin = findArduinoPinForComponentPin(this.component, "signal", ctx.wires)
      if (this.pin !== null) this.watched.add(this.pin)
    }
  }
  /** Losing supply removes the torque, not the rotor's momentum: drop the
   * request and let onTick decay speed through the time constant. Zeroing
   * speed here would make a sagging rail read as an instant mechanical stop. */
  setPowered(powered: boolean): void {
    this.powered = powered
    if (!powered) this.requested = 0
  }
  onPinEdge(edge: PinEdge): void {
    if (edge.pin !== this.pin) return
    this.requested = this.powered && edge.value === 1 ? 1 : 0
  }
  onTick(simMs: number): void {
    if (this.lastTickMs === null) { this.lastTickMs = simMs; return }
    const dt = Math.max(0, simMs - this.lastTickMs)
    this.lastTickMs = simMs
    const target = this.powered ? this.requested : 0
    const blend = 1 - Math.exp(-dt / MOTOR_TIME_CONSTANT_MS)
    this.speed += (target - this.speed) * blend
    if (Math.abs(this.speed) < 1e-5) this.speed = 0
  }
  getState(): Readonly<MotorState> | null {
    return { kind: "dc_motor", pin: this.pin, speed: this.speed, moving: this.speed > 0.01 }
  }
  reset(): void { this.requested = 0; this.speed = 0; this.powered = true; this.lastTickMs = null }
  getTrace(): ReadonlyArray<PeripheralTrace> { return [] }
}

export function createDcMotorPeripheral(component: BoardComponent): DcMotorPeripheral {
  return new DcMotorPeripheral(component)
}
