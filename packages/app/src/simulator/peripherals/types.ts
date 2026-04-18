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
  | { kind: "raw"; componentType: ComponentType }

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
