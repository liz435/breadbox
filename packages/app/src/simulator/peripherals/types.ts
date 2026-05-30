// ── Peripheral Contract ────────────────────────────────────────────────────
//
// One interface for every simulated board component. Both transpile-mode
// (stdlib classes) and AVR-mode (compiled pin traffic) funnel into the same
// Peripheral instances so there is a single source of truth per device.

import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import type { PinStateStore } from "../pin-state-store"

export type PeripheralCapability =
  | "soundSource"
  | "positionActuator"
  | "displaySink"
  | "lightEmitter"
  | "analogSensor"
  | "digitalSensor"
  | "requiresExternalPower"

export type PinEdge = {
  pin: number
  value: 0 | 1
  /** Simulated MCU time in milliseconds — NOT performance.now(). */
  simMs: number
  source: "transpile" | "avr" | "external"
}

export type PeripheralState =
  | { kind: "servo"; pin: number; angle: number; attached: boolean }
  | { kind: "buzzer"; pin: number; frequencyHz: number | null; playing: boolean }
  | { kind: "led"; pin: number; brightness: number }
  | { kind: "rgb_led"; pins: { r: number; g: number; b: number }; brightness: { r: number; g: number; b: number } }
  | { kind: "lcd"; cols: number; rows: number; textBuffer: string[] }
  | { kind: "neopixel"; pin: number; pixels: ReadonlyArray<{ r: number; g: number; b: number }> }
  | { kind: "ultrasonic"; trigPin: number | null; echoPin: number | null; distanceCm: number | null; lastPulseUs: number }
  | { kind: "dht"; signalPin: number | null; temperatureC: number; humidity: number }
  | { kind: "ir_receiver"; signalPin: number | null; lastCode: number | null; transmitting: boolean }
  | { kind: "oled"; width: number; height: number; on: boolean; inverted: boolean; framebuffer: number[] }
  | { kind: "shift_register"; data: number | null; clock: number | null; latch: number | null; outputs: boolean[] }
  | { kind: "raw"; componentType: ComponentType }

/**
 * Transaction-scoped I²C slave handler. The bus owns the master-side state
 * (currentSlave, etc) and forwards per-transaction events here. There is no
 * `onStart` because avr8js fires START bus-wide before the slave address is
 * known — the bus dispatches per-slave only after `connectToSlave`.
 *
 * The handler returns ack/data values; the bus is responsible for calling
 * `twi.completeWrite(ack)` / `twi.completeRead(byte)` to close the loop.
 */
export type TwiSlaveHandler = {
  /** Master sent a data byte. Return true to ACK, false to NACK. */
  onWrite(byte: number): boolean
  /** Master expects a byte from us. Return the byte to send. */
  onRead(): number
  /** STOP condition closed the transaction. Reset transaction-scoped state. */
  onStop(): void
}

export type PeripheralTrace = {
  ts: number
  simMs: number
  kind: "edge" | "write" | "derive" | "warn"
  message: string
  detail?: Readonly<Record<string, number | string | boolean | null>>
}

export type PeripheralContext = {
  componentId: string
  component: BoardComponent
  wires: Record<string, Wire>
  pinStore: PinStateStore
  trace: (entry: Omit<PeripheralTrace, "ts">) => void
  /**
   * Schedule a future pin edge driven by this peripheral. Fires when the
   * AVR's simulated clock reaches `atSimMs`. Used by sensors that generate
   * timed responses (ultrasonic echo, DHT frame, IR NEC envelope).
   */
  scheduleEdge: (pin: number, value: 0 | 1, atSimMs: number) => void
  /**
   * The AVR's current simulated time (ms) — the point execution will resume
   * from on the next run-loop step. Peripherals that emit a self-timed frame
   * in response to an *external* event (not a pin edge), like the IR receiver
   * reacting to a remote press, must base their `scheduleEdge` times on this
   * so the frame unfolds in the future instead of collapsing into one flush.
   */
  nowSimMs: () => number
  /**
   * Register an I²C slave handler at `slaveAddr` (7-bit). Throws if the AVR
   * runner didn't wire TWI into the bus — peripherals that opt in to I²C
   * must be running in AVR mode. Returns a detach function; called by the
   * bus on `detachBoard`, but peripherals can also call it from `reset()`.
   */
  attachTwi: (slaveAddr: number, handler: TwiSlaveHandler) => () => void
}

export interface Peripheral<S extends PeripheralState = PeripheralState> {
  readonly id: string
  readonly componentType: ComponentType
  readonly capabilities: ReadonlySet<PeripheralCapability>
  readonly watchedPins: ReadonlySet<number>
  attach(ctx: PeripheralContext): void
  onPinEdge(edge: PinEdge): void
  onTick(simMs: number): void
  getState(): Readonly<S> | null
  reset(): void
  getTrace(): ReadonlyArray<PeripheralTrace>
}

export type PeripheralFactory = (component: BoardComponent) => Peripheral
