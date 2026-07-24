// ── TransientSession ────────────────────────────────────────────────────────
//
// The persistent transient-analysis core of the robust-sim pivot (ROADMAP
// Phase A). Where the legacy path re-parses the netlist and solves a fresh
// pseudo operating point every frame, a session keeps ONE parsed circuit
// alive across steps so reactive state (capacitor vPrev, inductor iPrev,
// diode vdPrev) integrates continuously on the simulated-time axis:
//
//   session.step(board inputs, dtSimSeconds)
//     1. Rebuild the netlist text (cheap string work).
//     2. Same topology as last step?  → update source values in place.
//        Topology changed?           → re-parse + migrate element state.
//     3. Install phase-correct square-wave waveforms on PWM sources.
//     4. Pick dt (event-aware: resolves PWM edges; dormant boards take
//        a 2-step micro solve).
//     5. simulateTRAN(ckt) — spicey advances the circuit chunk, mutating
//        vPrev/iPrev in place, which is exactly the state carry-over the
//        next step resumes from.
//
// Time: `simTimeSeconds` is the session's circuit clock. Callers advance it
// with the MCU's *simulated* elapsed time so the two clocks stay in lockstep
// (the two-clock problem the pivot removes). PWM waveforms are closed over
// the session clock, so duty phase stays continuous across steps even though
// each simulateTRAN call restarts its local t at 0.
//
// Cost control (ROADMAP risk 2): dt policy is event-aware, a hard per-step
// solve budget bounds worst-case cost, and `lastStepInfo` reports how much
// sim time was actually advanced so callers can carry a deficit (and report
// a realtime factor) instead of silently losing time.

import { parseNetlist, simulateTRAN } from "spicey"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import type { PeripheralState } from "./peripherals/types"
import {
  buildNetlist,
  type NetlistResult,
  type ShiftRegisterOutputs,
} from "./netlist-builder"

type ParsedCircuit = ReturnType<typeof parseNetlist>

/** Hard cap on solver steps per session.step() call (risk-2 budget). */
const MAX_STEPS_PER_CALL = 2000
/** Target samples per PWM period — enough to resolve duty within ~4%. */
const PWM_SAMPLES_PER_PERIOD = 24
/** Fallback dt when reactive elements are present but no PWM (100 µs). */
const REACTIVE_DT_SECONDS = 100e-6
/** Steps for a dormant (purely resistive, DC-driven) board. */
const DORMANT_STEPS = 2

export type TransientStepInput = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  pinStates: PinState[]
  shiftRegisterOutputs?: ShiftRegisterOutputs
  peripheralStates?: Record<string, PeripheralState>
  /** Simulated seconds to advance the circuit by (the MCU clock's delta). */
  dtSimSeconds: number
}

export type TransientStepResult = {
  /** Parsed circuit after the step — callers may inspect element state. */
  circuit: ParsedCircuit
  /** The freshly built netlist (for CircuitAnalysis reporting). */
  netlist: string
  build: NetlistResult
  /**
   * Node voltage lookup. When PWM is active this is the average over the
   * last full PWM period (the physically meaningful "what a meter reads");
   * otherwise the final time point.
   */
  getNodeVoltage: (node: string) => number
  /** Element current lookup, averaged the same way as voltages. */
  getElementCurrent: (element: string) => number
  /** Sim seconds actually advanced (≤ requested when the budget clipped). */
  advancedSeconds: number
  /** Requested sim seconds for this step. */
  requestedSeconds: number
  /** Solver steps spent. */
  stepsUsed: number
}

/**
 * Strip source *values* from the netlist so topology changes can be told
 * apart from mere value updates (a pin flipping HIGH→LOW must not re-parse
 * and lose capacitor state). V-source lines keep name+nodes only; every
 * other line participates verbatim.
 */
function topologySignature(netlist: string): string {
  return netlist
    .split("\n")
    .map((line) => {
      const t = line.trim()
      if (/^v/i.test(t)) {
        const tokens = t.split(/\s+/)
        return tokens.slice(0, 3).join(" ")
      }
      return t
    })
    .join("\n")
}

/** Extract `element → dc volts` for every plain V-source line. */
function extractSourceValues(netlist: string): Map<string, number> {
  const values = new Map<string, number>()
  for (const line of netlist.split("\n")) {
    const t = line.trim()
    if (!/^v/i.test(t)) continue
    const tokens = t.split(/\s+/)
    if (tokens.length < 4) continue
    const v = Number(tokens[3])
    if (Number.isFinite(v)) values.set(tokens[0], v)
  }
  return values
}

export class TransientSession {
  private circuit: ParsedCircuit | null = null
  private signature = ""
  /** The session's circuit clock, in simulated seconds. */
  private simTimeSeconds = 0

  get nowSimSeconds(): number {
    return this.simTimeSeconds
  }

  /** Drop all state — call on sim stop so runs don't leak charge. */
  reset(): void {
    this.circuit = null
    this.signature = ""
    this.simTimeSeconds = 0
  }

