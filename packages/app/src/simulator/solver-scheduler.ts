// ── SolverScheduler (ROADMAP Phase B) ───────────────────────────────────────
//
// Decouples circuit integration from the render cadence and keeps the MCU
// and circuit clocks in lockstep:
//
//  - The MCU clock is the master. Each tick reports how far the sketch has
//    advanced (`mcuTimeSeconds`); the scheduler owes the circuit exactly
//    that much integrated time (the "deficit").
//  - The scheduler pays the deficit in bounded chunks inside a wall-clock
//    compute budget. A heavy circuit that can't keep up leaves a deficit —
//    it is NEVER silently dropped.
//  - When the deficit exceeds `maxLagSeconds`, `throttleMcu` tells the
//    simulation loop to pause MCU iterations until the circuit catches up.
//    That is the honesty valve: the sim runs slower than real time as one
//    consistent timeline, instead of letting analogRead see stale physics.
//  - `realtimeFactor` (EMA of circuit-advance ÷ mcu-advance) feeds the same
//    lag badge the AVR runner uses, extended to the circuit domain.

import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import type { PeripheralState } from "./peripherals/types"
import { TransientSession } from "./transient-session"
import type { ShiftRegisterOutputs } from "./netlist-builder"
import {
  deriveTransientAnalysis,
  type CircuitAnalysis,
} from "./circuit-solver"

export type SchedulerOptions = {
  /** Wall-clock compute budget per tick, in milliseconds. */
  budgetMs: number
  /** Largest single session chunk, in sim seconds. */
  chunkSeconds: number
  /** Deficit beyond which the MCU should be throttled, in sim seconds. */
  maxLagSeconds: number
  /** Clock source (injectable for tests). */
  nowMs: () => number
}

const DEFAULT_OPTIONS: SchedulerOptions = {
  budgetMs: 6,
  chunkSeconds: 0.02,
  maxLagSeconds: 0.05,
  nowMs: () => performance.now(),
}

export type SchedulerTickInput = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  pinStates: PinState[]
  shiftRegisterOutputs?: ShiftRegisterOutputs
  peripheralStates?: Record<string, PeripheralState>
  /** The MCU's simulated clock, in seconds. Monotonic within a run. */
  mcuTimeSeconds: number
}

export type SchedulerTickResult = {
  analysis: CircuitAnalysis
  /** Sim seconds the circuit still owes the MCU after this tick. */
  lagSeconds: number
  /** EMA of circuit-advance ÷ mcu-advance. 1 = keeping up. */
  realtimeFactor: number
  /** Lockstep signal: pause MCU iterations until the circuit catches up. */
  throttleMcu: boolean
  /** Session steps spent this tick (diagnostics). */
  stepsUsed: number
  /**
   * All "row,col" grid keys that resolved to a circuit node this tick.
   * Lets a worker host serialize the node-voltage table so nodeVoltageAt
   * can be reconstructed across the postMessage boundary.
   */
  gridKeys: string[]
}

export class SolverScheduler {
  private readonly session: TransientSession
  private readonly opts: SchedulerOptions
  private lastMcuTimeSeconds = 0
  private emaFactor = 1

  constructor(session?: TransientSession, options?: Partial<SchedulerOptions>) {
    this.session = session ?? new TransientSession()
    this.opts = { ...DEFAULT_OPTIONS, ...options }
  }

  get realtimeFactor(): number {
    return this.emaFactor
  }

  reset(): void {
    this.session.reset()
    this.lastMcuTimeSeconds = 0
    this.emaFactor = 1
  }

  /**
   * Advance the circuit toward the MCU clock within the compute budget and
   * derive the electrical analysis from the final state.
   */
  tick(input: SchedulerTickInput): SchedulerTickResult {
    const { budgetMs, chunkSeconds, maxLagSeconds, nowMs } = this.opts
    const mcuDelta = Math.max(input.mcuTimeSeconds - this.lastMcuTimeSeconds, 0)
    this.lastMcuTimeSeconds = input.mcuTimeSeconds

    const start = nowMs()
    let advancedTotal = 0
    let stepsUsed = 0
    let deficit = Math.max(input.mcuTimeSeconds - this.session.nowSimSeconds, 0)

    // Always run at least one step (dt may be 0: a cheap re-solve so pin
    // flips are reflected even when the circuit is fully caught up).
    let step = this.session.step({
      components: input.components,
      wires: input.wires,
      pinStates: input.pinStates,
      shiftRegisterOutputs: input.shiftRegisterOutputs,
      peripheralStates: input.peripheralStates,
      dtSimSeconds: Math.min(deficit, chunkSeconds),
    })
    advancedTotal += step.advancedSeconds
    stepsUsed += step.stepsUsed
    deficit = Math.max(input.mcuTimeSeconds - this.session.nowSimSeconds, 0)

    while (deficit > 1e-9 && nowMs() - start < budgetMs) {
      step = this.session.step({
        components: input.components,
        wires: input.wires,
        pinStates: input.pinStates,
        shiftRegisterOutputs: input.shiftRegisterOutputs,
        peripheralStates: input.peripheralStates,
        dtSimSeconds: Math.min(deficit, chunkSeconds),
      })
      advancedTotal += step.advancedSeconds
      stepsUsed += step.stepsUsed
      deficit = Math.max(input.mcuTimeSeconds - this.session.nowSimSeconds, 0)
    }

    // EMA of the keep-up ratio. When the MCU didn't move this tick the ratio
    // carries no signal — hold the previous estimate.
    if (mcuDelta > 1e-9) {
      const instant = Math.min(advancedTotal / mcuDelta, 1)
      this.emaFactor = this.emaFactor * 0.7 + instant * 0.3
    }

    const analysis = deriveTransientAnalysis(step, input.components)
    return {
      analysis,
      lagSeconds: deficit,
      realtimeFactor: this.emaFactor,
      throttleMcu: deficit > maxLagSeconds,
      stepsUsed,
      gridKeys: Array.from(step.build.nodeMap.keys()),
    }
  }
}

// ── Shared circuit-domain realtime factor (badge feed) ────────────────────
//
// The play-controls lag badge polls the AVR runner's realtime factor; the
// circuit domain publishes its own here so the badge can show the combined
// (slower) of the two timelines. Plain module state — same pattern as the
// sensor buses.

let circuitRealtimeFactor: number | null = null

export function publishCircuitRealtimeFactor(factor: number | null): void {
  circuitRealtimeFactor = factor
}

export function getCircuitRealtimeFactor(): number | null {
  return circuitRealtimeFactor
}
