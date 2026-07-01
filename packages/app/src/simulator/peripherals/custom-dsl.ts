// ── Custom-Part DSL Peripheral ─────────────────────────────────────────────
//
// A generic Peripheral compiled from a custom part's `behavior.signals` facet.
// It watches the Arduino pins the part's named pins are wired to and turns
// live pin traffic into named numeric signals — step counts, PWM duty,
// frequency, integrated angles — the same way the built-in servo peripheral
// turns pulse widths into an angle. The renderer then feeds these values into
// the part's `visual.bindings`.
//
// Signal semantics:
//   digital    — the pin's current level (0|1).
//   pwm        — measured duty cycle 0..1; settles to the DC level on silence.
//   count      — rising-edge counter; with a `direction` pin, each edge adds
//                +1 when DIR is HIGH and -1 when LOW (a stepper STEP/DIR pair).
//   frequency  — rising-edge frequency in Hz; decays to 0 on silence.
//   integrate  — value += rate × elapsed seconds (rate is an expression over
//                properties + signals), with optional clamp/wrap.
//   expr       — derived expression over properties + other signals.

import type { BoardComponent, CustomComponentDsl, DslSignal } from "@dreamer/schemas"
import { evaluateExpression } from "@dreamer/schemas"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"

/** Silence (ms) after which a PWM measurement settles to the pin's DC level. */
const PWM_SILENCE_MS = 100

type PwmState = { lastRiseMs: number | null; lastFallMs: number | null; lastEdgeMs: number | null; duty: number }
type FreqState = { lastRiseMs: number | null; hz: number }

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function numericProperties(comp: BoardComponent): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(comp.properties)) {
    if (typeof value === "number") out[key] = value
  }
  return out
}

/** Pin names a signal reads from. */
function referencedPins(signal: DslSignal): string[] {
  switch (signal.kind) {
    case "digital":
    case "pwm":
    case "frequency":
      return [signal.pin]
    case "count":
      return signal.direction ? [signal.pin, signal.direction] : [signal.pin]
    default:
      return []
  }
}

class CustomDslPeripheral implements Peripheral {
  readonly id: string
  readonly componentType: string
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set()

  private readonly component: BoardComponent
  private readonly signals: DslSignal[]
  private readonly props: Record<string, number>

  /** Part pin name → bound Arduino pin (filled from comp.pins, then wires). */
  private pinBindings = new Map<string, number>()
  private _watchedPins = new Set<number>()
  /** Last seen digital level per Arduino pin (edges update this). */
  private levels = new Map<number, 0 | 1>()

  private counts = new Map<string, number>()
  private pwm = new Map<string, PwmState>()
  private freq = new Map<string, FreqState>()
  private integrators = new Map<string, number>()
  private lastTickMs: number | null = null

