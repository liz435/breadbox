// ── BuzzerPeripheral ───────────────────────────────────────────────────────
//
// Owns audio-source behavior for a single buzzer component. Accepts both:
//   - Explicit `tone(freq, duration)` / `noTone()` from the transpile stdlib.
//   - AVR pin-edge traffic (compiled tone() via Timer2, analogWrite PWM).
// Emits `{ kind: "buzzer", pin, frequencyHz, playing }` state that the UI's
// Web Audio layer consumes to start/stop oscillators.

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

const AUDIBLE_MIN_HZ = 20
const AUDIBLE_MAX_HZ = 20_000

// An ACTIVE buzzer has an internal oscillator: it beeps at its own fixed
// pitch whenever the pin is driven HIGH (steady DC — no toggling required),
// and ignores the drive frequency entirely. ~2.3kHz is the typical pitch of
// a 5V active buzzer module.
const ACTIVE_BUZZER_HZ = 2300
// How long an active buzzer keeps sounding after the last HIGH level/edge —
// long enough that square-wave drive (tone() on an active buzzer) sustains,
// short enough that digitalWrite(LOW) reads as an immediate stop.
const ACTIVE_OFF_DELAY_MS = 20

// Require a sustained ring of edges before believing it's a tone — prevents
// brief bursts (shiftOut, bit-banged SPI) from misfiring.
const EDGE_RING_SIZE = 8

// Treat the pin as silent if no edges arrive within this simulated window.
const SILENCE_TIMEOUT_MS = 150

// 10% change threshold before re-emitting a different frequency, so small
// detection jitter doesn't spam downstream listeners.
const FREQ_CHANGE_THRESHOLD = 0.1

const TRACE_RING_SIZE = 32

type BuzzerStateShape = Extract<PeripheralState, { kind: "buzzer" }>

