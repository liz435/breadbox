// ── RelayPeripheral ──────────────────────────────────────────────────────
//
// The coil remains an electrical load in the netlist. This peripheral owns
// the mechanical consequence of that load: a real relay does not move its
// contacts on the exact GPIO edge, and it releases immediately on brownout.

import type { BoardComponent, ComponentType } from "@dreamer/schemas"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"

const PULL_IN_DELAY_MS = 7
const DROP_OUT_DELAY_MS = 3

type RelayState = Extract<PeripheralState, { kind: "relay" }>

export class RelayPeripheral implements Peripheral<RelayState> {
  readonly id: string
  readonly componentType: ComponentType = "relay"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set(["requiresExternalPower"])
  private readonly component: BoardComponent
  private readonly watched = new Set<number>()
  private signalPin: number | null
  private energized = false
  private requested = false
  private powered = true
  private transitionAtMs: number | null = null
  private traces: PeripheralTrace[] = []
  private ctx: PeripheralContext | null = null

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    this.signalPin = typeof component.pins.out === "number" ? component.pins.out : null
    if (this.signalPin !== null && this.signalPin >= 0) this.watched.add(this.signalPin)
  }

  get watchedPins(): ReadonlySet<number> { return this.watched }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    if (this.signalPin === null) {
      this.signalPin = findArduinoPinForComponentPin(this.component, ["signal", "out"], ctx.wires)
      if (this.signalPin !== null) this.watched.add(this.signalPin)
    }
  }

  setPowered(powered: boolean): void {
    if (this.powered === powered) return
    this.powered = powered
    if (!powered) {
      this.energized = false
      this.requested = false
      this.transitionAtMs = null
    }
    this.trace(0, powered ? "coil supply restored" : "coil supply below pull-in voltage")
  }

  onPinEdge(edge: PinEdge): void {
    if (edge.pin !== this.signalPin) return
    const next = edge.value === 1 && this.powered
    if (next === this.requested && this.transitionAtMs !== null) return
    this.requested = next
    this.transitionAtMs = edge.simMs + (next ? PULL_IN_DELAY_MS : DROP_OUT_DELAY_MS)
    this.trace(edge.simMs, next ? "coil requested: pull-in delay" : "coil released: drop-out delay")
  }

  onTick(simMs: number): void {
    if (this.transitionAtMs === null || simMs < this.transitionAtMs) return
    this.transitionAtMs = null
    const next = this.powered && this.requested
    if (next === this.energized) return
    this.energized = next
    this.trace(simMs, next ? "contacts closed" : "contacts released")
  }

  getState(): Readonly<RelayState> | null {
    return { kind: "relay", signalPin: this.signalPin, energized: this.energized, pending: this.transitionAtMs !== null }
  }

  reset(): void {
    this.energized = false
    this.requested = false
    this.powered = true
    this.transitionAtMs = null
    this.traces = []
  }

  getTrace(): ReadonlyArray<PeripheralTrace> { return this.traces }

  private trace(simMs: number, message: string): void {
    const entry: PeripheralTrace = { ts: Date.now(), simMs, kind: "derive", message }
    this.traces.push(entry)
    if (this.traces.length > 32) this.traces = this.traces.slice(-32)
    this.ctx?.trace({ simMs, kind: "derive", message })
  }
}

export function createRelayPeripheral(component: BoardComponent): RelayPeripheral {
  return new RelayPeripheral(component)
}
