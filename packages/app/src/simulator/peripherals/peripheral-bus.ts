// ── PeripheralBus ──────────────────────────────────────────────────────────
//
// Owns every Peripheral instance for a running sim. Dispatches pin edges to
// peripherals watching those pins. Aggregates state snapshots for the React
// bridge. Exposed via vm.getPeripheralBus() so both the AVR path (raw edges)
// and the transpile stdlib (explicit API calls) route through the same
// instance.

import type { AVRTWI } from "avr8js"
import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import type { PinStateStore } from "../pin-state-store"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralFactory,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
  TwiSlaveHandler,
} from "./types"
import { getCustomDef } from "@/components/catalog/custom-store"
import { isStrictHardwareEnabled } from "../strict-hardware-flag"
import { createServoPeripheral } from "./servo"
import { createBuzzerPeripheral } from "./buzzer"
import { createLcdPeripheral } from "./lcd"
import { createUltrasonicPeripheral } from "./ultrasonic"
import { createDhtPeripheral } from "./dht"
import { createIrReceiverPeripheral } from "./ir-receiver"
import { createOledPeripheral } from "./ssd1306-oled"
import { createNeoPixelPeripheral } from "./neopixel"
import { createShiftRegisterPeripheral } from "./shift-register"
import { createStepperPeripheral } from "./stepper"

const FACTORIES = new Map<ComponentType, PeripheralFactory>()

function registerPeripheralFactory(
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
registerPeripheralFactory("oled_display", createOledPeripheral)
registerPeripheralFactory("neopixel", createNeoPixelPeripheral)
registerPeripheralFactory("shift_register", createShiftRegisterPeripheral)
registerPeripheralFactory("stepper_motor", createStepperPeripheral)

export type PeripheralBoardInput = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  pinStore: PinStateStore
  /**
   * Optional TWI peripheral from the AVR runner. When present, the bus
   * installs a single eventHandler that demuxes by slave address; when
   * absent (transpile mode), `attachTwi` calls throw.
   *
   * NOTE: must be the CURRENT TWI instance — the AVR runner re-creates it
   * on every reset(), so callers MUST refetch via runner.getTwi() and
   * re-call attachBoard after each reset.
   */
  twi?: AVRTWI
}

type ScheduledEdge = {
  pin: number
  value: 0 | 1
  atSimMs: number
}

export type PeripheralAttachSkip = {
  componentId: string
  componentType: string
  reason: string
}

export class PeripheralBus {
  private peripherals = new Map<string, Peripheral>()
  private byPin = new Map<number, Set<Peripheral>>()
  /** Keyed by componentType — a built-in ComponentType or a "custom:<id>" string. */
  private byType = new Map<string, Set<Peripheral>>()
  /** Components whose peripheral failed to attach in the last attachBoard. */
  private skips: PeripheralAttachSkip[] = []
  private traces: PeripheralTrace[] = []
  private readonly traceRingSize = 256
  /** Sorted ascending by atSimMs — head is the next edge to fire. */
  private scheduledEdges: ScheduledEdge[] = []
  private boardPinStore: { writeExternal: (pin: number, changes: { digitalValue: 0 | 1 }) => void } | null = null
  /** Latest AVR sim time seen via flush/tick — the resume point peripherals
   *  base self-timed frames on (see PeripheralContext.nowSimMs). */
  private lastSimMs = 0

  // ── TWI demux state ────────────────────────────────────────────────────
  private twi: AVRTWI | null = null
  /** All handlers per 7-bit address. >1 entry = an address collision, which
   *  strict hardware mode simulates (wired-AND bus corruption) instead of
   *  refusing to attach. */
  private slavesByAddr = new Map<number, TwiSlaveHandler[]>()
  private currentSlaves: TwiSlaveHandler[] = []
  /** Addresses with more than one device attached (strict mode only). */
  private collidedAddresses = new Set<number>()

