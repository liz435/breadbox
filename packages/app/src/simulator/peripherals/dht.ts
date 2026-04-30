// ── DhtPeripheral ──────────────────────────────────────────────────────────
//
// Simulates a DHT11 (or DHT22) humidity + temperature sensor in AVR mode.
// Protocol is the standard one-wire DHT:
//
//   1. MCU pulls signal LOW for ≥1 ms (DHT22) or ≥18 ms (DHT11), then
//      releases to INPUT_PULLUP.
//   2. Sensor waits ~40 µs, then emits an 80 µs LOW + 80 µs HIGH presence.
//   3. Sensor transmits 40 bits: each bit is 50 µs LOW + (26 µs HIGH = 0,
//      70 µs HIGH = 1).
//   4. Line floats HIGH via the pullup after the frame ends.
//
// The peripheral schedules the response edges via bus.scheduleEdge, so the
// AVR-compiled DHT library sees the same microsecond timing a real sensor
// would produce. Temperature + humidity come from the inspector.
//
// Variant: DHT11 encodes each byte as integer (humidity_int, 0, temp_int,
// 0, checksum). DHT22 encodes humidity_x10 and temp_x10 as 16-bit big-
// endian words. We pick based on `component.properties.variant` and default
// to DHT11.

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

// Protocol timings — all in ms (sub-ms precision via scheduler chunks).
const MIN_START_PULSE_MS = 0.8           // tolerate any LOW ≥ this
const RESPONSE_DELAY_MS = 0.04           // 40 µs after MCU release
const PRESENCE_LOW_MS = 0.08             // 80 µs LOW
const PRESENCE_HIGH_MS = 0.08            // 80 µs HIGH
const BIT_LOW_MS = 0.05                  // 50 µs LOW between each bit
const BIT_HIGH_ZERO_MS = 0.026           // 26 µs HIGH = 0
const BIT_HIGH_ONE_MS = 0.07             // 70 µs HIGH = 1

const TRACE_RING_SIZE = 32

/** Build the 5-byte frame, returning [b0, b1, b2, b3, checksum]. */
function buildFrame(variant: "dht11" | "dht22", temperatureC: number, humidity: number): [number, number, number, number, number] {
  let b0: number, b1: number, b2: number, b3: number
  if (variant === "dht22") {
    const h10 = Math.max(0, Math.min(1000, Math.round(humidity * 10)))
    // Temp encoding: MSB is the sign bit; magnitude in the remaining 15.
    const tMag = Math.round(Math.abs(temperatureC) * 10)
    const tSign = temperatureC < 0 ? 0x80 : 0x00
    b0 = (h10 >> 8) & 0xff
    b1 = h10 & 0xff
    b2 = (tSign | ((tMag >> 8) & 0x7f)) & 0xff
    b3 = tMag & 0xff
  } else {
    // DHT11: integer humidity / integer temp, second byte of each pair = 0.
    b0 = Math.max(0, Math.min(100, Math.round(humidity))) & 0xff
    b1 = 0
    b2 = Math.max(0, Math.min(50, Math.round(temperatureC))) & 0xff
    b3 = 0
  }
  const checksum = (b0 + b1 + b2 + b3) & 0xff
  return [b0, b1, b2, b3, checksum]
}

type DhtStateShape = Extract<PeripheralState, { kind: "dht" }>

