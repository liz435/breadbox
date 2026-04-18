// ── PeripheralBus ──────────────────────────────────────────────────────────
//
// Owns every Peripheral instance for a running sim. Dispatches pin edges to
// peripherals watching those pins. Aggregates state snapshots for the React
// bridge. Exposed via vm.getPeripheralBus() so both the AVR path (raw edges)
// and the transpile stdlib (explicit API calls) route through the same
// instance.

import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import type { PinStateStore } from "../pin-state-store"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralFactory,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"
import { createServoPeripheral } from "./servo"
import { createBuzzerPeripheral } from "./buzzer"
import { createLcdPeripheral } from "./lcd"
import { createUltrasonicPeripheral } from "./ultrasonic"
import { createDhtPeripheral } from "./dht"
import { createIrReceiverPeripheral } from "./ir-receiver"

const FACTORIES = new Map<ComponentType, PeripheralFactory>()

export function registerPeripheralFactory(
  type: ComponentType,
  factory: PeripheralFactory,
): void {
  FACTORIES.set(type, factory)
}

// Built-in registrations.
registerPeripheralFactory("servo", createServoPeripheral)
registerPeripheralFactory("buzzer", createBuzzerPeripheral)
registerPeripheralFactory("lcd_16x2", createLcdPeripheral)
registerPeripheralFactory("ultrasonic_sensor", createUltrasonicPeripheral)
registerPeripheralFactory("dht_sensor", createDhtPeripheral)
registerPeripheralFactory("ir_receiver", createIrReceiverPeripheral)

export type PeripheralBoardInput = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  pinStore: PinStateStore
}

type ScheduledEdge = {
  pin: number
  value: 0 | 1
  atSimMs: number
}

export class PeripheralBus {
  private peripherals = new Map<string, Peripheral>()
  private byPin = new Map<number, Set<Peripheral>>()
  private byType = new Map<ComponentType, Set<Peripheral>>()
  private traces: PeripheralTrace[] = []
  private readonly traceRingSize = 256
  /** Sorted ascending by atSimMs — head is the next edge to fire. */
  private scheduledEdges: ScheduledEdge[] = []
  private boardPinStore: { writeExternal: (pin: number, changes: { digitalValue: 0 | 1 }) => void } | null = null

  /** Re-create peripherals from the current board state. Call on sim start. */
  attachBoard(input: PeripheralBoardInput): void {
    this.detachBoard()
    this.boardPinStore = input.pinStore
    for (const component of Object.values(input.components)) {
      const factory = FACTORIES.get(component.type as ComponentType)
      if (!factory) continue
      const peripheral = factory(component)
      peripheral.attach({
        componentId: component.id,
        component,
        wires: input.wires,
        pinStore: input.pinStore,
        trace: (entry) => this.recordTrace(component.id, entry),
        scheduleEdge: (pin, value, atSimMs) => this.scheduleEdge(pin, value, atSimMs),
      })
      this.peripherals.set(component.id, peripheral)
      const typeBucket = this.byType.get(peripheral.componentType) ?? new Set()
      typeBucket.add(peripheral)
      this.byType.set(peripheral.componentType, typeBucket)
      for (const pin of peripheral.watchedPins) {
        const bucket = this.byPin.get(pin) ?? new Set()
        bucket.add(peripheral)
        this.byPin.set(pin, bucket)
      }
    }
  }

  /** Tear down all peripherals. Call on sim stop/reset. */
  detachBoard(): void {
    for (const p of this.peripherals.values()) p.reset()
    this.peripherals.clear()
    this.byPin.clear()
    this.byType.clear()
    this.traces = []
    this.scheduledEdges = []
    this.boardPinStore = null
  }

