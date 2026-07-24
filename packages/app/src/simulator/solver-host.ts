// ── SolverHost (ROADMAP Phase B follow-up: worker isolation) ───────────────
//
// One interface, two homes for the transient solver:
//
//   InlineSolverHost — the SolverScheduler runs on the calling thread.
//     Synchronous, exact; every millisecond of solving is stolen from
//     rendering. This is the always-works fallback.
//
//   WorkerSolverHost — the scheduler lives in a Web Worker. tick() is
//     non-blocking: it posts the latest board state and returns the most
//     recent COMPLETED result (one analysis-tick stale). Inputs coalesce —
//     if a solve is in flight, only the newest input is kept, so a slow
//     circuit can never build a queue.
//
// The rAF loop keeps a synchronous call shape either way; `tick()` returns
// null only while the worker warms up (callers keep their previous
// analysis for a frame).
//
// Serialization: CircuitAnalysis carries a Map and a closure
// (nodeVoltageAt), neither of which survives postMessage. The DTO flattens
// states to an array and node voltages to grid-key pairs; `reviveAnalysis`
// rebuilds the Map and the closure on the receiving side.

import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import type { PeripheralState } from "./peripherals/types"
import {
  SolverScheduler,
  type SchedulerTickResult,
} from "./solver-scheduler"
import type {
  CircuitAnalysis,
  ComponentElectricalState,
  ComponentPowerState,
  CurrentPath,
  CircuitWarning,
  SolvedSupply,
} from "./circuit-solver"

// ── Wire format ────────────────────────────────────────────────────────────

export type SolverTickRequest = {
  type: "tick"
  /** Monotonic sequence — replies carry it back so stale answers can be dropped. */
  seq: number
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  pinStates: PinState[]
  shiftRegisterOutputs?: Array<[string, boolean[]]>
  peripheralStates?: Record<string, PeripheralState>
  mcuTimeSeconds: number
}

export type SolverResetRequest = { type: "reset" }

export type SolverWorkerRequest = SolverTickRequest | SolverResetRequest

export type AnalysisDto = {
  isValid: boolean
  netlist: string
  states: ComponentElectricalState[]
  currentPaths: CurrentPath[]
  warnings: CircuitWarning[]
  supplies: SolvedSupply[]
  componentPower: ComponentPowerState[]
  /** "row,col" grid key → solved volts, for nodeVoltageAt reconstruction. */
  nodeVolts: Array<[string, number]>
}

export type SolverTickReply = {
  type: "tick-result"
  seq: number
  analysis: AnalysisDto
  lagSeconds: number
  realtimeFactor: number
  throttleMcu: boolean
  stepsUsed: number
}

export type SolverErrorReply = { type: "tick-error"; seq: number; message: string }

export type SolverWorkerReply = SolverTickReply | SolverErrorReply

// ── DTO conversion ─────────────────────────────────────────────────────────

export function toAnalysisDto(
  analysis: CircuitAnalysis,
  gridKeys: Iterable<string>,
): AnalysisDto {
  const nodeVolts: Array<[string, number]> = []
  if (analysis.nodeVoltageAt) {
    for (const key of gridKeys) {
      const [row, col] = key.split(",").map(Number)
      const v = analysis.nodeVoltageAt({ row, col })
      if (v !== null) nodeVolts.push([key, v])
    }
  }
  return {
    isValid: analysis.isValid,
    netlist: analysis.netlist,
    states: Array.from(analysis.componentStates.values()),
    currentPaths: analysis.currentPaths,
    warnings: analysis.warnings,
    supplies: analysis.supplies,
    componentPower: Array.from(analysis.componentPower.values()),
    nodeVolts,
  }
}

export function reviveAnalysis(dto: AnalysisDto): CircuitAnalysis {
  const componentStates = new Map<string, ComponentElectricalState>(
    dto.states.map((s) => [s.componentId, s]),
  )
  const volts = new Map(dto.nodeVolts)
  const componentPower = new Map<string, ComponentPowerState>(
    dto.componentPower.map((state) => [state.componentId, state]),
  )
  return {
    isValid: dto.isValid,
    netlist: dto.netlist,
    componentStates,
    currentPaths: dto.currentPaths,
    warnings: dto.warnings,
    supplies: dto.supplies,
    componentPower,
    nodeVoltageAt: (point) => volts.get(`${point.row},${point.col}`) ?? null,
  }
}