  /** Re-create peripherals from the current board state. Call on sim start. */
  attachBoard(input: PeripheralBoardInput): void {
    this.detachBoard()
    this.skips = []
    this.boardPinStore = input.pinStore
    this.twi = input.twi ?? null
    if (this.twi) this.installTwiEventHandler(this.twi)
    for (const component of Object.values(input.components)) {
      try {
        // Built-in factory first; custom parts carry their own factory on the
        // runtime definition (compiled from the DSL's behavior.signals facet).
        const factory = FACTORIES.get(component.type as ComponentType)
        const peripheral = factory
          ? factory(component)
          : getCustomDef(component.type)?.createPeripheral?.(component)
        if (!peripheral) continue
        peripheral.attach({
          componentId: component.id,
          component,
          wires: input.wires,
          pinStore: input.pinStore,
          trace: (entry) => this.recordTrace(component.id, entry),
          scheduleEdge: (pin, value, atSimMs) => this.scheduleEdge(pin, value, atSimMs),
          nowSimMs: () => this.lastSimMs,
          attachTwi: (addr, handler) => this.attachTwi(addr, handler),
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
      } catch (err) {
        // One peripheral that can't initialise must not take down the whole
        // board. The common case is an I²C device (OLED/LCD) on a runner with
        // no TWI bridge — attachTwi() throws (RP2040 today, and transpile
        // mode). Skip just that device (it renders its idle placeholder) and
        // keep the rest of the board live. Recorded in `attachSkips` so the
        // simulation loop can surface it to the user, not just the console.
        const reason = err instanceof Error ? err.message : String(err)
        this.skips.push({
          componentId: component.id,
          componentType: component.type,
          reason,
        })
        console.warn(
          `[peripheral-bus] skipped ${component.type} (${component.id}): ${reason}`,
        )
      }
    }
  }

  /** Components whose peripheral could not attach in the last attachBoard. */
  get attachSkips(): ReadonlyArray<PeripheralAttachSkip> {
    return this.skips
  }

  /** Tear down all peripherals. Call on sim stop/reset. */
  detachBoard(): void {
    for (const p of this.peripherals.values()) p.reset()
    this.skips = []
    this.peripherals.clear()
    this.byPin.clear()
    this.byType.clear()
    this.traces = []
    this.scheduledEdges = []
    this.boardPinStore = null
    this.slavesByAddr.clear()
    this.currentSlaves = []
    this.collidedAddresses.clear()
    this.twi = null
    this.lastSimMs = 0
  }

  // ── I²C slave registration & demux ─────────────────────────────────────

  /**
   * Register an I²C slave at `slaveAddr` (7-bit). Returns a detach function.
   * Throws if no TWI was passed to attachBoard — peripherals that opt in to
   * I²C only work in AVR mode.
   *
   * Address collisions: outside strict hardware mode a second device at the
   * same address refuses to attach (clear error at sim start). In strict
   * mode both attach and the bus corrupts realistically — every device at
   * the address receives writes, and reads are the wired-AND of all
   * responses (open-drain: any device driving a 0 wins the bit).
   */
  private attachTwi(slaveAddr: number, handler: TwiSlaveHandler): () => void {
    if (!this.twi) {
      throw new Error(
        `attachTwi(0x${slaveAddr.toString(16)}): TWI not wired into PeripheralBus. ` +
        `Pass runner.getTwi() into attachBoard (AVR mode only).`,
      )
    }
    const existing = this.slavesByAddr.get(slaveAddr) ?? []
    if (existing.length > 0) {
      if (!isStrictHardwareEnabled()) {
        throw new Error(
          `attachTwi(0x${slaveAddr.toString(16)}): another peripheral already owns this I²C address.`,
        )
      }
      this.collidedAddresses.add(slaveAddr)
      console.warn(
        `[peripheral-bus] I²C address collision at 0x${slaveAddr.toString(16)} — ` +
          `strict mode: bus responses are the wired-AND of all devices (corrupted reads).`,
      )
    }
    this.slavesByAddr.set(slaveAddr, [...existing, handler])
    return () => {
      const handlers = (this.slavesByAddr.get(slaveAddr) ?? []).filter((h) => h !== handler)
      if (handlers.length > 0) this.slavesByAddr.set(slaveAddr, handlers)
      else this.slavesByAddr.delete(slaveAddr)
      if (handlers.length < 2) this.collidedAddresses.delete(slaveAddr)
      this.currentSlaves = this.currentSlaves.filter((h) => h !== handler)
    }
  }

  /** I²C addresses currently shared by more than one device (strict mode). */
  get i2cAddressCollisions(): ReadonlyArray<number> {
    return Array.from(this.collidedAddresses)
  }

  private installTwiEventHandler(twi: AVRTWI): void {
    twi.eventHandler = {
      start: (repeated) => {
        // A repeated START keeps the current transaction's slaves selected —
        // real I²C uses it to switch direction without releasing the bus.
        // A fresh START clears the selection until the next address byte.
        if (!repeated) this.currentSlaves = []
        twi.completeStart()
      },
      stop: () => {
        const slaves = this.currentSlaves
        this.currentSlaves = []
        for (const s of slaves) s.onStop()
        twi.completeStop()
      },
      connectToSlave: (addr, _write) => {
        const slaves = this.slavesByAddr.get(addr) ?? []
        this.currentSlaves = [...slaves]
        // ACK if we have a slave at that address, NACK otherwise. Adafruit
        // ignores NACKs on its init burst so this mostly serves correctness
        // for sketches that probe the bus.
        twi.completeConnect(slaves.length > 0)
      },
      writeByte: (value) => {
        if (this.currentSlaves.length > 0) {
          // Open-drain ACK: any device pulling SDA low acks the byte.
          let anyAck = false
          for (const s of this.currentSlaves) {
            if (s.onWrite(value)) anyAck = true
          }
          twi.completeWrite(anyAck)
        } else {
          // Silent ack so a missing slave at the wrong address doesn't stall
          // the AVR's TWI state machine.
          twi.completeWrite(true)
        }
      },
      readByte: (_ack) => {
        // Wired-AND of every responding device: bits driven 0 by ANY device
        // read as 0. With one device this is just its byte; with a strict-
        // mode address collision it is the realistic corrupted read.
        let value = 0xff
        for (const s of this.currentSlaves) value &= s.onRead()
        twi.completeRead(value)
      },
    }
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
    this.lastSimMs = nowSimMs
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
    this.lastSimMs = simMs
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