export class DhtPeripheral implements Peripheral<DhtStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "dht_sensor"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "analogSensor",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private readonly explicitSignal: number | null
  private readonly variant: "dht11" | "dht22"

  private signalPin: number | null = null
  private temperatureC = 22
  private humidity = 50

  // Start-signal detection state.
  private trigLowAtSimMs = 0
  private awaitingRelease = false
  // While the peripheral is emitting a response frame, ignore further
  // start-signal attempts (real DHT wouldn't respond mid-frame anyway).
  private frameBusy = false

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    const explicit = component.pins?.signal ?? component.pins?.data
    this.explicitSignal = typeof explicit === "number" && explicit >= 0 ? explicit : null
    this.variant = component.properties?.variant === "dht22" ? "dht22" : "dht11"

    const t = component.properties?.temperature
    if (typeof t === "number") this.temperatureC = t
    const h = component.properties?.humidity
    if (typeof h === "number") this.humidity = h

    if (this.explicitSignal !== null) {
      this.signalPin = this.explicitSignal
      this._watchedPins.add(this.explicitSignal)
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    if (this.signalPin === null) {
      const resolved = findArduinoPinForComponentPin(this.component, ["data", "signal"], ctx.wires)
      if (resolved !== null) {
        this.signalPin = resolved
        this._watchedPins.add(resolved)
      }
    }
  }

  /** External driver — inspector slider / live environment update. */
  setReading(temperatureC: number, humidity: number): void {
    const t = Math.max(-40, Math.min(80, temperatureC))
    const h = Math.max(0, Math.min(100, humidity))
    if (t === this.temperatureC && h === this.humidity) return
    this.temperatureC = t
    this.humidity = h
    this.trace({
      simMs: 0,
      kind: "write",
      message: `setReading ${t}°C ${h}%`,
      detail: { temperatureC: t, humidity: h },
    })
  }

  onPinEdge(edge: PinEdge): void {
    if (edge.pin !== this.signalPin) return
    if (this.frameBusy) return

    if (edge.value === 0) {
      // Start of a potential start-signal LOW pulse.
      this.trigLowAtSimMs = edge.simMs
      this.awaitingRelease = true
      return
    }

    // Rising edge — could be the MCU releasing after a LOW pulse, or just
    // a normal HIGH transition. Check duration of preceding LOW.
    if (!this.awaitingRelease) return
    this.awaitingRelease = false
    const lowMs = edge.simMs - this.trigLowAtSimMs
    if (lowMs < MIN_START_PULSE_MS) {
      this.trace({
        simMs: edge.simMs,
        kind: "warn",
        message: `start LOW ${lowMs.toFixed(2)}ms < ${MIN_START_PULSE_MS}ms — ignored`,
      })
      return
    }

    this.scheduleResponse(edge.simMs)
  }

  private scheduleResponse(fromSimMs: number): void {
    if (!this.ctx || this.signalPin === null) return
    this.frameBusy = true
    const [b0, b1, b2, b3, checksum] = buildFrame(this.variant, this.temperatureC, this.humidity)
    const bytes = [b0, b1, b2, b3, checksum]

    // Response starts after 40µs of line release.
    let t = fromSimMs + RESPONSE_DELAY_MS

    // Presence pulse: 80µs LOW + 80µs HIGH.
    this.ctx.scheduleEdge(this.signalPin, 0, t)
    t += PRESENCE_LOW_MS
    this.ctx.scheduleEdge(this.signalPin, 1, t)
    t += PRESENCE_HIGH_MS

    // 40 data bits, MSB first per byte.
    for (const byte of bytes) {
      for (let bit = 7; bit >= 0; bit--) {
        const is1 = (byte >> bit) & 1
        this.ctx.scheduleEdge(this.signalPin, 0, t)
        t += BIT_LOW_MS
        this.ctx.scheduleEdge(this.signalPin, 1, t)
        t += is1 ? BIT_HIGH_ONE_MS : BIT_HIGH_ZERO_MS
      }
    }

    // End of frame — line goes LOW briefly then pullup releases HIGH.
    this.ctx.scheduleEdge(this.signalPin, 0, t)
    t += 0.05
    this.ctx.scheduleEdge(this.signalPin, 1, t)

    const frameEnd = t
    this.trace({
      simMs: fromSimMs,
      kind: "derive",
      message: `${this.variant} frame @ ${this.temperatureC}°C ${this.humidity}% (ends at ${frameEnd.toFixed(2)}ms)`,
      detail: {
        variant: this.variant,
        temperatureC: this.temperatureC,
        humidity: this.humidity,
        byte0: b0,
        byte1: b1,
        byte2: b2,
        byte3: b3,
        checksum,
      },
    })

    // Release the busy flag at frame-end so a follow-up read can trigger
    // a new response. onTick checks this deadline.
    this.frameReleaseAtSimMs = frameEnd + 1
  }

  private frameReleaseAtSimMs = 0

  onTick(simMs: number): void {
    if (this.frameBusy && this.frameReleaseAtSimMs > 0 && simMs >= this.frameReleaseAtSimMs) {
      this.frameBusy = false
      this.frameReleaseAtSimMs = 0
    }
  }

  getState(): Readonly<DhtStateShape> | null {
    if (this.signalPin === null) return null
    return {
      kind: "dht",
      signalPin: this.signalPin,
      temperatureC: this.temperatureC,
      humidity: this.humidity,
    }
  }

  reset(): void {
    this.trigLowAtSimMs = 0
    this.awaitingRelease = false
    this.frameBusy = false
    this.frameReleaseAtSimMs = 0
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

export function createDhtPeripheral(component: BoardComponent): DhtPeripheral {
  return new DhtPeripheral(component)
}