// ── Host interface ─────────────────────────────────────────────────────────

export type SolverHostTickInput = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  pinStates: PinState[]
  shiftRegisterOutputs?: ReadonlyMap<string, readonly boolean[]>
  peripheralStates?: Record<string, PeripheralState>
  mcuTimeSeconds: number
}

export type SolverHost = {
  /**
   * Advance/solve. Inline: computes now. Worker: posts the input and
   * returns the latest completed result; null while warming up.
   */
  tick(input: SolverHostTickInput): SchedulerTickResult | null
  reset(): void
  /** Tear down any background resources (worker thread). */
  dispose(): void
  readonly kind: "inline" | "worker"
}

// ── Inline host ────────────────────────────────────────────────────────────

export class InlineSolverHost implements SolverHost {
  readonly kind = "inline" as const
  private readonly scheduler: SolverScheduler

  constructor(scheduler?: SolverScheduler) {
    this.scheduler = scheduler ?? new SolverScheduler()
  }

  tick(input: SolverHostTickInput): SchedulerTickResult {
    return this.scheduler.tick(input)
  }

  reset(): void {
    this.scheduler.reset()
  }

  dispose(): void {
    // No background resources.
  }
}

// ── Worker host ────────────────────────────────────────────────────────────

/**
 * Minimal structural type so this module stays importable without DOM libs.
 * Uses addEventListener (method position — bivariant, so both the DOM
 * Worker and Bun's Worker satisfy it structurally) instead of the
 * onmessage/onerror properties, whose function types don't cross-assign
 * under strictFunctionTypes.
 */
type WorkerLike = {
  postMessage(message: unknown): void
  terminate(): void
  addEventListener(type: "message", handler: (event: { data: unknown }) => void): void
  addEventListener(type: "error", handler: () => void): void
}

export class WorkerSolverHost implements SolverHost {
  readonly kind = "worker" as const
  private worker: WorkerLike
  private seq = 0
  private inFlight = false
  /** Newest input received while a solve was in flight (coalesced). */
  private pendingInput: SolverHostTickInput | null = null
  private latest: SchedulerTickResult | null = null
  /** Set when the worker errored — callers should fall back to inline. */
  broken = false

  constructor(worker: WorkerLike) {
    this.worker = worker
    this.worker.addEventListener("message", (event) =>
      this.handleReply(event.data as SolverWorkerReply),
    )
    this.worker.addEventListener("error", () => {
      this.broken = true
    })
  }

  tick(input: SolverHostTickInput): SchedulerTickResult | null {
    if (this.broken) return this.latest
    if (this.inFlight) {
      // Coalesce: keep only the newest board state for the next round-trip.
      this.pendingInput = input
      return this.latest
    }
    this.post(input)
    return this.latest
  }

  private post(input: SolverHostTickInput): void {
    this.inFlight = true
    this.seq++
    const message: SolverTickRequest = {
      type: "tick",
      seq: this.seq,
      components: input.components,
      wires: input.wires,
      pinStates: input.pinStates,
      shiftRegisterOutputs: input.shiftRegisterOutputs
        ? Array.from(input.shiftRegisterOutputs.entries()).map(
            ([id, bits]) => [id, [...bits]] as [string, boolean[]],
          )
        : undefined,
      peripheralStates: input.peripheralStates,
      mcuTimeSeconds: input.mcuTimeSeconds,
    }
    this.worker.postMessage(message)
  }

  private handleReply(reply: SolverWorkerReply): void {
    this.inFlight = false
    if (reply.type === "tick-error") {
      console.error("[solver-worker] solve failed:", reply.message)
    } else if (reply.seq === this.seq) {
      this.latest = {
        analysis: reviveAnalysis(reply.analysis),
        lagSeconds: reply.lagSeconds,
        realtimeFactor: reply.realtimeFactor,
        throttleMcu: reply.throttleMcu,
        stepsUsed: reply.stepsUsed,
        gridKeys: reply.analysis.nodeVolts.map(([key]) => key),
      }
    }
    // Drain the coalesced input, if any arrived mid-flight.
    if (this.pendingInput) {
      const next = this.pendingInput
      this.pendingInput = null
      this.post(next)
    }
  }

  reset(): void {
    this.pendingInput = null
    this.latest = null
    const message: SolverResetRequest = { type: "reset" }
    this.worker.postMessage(message)
  }

  dispose(): void {
    this.worker.terminate()
  }
}