export class BuzzerPeripheral implements Peripheral<BuzzerStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "buzzer"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "soundSource",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent

  private boundPin: number | null = null
  private frequencyHz: number | null = null
  private playing = false
  /** "active" = internal oscillator (level-driven); "passive" = tone-driven. */
  private readonly buzzerType: "active" | "passive"
  /** Last seen digital level on the bound pin (active-type drive). */
  private lastLevel: 0 | 1 = 0

  // Explicit-mode guard: once the stdlib calls tone()/noTone(), we stop
  // trying to derive frequency from pin edges for this pin. Re-enabled
  // after an explicit-duration window ends.
  private explicitUntilSimMs = 0

  // AVR-edge state
  private edgeRing: number[] = []
  private ringWriteIdx = 0
  private ringCount = 0
  private lastEdgeSimMs = 0

  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    this.buzzerType = component.properties?.buzzerType === "active" ? "active" : "passive"
    const explicit = component.pins?.positive
    if (typeof explicit === "number" && explicit >= 0) {
      this._watchedPins.add(explicit)
      this.boundPin = explicit
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    if (this.boundPin === null) {
      const resolved = findArduinoPinForComponentPin(this.component, "positive", ctx.wires)
      if (resolved !== null) {
        this.boundPin = resolved
        this._watchedPins.add(resolved)
      }
    }
  }

  onExplicitTone(frequency: number, durationMs?: number, simMs = 0): void {
    if (frequency < AUDIBLE_MIN_HZ || frequency > AUDIBLE_MAX_HZ) return
    // An active buzzer beeps at its own pitch no matter what it's driven with.
    this.frequencyHz = this.buzzerType === "active" ? ACTIVE_BUZZER_HZ : frequency
    this.playing = true
    if (typeof durationMs === "number" && durationMs > 0) {
      this.explicitUntilSimMs = simMs + durationMs
    } else {
      this.explicitUntilSimMs = Number.POSITIVE_INFINITY
    }
    this.trace({
      simMs,
      kind: "write",
      message: `tone freq=${frequency}${durationMs ? ` dur=${durationMs}` : ""}`,
      detail: { frequency, duration: durationMs ?? null, pin: this.boundPin },
    })
  }

  onExplicitNoTone(simMs = 0): void {
    this.frequencyHz = null
    this.playing = false
    this.explicitUntilSimMs = 0
    this.trace({ simMs, kind: "write", message: "noTone", detail: { pin: this.boundPin } })
  }

  onPinEdge(edge: PinEdge): void {
    if (!this._watchedPins.has(edge.pin)) return
    // If an explicit tone() is in effect, ignore pin edges — the explicit
    // command wins until it ends or noTone() is called.
    if (edge.simMs < this.explicitUntilSimMs) return

    // Active buzzer: level-driven internal oscillator. A steady HIGH sounds
    // (the case the passive edge-ring can never detect); square-wave drive
    // sustains via the off-delay in onTick. Frequency is fixed.
    if (this.buzzerType === "active") {
      this.lastLevel = edge.value
      this.lastEdgeSimMs = edge.simMs
      if (edge.value === 1 && !this.playing) {
        this.frequencyHz = ACTIVE_BUZZER_HZ
        this.playing = true
        this.trace({
          simMs: edge.simMs,
          kind: "derive",
          message: `active buzzer on (${ACTIVE_BUZZER_HZ}Hz)`,
          detail: { pin: edge.pin },
        })
      }
      return
    }

    this.lastEdgeSimMs = edge.simMs
    this.edgeRing[this.ringWriteIdx] = edge.simMs
    this.ringWriteIdx = (this.ringWriteIdx + 1) % EDGE_RING_SIZE
    if (this.ringCount < EDGE_RING_SIZE) this.ringCount++

    // Need a full ring before believing this is a real tone. Short bursts
    // (shiftOut, incidental digitalWrite pairs) never fill the ring before
    // the silence timeout wipes it.
    if (this.ringCount < EDGE_RING_SIZE) return

    const oldestIdx = this.ringWriteIdx // ring full → oldest is where we'll next write
    const oldest = this.edgeRing[oldestIdx]
    const elapsed = edge.simMs - oldest
    if (elapsed <= 0) return
    const periods = (this.ringCount - 1) / 2
    const freq = (periods * 1000) / elapsed

    if (freq < AUDIBLE_MIN_HZ || freq > AUDIBLE_MAX_HZ) return

    const prev = this.frequencyHz
    const changed =
      prev === null || Math.abs(freq - prev) / prev > FREQ_CHANGE_THRESHOLD
    if (changed) {
      this.frequencyHz = freq
      this.playing = true
      this.trace({
        simMs: edge.simMs,
        kind: "derive",
        message: `avr tone ~${Math.round(freq)}Hz`,
        detail: { freq, pin: edge.pin },
      })
    }
  }

  onTick(simMs: number): void {
    // Explicit-duration window expired
    if (
      this.explicitUntilSimMs > 0 &&
      this.explicitUntilSimMs !== Number.POSITIVE_INFINITY &&
      simMs >= this.explicitUntilSimMs
    ) {
      this.explicitUntilSimMs = 0
      if (this.playing) {
        this.frequencyHz = null
        this.playing = false
        this.trace({
          simMs,
          kind: "derive",
          message: "tone duration ended",
          detail: { pin: this.boundPin },
        })
      }
    }
    // Active buzzer: stop once the pin has settled LOW.
    if (this.buzzerType === "active") {
      if (
        this.playing &&
        this.lastLevel === 0 &&
        this.explicitUntilSimMs === 0 &&
        simMs - this.lastEdgeSimMs > ACTIVE_OFF_DELAY_MS
      ) {
        this.frequencyHz = null
        this.playing = false
        this.trace({ simMs, kind: "derive", message: "active buzzer off", detail: { pin: this.boundPin } })
      }
      return
    }
    // AVR silence: no edges for SILENCE_TIMEOUT_MS → consider tone stopped
    if (
      this.lastEdgeSimMs > 0 &&
      simMs - this.lastEdgeSimMs > SILENCE_TIMEOUT_MS &&
      this.explicitUntilSimMs === 0 &&
      this.playing
    ) {
      this.frequencyHz = null
      this.playing = false
      this.ringCount = 0
      this.ringWriteIdx = 0
      this.trace({
        simMs,
        kind: "derive",
        message: "silence timeout",
        detail: { pin: this.boundPin },
      })
    }
  }

  getState(): Readonly<BuzzerStateShape> | null {
    if (this.boundPin === null) return null
    return {
      kind: "buzzer",
      pin: this.boundPin,
      frequencyHz: this.frequencyHz,
      playing: this.playing,
    }
  }

  reset(): void {
    this.frequencyHz = null
    this.playing = false
    this.explicitUntilSimMs = 0
    this.edgeRing = []
    this.ringWriteIdx = 0
    this.ringCount = 0
    this.lastEdgeSimMs = 0
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

export function createBuzzerPeripheral(component: BoardComponent): BuzzerPeripheral {
  return new BuzzerPeripheral(component)
}