  /**
   * Queue a pin-edge write to be applied when the AVR's simulated clock
   * reaches `atSimMs`. Insertion keeps the queue sorted.
   */
  scheduleEdge(pin: number, value: 0 | 1, atSimMs: number): void {
    const entry: ScheduledEdge = { pin, value, atSimMs }
    let lo = 0
    let hi = this.scheduledEdges.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.scheduledEdges[mid].atSimMs <= atSimMs) lo = mid + 1
      else hi = mid
    }
    this.scheduledEdges.splice(lo, 0, entry)
  }

  /**
   * Fire all scheduled edges with `atSimMs <= nowSimMs` by writing to the
   * pin store (which forwards to the AVR runner in AVR mode).
   */
  flushScheduledEdges(nowSimMs: number): void {
    if (this.scheduledEdges.length === 0 || !this.boardPinStore) return
    while (
      this.scheduledEdges.length > 0 &&
      this.scheduledEdges[0].atSimMs <= nowSimMs
    ) {
      const edge = this.scheduledEdges.shift()!
      this.boardPinStore.writeExternal(edge.pin, { digitalValue: edge.value })
    }
  }

  /** Number of edges still waiting to fire — used by tests + diagnostics. */
  get scheduledEdgeCount(): number {
    return this.scheduledEdges.length
  }

  /** Fan-out an edge to peripherals watching that pin. */
  dispatchEdge(edge: PinEdge): void {
    const bucket = this.byPin.get(edge.pin)
    if (!bucket) return
    for (const p of bucket) p.onPinEdge(edge)
  }

  /** Periodic heartbeat (silence timeouts, housekeeping). */
  tick(simMs: number): void {
    for (const p of this.peripherals.values()) p.onTick(simMs)
  }

  /** Look up a peripheral by componentId. */
  get(componentId: string): Peripheral | undefined {
    return this.peripherals.get(componentId)
  }

  /** Find a peripheral of a given type whose watchedPins include `pin`. */
  findByTypeOnPin(type: ComponentType, pin: number): Peripheral | undefined {
    const bucket = this.byType.get(type)
    if (!bucket) return undefined
    for (const p of bucket) {
      if (p.watchedPins.has(pin)) return p
    }
    return undefined
  }

  /**
   * Register a peripheral with a dynamic pin binding. Used by stdlib classes
   * that create devices at runtime without a corresponding BoardComponent
   * (e.g. a sketch using `Servo` with no servo placed on the board).
   */
  addDynamicPeripheral(peripheral: Peripheral): void {
    this.peripherals.set(peripheral.id, peripheral)
    const typeBucket = this.byType.get(peripheral.componentType) ?? new Set()
    typeBucket.add(peripheral)
    this.byType.set(peripheral.componentType, typeBucket)
    for (const pin of peripheral.watchedPins) {
      const bucket = this.byPin.get(pin) ?? new Set()
      bucket.add(peripheral)
      this.byPin.set(pin, bucket)
    }
  }

  /** Update the pin index for a peripheral whose watchedPins changed. */
  rebindPeripheralPins(peripheral: Peripheral): void {
    for (const bucket of this.byPin.values()) bucket.delete(peripheral)
    for (const pin of peripheral.watchedPins) {
      const bucket = this.byPin.get(pin) ?? new Set()
      bucket.add(peripheral)
      this.byPin.set(pin, bucket)
    }
  }

  /**
   * Snapshot of all peripheral states keyed by componentId. Peripherals that
   * return null (not yet active) are omitted.
   */
  snapshot(): Record<string, PeripheralState> {
    const out: Record<string, PeripheralState> = {}
    for (const [id, p] of this.peripherals) {
      const s = p.getState()
      if (s !== null) out[id] = s
    }
    return out
  }

  /** Collect all traces (bounded) for the debug panel. */
  getAllTraces(): ReadonlyArray<PeripheralTrace> {
    return this.traces
  }

  /** Iterate peripherals that declare a capability. */
  *findByCapability(capability: PeripheralCapability): Iterable<Peripheral> {
    for (const p of this.peripherals.values()) {
      if (p.capabilities.has(capability)) yield p
    }
  }

  private recordTrace(
    componentId: string,
    entry: Omit<PeripheralTrace, "ts">,
  ): void {
    this.traces.push({
      ...entry,
      ts: Date.now(),
      message: `[${componentId}] ${entry.message}`,
    })
    if (this.traces.length > this.traceRingSize) {
      this.traces = this.traces.slice(-this.traceRingSize)
    }
  }
}