  constructor(dsl: CustomComponentDsl, component: BoardComponent) {
    this.id = component.id
    this.componentType = component.type
    this.component = component
    this.signals = dsl.behavior?.signals ?? []
    this.props = numericProperties(component)

    for (const signal of this.signals) {
      if (signal.kind === "count") this.counts.set(signal.name, 0)
      if (signal.kind === "pwm") {
        this.pwm.set(signal.name, { lastRiseMs: null, lastFallMs: null, lastEdgeMs: null, duty: 0 })
      }
      if (signal.kind === "frequency") this.freq.set(signal.name, { lastRiseMs: null, hz: 0 })
      if (signal.kind === "integrate") {
        this.integrators.set(signal.name, signal.min !== undefined && signal.min > 0 ? signal.min : 0)
      }
    }

    // Bind pins the user assigned explicitly in the inspector.
    for (const name of this.referencedPinNames()) {
      const assigned = component.pins?.[name]
      if (typeof assigned === "number" && assigned >= 0) this.bindPin(name, assigned)
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    // Resolve remaining pins from wire topology (through rails/rows), the same
    // fallback the servo/buzzer peripherals use.
    for (const name of this.referencedPinNames()) {
      if (this.pinBindings.has(name)) continue
      const resolved = findArduinoPinForComponentPin(this.component, name, ctx.wires)
      if (resolved !== null) this.bindPin(name, resolved)
    }
  }

  onPinEdge(edge: PinEdge): void {
    this.levels.set(edge.pin, edge.value)
    const rising = edge.value === 1

    for (const signal of this.signals) {
      switch (signal.kind) {
        case "count": {
          if (!rising || this.pinBindings.get(signal.pin) !== edge.pin) break
          const dirPin = signal.direction ? this.pinBindings.get(signal.direction) : undefined
          const dir = dirPin === undefined ? 1 : (this.levels.get(dirPin) ?? 0) === 1 ? 1 : -1
          this.counts.set(signal.name, (this.counts.get(signal.name) ?? 0) + dir)
          break
        }
        case "pwm": {
          if (this.pinBindings.get(signal.pin) !== edge.pin) break
          const state = this.pwm.get(signal.name)!
          if (rising) {
            if (state.lastRiseMs !== null && state.lastFallMs !== null && state.lastFallMs > state.lastRiseMs) {
              const period = edge.simMs - state.lastRiseMs
              const high = state.lastFallMs - state.lastRiseMs
              if (period > 0) state.duty = Math.min(1, Math.max(0, high / period))
            }
            state.lastRiseMs = edge.simMs
          } else {
            state.lastFallMs = edge.simMs
          }
          state.lastEdgeMs = edge.simMs
          break
        }
        case "frequency": {
          if (!rising || this.pinBindings.get(signal.pin) !== edge.pin) break
          const state = this.freq.get(signal.name)!
          if (state.lastRiseMs !== null) {
            const period = edge.simMs - state.lastRiseMs
            if (period > 0) state.hz = 1000 / period
          }
          state.lastRiseMs = edge.simMs
          break
        }
        default:
          break
      }
    }
  }

  onTick(simMs: number): void {
    // PWM silence: no edges for a while means the pin is parked at a DC level.
    for (const signal of this.signals) {
      if (signal.kind !== "pwm") continue
      const state = this.pwm.get(signal.name)!
      if (state.lastEdgeMs !== null && simMs - state.lastEdgeMs > PWM_SILENCE_MS) {
        const pin = this.pinBindings.get(signal.pin)
        state.duty = pin !== undefined && (this.levels.get(pin) ?? 0) === 1 ? 1 : 0
      }
    }
    // Frequency decay: silence longer than ~3 periods reads as "stopped".
    for (const signal of this.signals) {
      if (signal.kind !== "frequency") continue
      const state = this.freq.get(signal.name)!
      if (state.lastRiseMs !== null && state.hz > 0 && simMs - state.lastRiseMs > 3 * (1000 / state.hz)) {
        state.hz = 0
      }
    }
    // Integrators accumulate over sim time.
    if (this.lastTickMs !== null && simMs > this.lastTickMs) {
      const dtSec = (simMs - this.lastTickMs) / 1000
      const context = this.currentValues()
      for (const signal of this.signals) {
        if (signal.kind !== "integrate") continue
        let value = this.integrators.get(signal.name) ?? 0
        value += this.safeEval(signal.rate, context) * dtSec
        if (signal.wrap !== undefined) value = ((value % signal.wrap) + signal.wrap) % signal.wrap
        if (signal.min !== undefined) value = Math.max(signal.min, value)
        if (signal.max !== undefined) value = Math.min(signal.max, value)
        this.integrators.set(signal.name, value)
      }
    }
    this.lastTickMs = simMs
  }

  getState(): Readonly<PeripheralState> | null {
    if (this.signals.length === 0) return null
    const values: Record<string, number> = {}
    for (const [name, value] of Object.entries(this.currentValues())) {
      // Only publish signals, not properties (which ride along in the context).
      if (this.signals.some((s) => s.name === name)) values[name] = round3(value)
    }
    return { kind: "custom", componentType: this.componentType, values }
  }

  reset(): void {
    this.levels.clear()
    this.lastTickMs = null
    for (const signal of this.signals) {
      if (signal.kind === "count") this.counts.set(signal.name, 0)
      if (signal.kind === "pwm") {
        this.pwm.set(signal.name, { lastRiseMs: null, lastFallMs: null, lastEdgeMs: null, duty: 0 })
      }
      if (signal.kind === "frequency") this.freq.set(signal.name, { lastRiseMs: null, hz: 0 })
      if (signal.kind === "integrate") {
        this.integrators.set(signal.name, signal.min !== undefined && signal.min > 0 ? signal.min : 0)
      }
    }
  }

  getTrace(): ReadonlyArray<PeripheralTrace> {
    return []
  }

  // ── internals ───────────────────────────────────────────────────────────

  private referencedPinNames(): Set<string> {
    const names = new Set<string>()
    for (const signal of this.signals) {
      for (const pin of referencedPins(signal)) names.add(pin)
    }
    return names
  }

  private bindPin(name: string, arduinoPin: number): void {
    this.pinBindings.set(name, arduinoPin)
    this._watchedPins.add(arduinoPin)
  }

  /**
   * Properties + every signal's last-known value. Base signals first, then
   * expr signals in declaration order (each sees the ones before it).
   */
  private currentValues(): Record<string, number> {
    const context: Record<string, number> = { ...this.props }
    for (const signal of this.signals) {
      switch (signal.kind) {
        case "digital": {
          const pin = this.pinBindings.get(signal.pin)
          context[signal.name] = pin !== undefined ? (this.levels.get(pin) ?? 0) : 0
          break
        }
        case "pwm":
          context[signal.name] = this.pwm.get(signal.name)?.duty ?? 0
          break
        case "count":
          context[signal.name] = this.counts.get(signal.name) ?? 0
          break
        case "frequency":
          context[signal.name] = this.freq.get(signal.name)?.hz ?? 0
          break
        case "integrate":
          context[signal.name] = this.integrators.get(signal.name) ?? 0
          break
        case "expr":
          context[signal.name] = this.safeEval(signal.expr, context)
          break
      }
    }
    return context
  }

  private safeEval(expr: string, context: Record<string, number>): number {
    try {
      return evaluateExpression(expr, context)
    } catch {
      return 0
    }
  }
}

/** Build a Peripheral from a part's DSL. Returns null when it has no signals. */
export function createCustomDslPeripheral(
  dsl: CustomComponentDsl,
  component: BoardComponent,
): Peripheral | null {
  if (!dsl.behavior || dsl.behavior.signals.length === 0) return null
  return new CustomDslPeripheral(dsl, component)
}