  /**
   * Advance the circuit by `dtSimSeconds` of simulated time. Throws only on
   * unrecoverable netlist/parse errors; a diverging solve retries once with
   * a halved dt before giving up (risk-1 rescue ladder, first rung).
   */
  step(input: TransientStepInput): TransientStepResult {
    const build = buildNetlist(
      input.components,
      input.wires,
      input.pinStates,
      input.shiftRegisterOutputs,
      "transient",
      input.peripheralStates,
    )
    const requested = Math.max(input.dtSimSeconds, 0)

    // ── 1. Reuse or re-parse ────────────────────────────────────────────
    const signature = topologySignature(build.netlist)
    if (!this.circuit || signature !== this.signature) {
      const fresh = parseNetlist(build.netlist)
      if (this.circuit) migrateState(this.circuit, fresh)
      this.circuit = fresh
      this.signature = signature
    } else {
      // Same topology — push the new source values into the live circuit.
      const values = extractSourceValues(build.netlist)
      for (const v of this.circuit.V) {
        const next = values.get(v.name)
        if (next !== undefined) v.dc = next
      }
    }
    const ckt = this.circuit

    // ── 2. PWM waveforms, phased to the session clock ───────────────────
    // Each simulateTRAN call restarts its local t at 0, so close over the
    // session time base to keep duty phase continuous across steps.
    const tBase = this.simTimeSeconds
    const pwmByElement = new Map(build.pwmSources.map((p) => [p.element, p]))
    let minPwmPeriod = Infinity
    for (const v of ckt.V) {
      const pwm = pwmByElement.get(v.name)
      if (!pwm) {
        // A source that was PWM last step may be plain DC now.
        v.waveform = null
        continue
      }
      const period = 1 / pwm.frequencyHz
      minPwmPeriod = Math.min(minPwmPeriod, period)
      const ton = pwm.duty * period
      const high = pwm.highVolts
      v.waveform =
        pwm.duty <= 0 ? () => 0
        : pwm.duty >= 1 ? () => high
        : (t: number) => ((tBase + t) % period < ton ? high : 0)
    }

    // ── 3. dt policy (event-aware) ──────────────────────────────────────
    const reactive = ckt.C.length > 0 || ckt.L.length > 0
    const hasPwm = minPwmPeriod !== Infinity
    let dt: number
    let steps: number
    if (requested === 0) {
      // Pure re-solve (seed frame): 2 micro steps to settle diode Newton.
      dt = 1e-6
      steps = DORMANT_STEPS
    } else if (hasPwm) {
      dt = minPwmPeriod / PWM_SAMPLES_PER_PERIOD
      steps = Math.ceil(requested / dt)
    } else if (reactive) {
      dt = REACTIVE_DT_SECONDS
      steps = Math.ceil(requested / dt)
    } else {
      // Dormant: nothing integrates, one coarse hop lands the same result.
      dt = requested / DORMANT_STEPS
      steps = DORMANT_STEPS
    }
    if (steps > MAX_STEPS_PER_CALL) steps = MAX_STEPS_PER_CALL
    const advanced = requested === 0 ? 0 : Math.min(requested, steps * dt)

    // ── 4. Solve, with one halved-dt retry on divergence ────────────────
    ckt.analyses.tran = { dt, tstop: Math.max(advanced, dt * DORMANT_STEPS) }
    let tran: ReturnType<typeof simulateTRAN>
    try {
      tran = simulateTRAN(ckt)
    } catch (err) {
      ckt.analyses.tran = { dt: dt / 2, tstop: Math.max(advanced, dt) }
      try {
        tran = simulateTRAN(ckt)
      } catch {
        throw err instanceof Error ? err : new Error(String(err))
      }
    }
    if (!tran) throw new Error("transient analysis returned no result")
    this.simTimeSeconds += advanced

    // ── 5. Readout: last point, or last-PWM-period average ──────────────
    const times = tran.times
    let windowStart = times.length - 1
    if (hasPwm && times.length > 1) {
      const tEnd = times[times.length - 1]
      while (windowStart > 0 && tEnd - times[windowStart - 1] <= minPwmPeriod) {
        windowStart--
      }
    }
    const averageTail = (series: number[] | undefined): number => {
      if (!series || series.length === 0) return 0
      if (windowStart >= series.length - 1) return series[series.length - 1]
      let sum = 0
      let n = 0
      for (let i = windowStart; i < series.length; i++) {
        sum += series[i]
        n++
      }
      return n > 0 ? sum / n : series[series.length - 1]
    }

    return {
      circuit: ckt,
      netlist: build.netlist,
      build,
      getNodeVoltage: (node) =>
        node === "0" ? 0 : averageTail(tran.nodeVoltages[node]),
      getElementCurrent: (element) => averageTail(tran.elementCurrents[element]),
      advancedSeconds: advanced,
      requestedSeconds: requested,
      stepsUsed: steps,
    }
  }
}

/**
 * Carry reactive-element state from the previous parsed circuit into a
 * freshly parsed one (topology changed — e.g. a wire was added mid-run).
 * Matched by element name; new elements start at the parser's zero state.
 */
function migrateState(from: ParsedCircuit, to: ParsedCircuit): void {
  // Trapezoidal integration keeps a second history value per reactive
  // element (capacitor current, inductor voltage) — both halves must move
  // together or the first post-migration step integrates from a torn pair.
  const caps = new Map(from.C.map((c) => [c.name, c]))
  for (const c of to.C) {
    const prev = caps.get(c.name)
    if (prev) {
      c.vPrev = prev.vPrev
      c.iPrev = prev.iPrev
    }
  }
  const inds = new Map(from.L.map((l) => [l.name, l]))
  for (const l of to.L) {
    const prev = inds.get(l.name)
    if (prev) {
      l.iPrev = prev.iPrev
      l.vPrev = prev.vPrev
    }
  }
  const diodeV = new Map(from.D.map((d) => [d.name, d.vdPrev]))
  for (const d of to.D) {
    const prev = diodeV.get(d.name)
    if (prev !== undefined) d.vdPrev = prev
  }
}
