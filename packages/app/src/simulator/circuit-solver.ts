// ── Circuit Solver ──────────────────────────────────────────────────────
//
// The bridge between board state and the spicey SPICE simulator.
// Converts the board into a netlist, runs the simulation, and extracts
// per-component electrical state for rendering.

import { isBoardComponentType, type BoardComponent, type Wire, type PinState } from "@dreamer/schemas"
import { parseNetlist, simulateTRAN } from "spicey"
import { buildNetlist, type NetlistResult, type ShiftRegisterOutputs } from "./netlist-builder"
import { gridToPixel, getComponentFootprint } from "@/breadboard/breadboard-grid"
import { getComponentDef } from "@/components/registry"
import { getCapVoltage, setCapVoltage } from "./capacitor-state"
import { TransientSession } from "./transient-session"

type ParsedCircuit = ReturnType<typeof parseNetlist>

// ── Capacitor charge/discharge (watchable-time RC) ───────────────────
//
// A capacitor is modelled in the netlist as a DC voltage source held at its
// current stored voltage Vd (see the registry). Each frame we evolve Vd one
// step toward the voltage it's heading for, following the correct exponential
// RC shape — but on a *display* timescale so the transition is always
// watchable instead of completing in a single ~200ms analysis frame.
//
// To find where the cap is heading and how fast, we probe the circuit it sees
// with a two-point Thevenin extraction: solve at Vd and again at Vd+δ, read
// the cap's branch current at each, and fit the line I(V):
//   - Vth  (current = 0)         → the steady-state voltage the cap approaches
//   - Rth = 1/|dI/dV|            → the real Thevenin resistance → τ = Rth·C
// The displayed time constant is max(τ, FLOOR): a fast RC (small τ) is
// stretched so it settles over ~5·FLOOR ≈ 1.5s, while a cap with no real
// discharge path (huge τ) keeps its real time constant and simply holds.
//
// Because we re-probe every frame, a nonlinear load (an LED's exponential I-V)
// is followed piecewise-linearly — the cap traces the true nonlinear curve,
// just time-stretched.
const CAP_DISPLAY_TAU_FLOOR = 0.3 // seconds; fast transients settle in ~5×this
const CAP_PROBE_DELTA = 0.01 // volts; step for the two-point Thevenin probe

/** SPICE element name the registry emits for a capacitor component (a V source). */
function capElementName(componentId: string): string {
  return `V_${componentId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)}`
}

// ── PWM switching-state enumeration ───────────────────────────────────
//
// The netlist holds each PWM pin at its duty-averaged voltage, which is only
// correct for linear loads: a diode's exponential I-V means I(duty·5V) is far
// below the true time-average duty·I(5V). The physically right answer is the
// average of the *solved states*: enumerate each PWM pin HIGH/LOW combination,
// weight by probability (independent phases assumed), and average node
// voltages and element currents. Sources are flipped by mutating the parsed
// circuit's V.dc in place — the same trick the capacitor probe uses — so the
// netlist is parsed once.
const MAX_PWM_ENUM_SOURCES = 3 // 2^3 = 8 solves max per analysis
const MIN_STATE_WEIGHT = 1e-6

type AveragedSolve = {
  nodeVoltages: Map<string, number>
  elementCurrents: Map<string, number>
}

function solvePwmAverage(
  circuit: ParsedCircuit,
  pwmSources: NetlistResult["pwmSources"],
): AveragedSolve | null {
  const sources = pwmSources.map((spec) => ({
    spec,
    v: circuit.V.find((v) => v.name === spec.element),
  }))
  if (sources.some((s) => !s.v)) return null
  const originals = sources.map((s) => s.v!.dc)

  const nodeVoltages = new Map<string, number>()
  const elementCurrents = new Map<string, number>()
  try {
    for (let mask = 0; mask < 1 << sources.length; mask++) {
      let weight = 1
      for (let i = 0; i < sources.length; i++) {
        const duty = sources[i].spec.duty
        weight *= (mask & (1 << i)) !== 0 ? duty : 1 - duty
      }
      // Degenerate duties (0 or 1) collapse to fewer real states — skip the rest.
      if (weight < MIN_STATE_WEIGHT) continue

      for (let i = 0; i < sources.length; i++) {
        sources[i].v!.dc = (mask & (1 << i)) !== 0 ? sources[i].spec.highVolts : 0
      }
      const solve = simulateTRAN(circuit)
      for (const [name, series] of Object.entries(solve?.nodeVoltages ?? {})) {
        const last = series.length > 0 ? series[series.length - 1] : 0
        nodeVoltages.set(name, (nodeVoltages.get(name) ?? 0) + weight * last)
      }
      for (const [name, series] of Object.entries(solve?.elementCurrents ?? {})) {
        const last = series.length > 0 ? series[series.length - 1] : 0
        elementCurrents.set(name, (elementCurrents.get(name) ?? 0) + weight * last)
      }
    }
    return { nodeVoltages, elementCurrents }
  } catch {
    // One diverging state poisons the average — fall back to the duty-averaged
    // netlist the base solve already used.
    return null
  } finally {
    for (let i = 0; i < sources.length; i++) sources[i].v!.dc = originals[i]
  }
}

/** True if the board has any capacitor whose transient needs animating. */
export function hasCapacitor(components: Record<string, BoardComponent>): boolean {
  return Object.values(components).some((c) => c.type === "capacitor")
}

// Whether the most recent evolution actually moved a capacitor. Lets the
// stopped-board hook stop polling once a transient settles instead of
// re-analyzing forever.
let capacitorsMovedLastStep = false
const CAP_SETTLED_VOLTS = 1e-3

/** True if the last analysis stepped a capacitor (a transient is in progress). */
export function capacitorsAreAnimating(): boolean {
  return capacitorsMovedLastStep
}

/**
 * Evolve every capacitor's displayed voltage one frame toward its steady-state
 * target, on a watchable exponential timescale. Mutates the persistent store
 * via setCapVoltage. `dtSeconds` is the real wall-clock time since the last
 * evolution; with 0 (a one-shot analysis) nothing moves.
 *
 * `baseCurrent` reads a cap's branch current from the already-computed base
 * solve; perturbation solves are run here against `circuit` (caps are V
 * sources, so flipping `dc` and re-solving is cheap and gives exact currents).
 */
function evolveCapacitorVoltages(
  circuit: ParsedCircuit,
  comps: BoardComponent[],
  dtSeconds: number,
  baseCurrent: (elementName: string) => number,
): Map<string, number> {
  const timeScales = new Map<string, number>()
  if (dtSeconds <= 0) return timeScales
  capacitorsMovedLastStep = false
  for (const comp of comps) {
    if (comp.type !== "capacitor") continue
    const name = capElementName(comp.id)
    const source = circuit.V.find((v) => v.name === name)
    if (!source) continue

    const vd = getCapVoltage(comp.id)
    const capF = ((comp.properties.capacitance as number) ?? 100) * 1e-6
    const i0 = baseCurrent(name)

    // Probe at Vd + δ to get the local slope dI/dV the cap sees.
    const original = source.dc
    source.dc = vd + CAP_PROBE_DELTA
    let i1: number
    try {
      const probe = simulateTRAN(circuit)
      const series = probe?.elementCurrents?.[name]
      i1 = series && series.length > 0 ? series[series.length - 1] : i0
    } catch {
      source.dc = original
      continue
    }
    source.dc = original

    const slope = (i1 - i0) / CAP_PROBE_DELTA // dI/dV
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) {
      // No appreciable conduction path (or numerically open) → cap holds.
      continue
    }
    const vth = vd - i0 / slope // terminal voltage where current is zero
    const rth = 1 / Math.abs(slope)
    const tauReal = rth * capF
    const tauDisplay = Math.max(tauReal, CAP_DISPLAY_TAU_FLOOR)
    // How much slower than real time this transient is being shown. Surfaced
    // so the UI can be honest that a fast RC is deliberately stretched.
    if (tauReal > 0 && tauDisplay / tauReal > 1.05) {
      timeScales.set(comp.id, tauDisplay / tauReal)
    }
    const next = vth + (vd - vth) * Math.exp(-dtSeconds / tauDisplay)
    if (Number.isFinite(next)) {
      if (Math.abs(next - vd) > CAP_SETTLED_VOLTS) capacitorsMovedLastStep = true
      setCapVoltage(comp.id, next)
    }
  }
  return timeScales
}

// ── Types ────────────────────────────────────────────────────────────

export type CircuitAnalysis = {
  isValid: boolean
  netlist: string
  componentStates: Map<string, ComponentElectricalState>
  currentPaths: CurrentPath[]
  warnings: CircuitWarning[]
}

export type ComponentElectricalState = {
  componentId: string
  isActive: boolean
  voltage: number
  current: number // mA
  isReversed: boolean
  brightness: number // 0-1 for LEDs
  /**
   * When a transient is deliberately shown slower than real time (fast RC
   * stretched to a watchable timescale), how many times slower. Absent for
   * components animating at true speed.
   */
  timeScale?: number
}

export type CurrentPath = {
  fromNode: string
  toNode: string
  current: number // mA
  points: Array<{ x: number; y: number }>
}

export type CircuitWarning = {
  componentId: string
  type:
    | "no_resistor"
    | "reverse_polarity"
    | "overcurrent"
    | "open_circuit"
    | "short_circuit"
    | "solver_failed"
  message: string
}

// ── Main analysis function ───────────────────────────────────────────

export function analyzeCircuit(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  pinStates: PinState[],
  shiftRegisterOutputs?: ShiftRegisterOutputs,
  options?: { dtSeconds?: number },
): CircuitAnalysis {
  const componentStates = new Map<string, ComponentElectricalState>()
  const currentPaths: CurrentPath[] = []
  const warnings: CircuitWarning[] = []

  // Filter out non-circuit components
  const circuitComponents = Object.values(components).filter(
    (c) => !isBoardComponentType(c.type) && c.type !== "wire",
  )

  if (circuitComponents.length === 0) {
    return {
      isValid: false,
      netlist: "",
      componentStates,
      currentPaths,
      warnings,
    }
  }

  // Build the SPICE netlist
  const { netlist, componentNodePairs, pinSources, pwmSources, railSources, railShorts } = buildNetlist(
    components,
    wires,
    pinStates,
    shiftRegisterOutputs,
  )

  if (netlist.trim().length === 0) {
    return {
      isValid: false,
      netlist,
      componentStates,
      currentPaths,
      warnings,
    }
  }

  // Parse + run the DC operating-point solve directly (rather than spicey's
  // all-in-one simulate()) so we can keep the parsed circuit around for the
  // per-capacitor Thevenin probes below, and skip the unused AC pass.
  let tran: ReturnType<typeof simulateTRAN>
  let circuit: ParsedCircuit | null = null
  try {
    circuit = parseNetlist(netlist)
    tran = simulateTRAN(circuit)
  } catch (err) {
    // Simulation failed — mark all components as inactive. Stored capacitor
    // charge is left untouched, so a solver hiccup just holds the last value.
    // Push a warning so callers (and the overlay) can tell "the solver blew
    // up" apart from "there is nothing to solve" — both return isValid:false.
    warnings.push({
      componentId: circuitComponents[0].id,
      type: "solver_failed",
      message: `Circuit solver failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    console.error("[circuit-solver] netlist solve failed:", err)
    for (const comp of circuitComponents) {
      componentStates.set(comp.id, {
        componentId: comp.id,
        isActive: false,
        voltage: 0,
        current: 0,
        isReversed: false,
        brightness: 0,
      })
    }
    return {
      isValid: false,
      netlist,
      componentStates,
      currentPaths,
      warnings,
    }
  }

  // Extract steady-state values (last time step)
  const nodeVoltages = tran?.nodeVoltages ?? {}
  const elementCurrents = tran?.elementCurrents ?? {}

  // PWM pins: replace the duty-averaged base solve with a weighted average
  // over real HIGH/LOW switching states — the correct time average for
  // nonlinear loads (an LED at 50% duty carries duty·I(5V), not I(2.5V)).
  // Skipped when capacitors are present (their Thevenin probe assumes the
  // single duty-averaged operating point) or with too many PWM pins.
  const hasCap = circuitComponents.some((c) => c.type === "capacitor")
  const averaged =
    circuit && !hasCap && pwmSources.length > 0 && pwmSources.length <= MAX_PWM_ENUM_SOURCES
      ? solvePwmAverage(circuit, pwmSources)
      : null

  function getNodeVoltage(nodeName: string): number {
    if (nodeName === "0") return 0
    if (averaged) return averaged.nodeVoltages.get(nodeName) ?? 0
    const values = nodeVoltages[nodeName]
    if (!values || values.length === 0) return 0
    return values[values.length - 1]
  }

  function getElementCurrent(elementName: string): number {
    if (averaged) return averaged.elementCurrents.get(elementName) ?? 0
    const values = elementCurrents[elementName]
    if (!values || values.length === 0) return 0
    return values[values.length - 1]
  }

  const analysis = deriveAnalysis({
    circuitComponents,
    netlist,
    componentNodePairs,
    pinSources,
    railSources,
    railShorts,
    getNodeVoltage,
    getElementCurrent,
    elementPrefixFor: (comp) => getComponentDef(comp.type)?.spicePrefix ?? "R",
    warnings,
    componentStates,
    currentPaths,
    decorateStates: (states) => {
      // Advance capacitor charge for the NEXT frame. The state reported above
      // reflects the cap at its current displayed voltage; this steps that
      // voltage toward its target on a watchable exponential timescale.
      if (!circuit) return
      const timeScales = evolveCapacitorVoltages(
        circuit,
        circuitComponents,
        options?.dtSeconds ?? 0,
        getElementCurrent,
      )
      // Surface the deliberate time stretch on the capacitor's electrical
      // state so the UI can label the transient as slowed-down.
      for (const [componentId, timeScale] of timeScales) {
        const state = states.get(componentId)
        if (state) states.set(componentId, { ...state, timeScale })
      }
    },
  })
  return analysis
}

// ── Transient path (ROADMAP Phase A) ──────────────────────────────────
//
// The robust-sim entry point: a persistent TransientSession advances real
// C/L elements and square-wave PWM sources by the MCU's simulated elapsed
// time, then the same derivation as the legacy path turns the solve into
// per-component states and warnings. No display-timescale stretching — the
// circuit runs at true speed on the shared sim clock.

const defaultSession = new TransientSession()

/** The module-level session the simulation loop drives. Reset on sim stop. */
export function getTransientSession(): TransientSession {
  return defaultSession
}

export type TransientAnalysis = CircuitAnalysis & {
  /** Sim seconds actually advanced (may lag requested under the step budget). */
  advancedSeconds: number
  requestedSeconds: number
}

export function analyzeCircuitTransient(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  pinStates: PinState[],
  shiftRegisterOutputs?: ShiftRegisterOutputs,
  options?: { dtSimSeconds?: number; session?: TransientSession },
): TransientAnalysis {
  const componentStates = new Map<string, ComponentElectricalState>()
  const currentPaths: CurrentPath[] = []
  const warnings: CircuitWarning[] = []
  const session = options?.session ?? defaultSession

  const circuitComponents = Object.values(components).filter(
    (c) => !isBoardComponentType(c.type) && c.type !== "wire",
  )
  if (circuitComponents.length === 0) {
    return {
      isValid: false,
      netlist: "",
      componentStates,
      currentPaths,
      warnings,
      advancedSeconds: 0,
      requestedSeconds: options?.dtSimSeconds ?? 0,
    }
  }

  let step: ReturnType<TransientSession["step"]>
  try {
    step = session.step({
      components,
      wires,
      pinStates,
      shiftRegisterOutputs,
      dtSimSeconds: options?.dtSimSeconds ?? 0,
    })
  } catch (err) {
    warnings.push({
      componentId: circuitComponents[0].id,
      type: "solver_failed",
      message: `Circuit solver failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    console.error("[circuit-solver] transient solve failed:", err)
    for (const comp of circuitComponents) {
      componentStates.set(comp.id, {
        componentId: comp.id,
        isActive: false,
        voltage: 0,
        current: 0,
        isReversed: false,
        brightness: 0,
      })
    }
    return {
      isValid: false,
      netlist: "",
      componentStates,
      currentPaths,
      warnings,
      advancedSeconds: 0,
      requestedSeconds: options?.dtSimSeconds ?? 0,
    }
  }

  const analysis = deriveAnalysis({
    circuitComponents,
    netlist: step.netlist,
    componentNodePairs: step.build.componentNodePairs,
    pinSources: step.build.pinSources,
    railSources: step.build.railSources,
    railShorts: step.build.railShorts,
    getNodeVoltage: step.getNodeVoltage,
    getElementCurrent: step.getElementCurrent,
    // Transient mode emits real C/L elements, so their branch currents live
    // under C_/L_ names regardless of the def's op-mode spicePrefix.
    elementPrefixFor: (comp) =>
      comp.type === "capacitor"
        ? "C"
        : comp.type === "inductor"
          ? "L"
          : getComponentDef(comp.type)?.spicePrefix ?? "R",
    warnings,
    componentStates,
    currentPaths,
  })
  return {
    ...analysis,
    advancedSeconds: step.advancedSeconds,
    requestedSeconds: step.requestedSeconds,
  }
}

// ── Shared solve→analysis derivation ──────────────────────────────────

type DeriveParams = {
  circuitComponents: BoardComponent[]
  netlist: string
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>
  pinSources: NetlistResult["pinSources"]
  railSources: NetlistResult["railSources"]
  railShorts: NetlistResult["railShorts"]
  getNodeVoltage: (node: string) => number
  getElementCurrent: (element: string) => number
  elementPrefixFor: (comp: BoardComponent) => string
  warnings: CircuitWarning[]
  componentStates: Map<string, ComponentElectricalState>
  currentPaths: CurrentPath[]
  /** Optional hook run after component states are computed (cap evolution). */
  decorateStates?: (states: Map<string, ComponentElectricalState>) => void
}

function deriveAnalysis(params: DeriveParams): CircuitAnalysis {
  const {
    circuitComponents,
    netlist,
    componentNodePairs,
    pinSources,
    railSources,
    railShorts,
    getNodeVoltage,
    getElementCurrent,
    elementPrefixFor,
    warnings,
    componentStates,
    currentPaths,
  } = params

  // Process each component
  for (const comp of circuitComponents) {
    const pair = componentNodePairs.get(comp.id)

    if (!pair) {
      componentStates.set(comp.id, {
        componentId: comp.id,
        isActive: false,
        voltage: 0,
        current: 0,
        isReversed: false,
        brightness: 0,
      })
      continue
    }

    const vA = getNodeVoltage(pair.nodeA)
    const vB = getNodeVoltage(pair.nodeB)
    const voltageDrop = vA - vB

    const def = getComponentDef(comp.type)
    const sanitizedId = comp.id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)
    const elementName = `${elementPrefixFor(comp)}_${sanitizedId}`
    // For LEDs the element is the `D_<id>` diode, in series with its Rs; the
    // solved diode branch current is the LED's true through-current. voltageDrop
    // is the terminal drop (junction + I·Rs), the physical LED voltage.
    const currentA = Math.abs(getElementCurrent(elementName)) * 1000 // Convert to mA
    const elCtx = { voltageDrop, currentMa: currentA, elementName }

    const result = def?.computeElectricalState
      ? def.computeElectricalState(comp, elCtx)
      : null

    const state: ComponentElectricalState = result
      ? {
          componentId: comp.id,
          isActive: result.isActive,
          voltage: result.voltage,
          current: result.current,
          isReversed: result.isReversed ?? false,
          brightness: result.brightness ?? 0,
        }
      : {
          componentId: comp.id,
          isActive: false,
          voltage: voltageDrop,
          current: currentA,
          isReversed: false,
          brightness: 0,
        }

    componentStates.set(comp.id, state)

    if (result?.warnings) {
      for (const w of result.warnings) {
        warnings.push({ componentId: comp.id, ...w })
      }
    }

    if (result?.emitCurrentPath && state.isActive) {
      const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
      const points = footprint.points.map((pt) => gridToPixel(pt))
      currentPaths.push({ fromNode: pair.nodeA, toNode: pair.nodeB, current: currentA, points })
    }
  }

  params.decorateStates?.(componentStates)

  // Check each driven pin against the ATmega328P's current limits. The pin's
  // source branch current is its real load current; warn on the components it
  // drives (so the marker renders at a real position).
  const overcurrentComponentIds = flagPinOvercurrent(
    pinSources,
    componentNodePairs,
    getElementCurrent,
    warnings,
  )

  // Rail-level checks: hard shorts detected at build time, plus solved rail
  // currents against the board's supply limits (polyfuse / LDO).
  flagRailFaults(railShorts, railSources, circuitComponents, componentNodePairs, getElementCurrent, getNodeVoltage, warnings)

  // Port-group and whole-chip limits: the ATmega's real constraint isn't just
  // per-pin — each port group and the VCC/GND pins have their own budgets.
  flagPortGroupOvercurrent(pinSources, componentNodePairs, getElementCurrent, warnings)

  // A pin-overcurrent warning supersedes the generic "add a resistor" note on
  // the same component — keep only the more specific one so markers don't stack.
  const dedupedWarnings =
    overcurrentComponentIds.size === 0
      ? warnings
      : warnings.filter(
          (w) => !(w.type === "no_resistor" && overcurrentComponentIds.has(w.componentId)),
        )

  // Check for open circuits: if no component has current flowing
  const anyActive = Array.from(componentStates.values()).some((s) => s.isActive)
  if (!anyActive && circuitComponents.length > 0) {
    // Check if there are voltage sources but no current — open circuit
    const hasVoltageSource = netlist.includes("V_")
    if (hasVoltageSource) {
      for (const comp of circuitComponents) {
        if (comp.type === "led" || comp.type === "rgb_led") {
          dedupedWarnings.push({
            componentId: comp.id,
            type: "open_circuit",
            message: `${comp.name} has no complete circuit path`,
          })
        }
      }
    }
  }

  return {
    isValid: anyActive,
    netlist,
    componentStates,
    currentPaths,
    warnings: dedupedWarnings,
  }
}

// ── Arduino pin current limits (ATmega328P) ──────────────────────────
const PIN_CURRENT_RECOMMENDED_MA = 20 // per-pin design limit
const PIN_CURRENT_ABSOLUTE_MAX_MA = 40 // per-pin absolute max — risks damage

/**
 * Warn when a driven pin exceeds the ATmega's per-pin current limits. Attaches
 * the warning to every component wired to that pin's node and returns the set
 * of component ids flagged, so callers can suppress redundant warnings.
 */
function flagPinOvercurrent(
  pinSources: Array<{ pin: number; element: string; node: string }>,
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>,
  getElementCurrent: (elementName: string) => number,
  warnings: CircuitWarning[],
): Set<string> {
  const flagged = new Set<string>()
  for (const src of pinSources) {
    const currentMa = Math.abs(getElementCurrent(src.element)) * 1000
    if (currentMa <= PIN_CURRENT_RECOMMENDED_MA) continue

    const message =
      currentMa > PIN_CURRENT_ABSOLUTE_MAX_MA
        ? `Pin D${src.pin} draws ${currentMa.toFixed(0)}mA — over the ${PIN_CURRENT_ABSOLUTE_MAX_MA}mA absolute max for an Arduino pin. This can damage the pin; add a series resistor.`
        : `Pin D${src.pin} draws ${currentMa.toFixed(0)}mA — above the recommended ${PIN_CURRENT_RECOMMENDED_MA}mA per pin. Add a series resistor.`

    for (const [id, pair] of componentNodePairs) {
      if (pair.nodeA === src.node || pair.nodeB === src.node) {
        warnings.push({ componentId: id, type: "overcurrent", message })
        flagged.add(id)
      }
    }
  }
  return flagged
}

// ── Supply-rail limits (Arduino Uno) ──────────────────────────────────
const RAIL_5V_LIMIT_MA = 500 // USB polyfuse trip current
const RAIL_3V3_LIMIT_MA = 50 // official 3.3V pin budget (LP2985 LDO)
/** A rail sagging below this fraction of nominal reads as a collapsed/shorted rail. */
const RAIL_COLLAPSE_FRACTION = 0.6

/**
 * Emit short_circuit / overcurrent warnings for the supply rails: hard shorts
 * (rail wired straight into a ground net, detected at build time because the
 * source never makes it into the netlist) and solved rail currents beyond the
 * board's supply limits.
 */
function flagRailFaults(
  railShorts: NetlistResult["railShorts"],
  railSources: NetlistResult["railSources"],
  circuitComponents: BoardComponent[],
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>,
  getElementCurrent: (elementName: string) => number,
  getNodeVoltage: (nodeName: string) => number,
  warnings: CircuitWarning[],
): void {
  for (const short of railShorts) {
    const message = `${short.rail} is wired directly to GND — a dead short. On real hardware this would trip the polyfuse or damage the regulator; nothing on this net can work until the short is removed.`
    // Prefer components touching the shorted net; a bare wire-only short still
    // needs a home for the warning, so fall back to the first component.
    const targets = short.componentIds.length > 0
      ? short.componentIds
      : circuitComponents.slice(0, 1).map((c) => c.id)
    for (const componentId of targets) {
      warnings.push({ componentId, type: "short_circuit", message })
    }
  }

  for (const rail of railSources) {
    const currentMa = Math.abs(getElementCurrent(rail.element)) * 1000
    const nominal = rail.rail === "5V" ? 5 : 3.3
    const limitMa = rail.rail === "5V" ? RAIL_5V_LIMIT_MA : RAIL_3V3_LIMIT_MA
    const railVolts = getNodeVoltage(rail.node)
    const collapsed = currentMa > 1 && railVolts < nominal * RAIL_COLLAPSE_FRACTION

    let type: CircuitWarning["type"] | null = null
    let message = ""
    if (collapsed) {
      type = "short_circuit"
      message = `${rail.rail} rail has collapsed to ${railVolts.toFixed(2)}V under a ${currentMa.toFixed(0)}mA load — effectively a short circuit. On a real board the supply would shut down or the polyfuse would trip.`
    } else if (currentMa > limitMa) {
      type = "overcurrent"
      message = `${rail.rail} rail sources ${currentMa.toFixed(0)}mA — over its ~${limitMa}mA supply limit. On real hardware the rail would sag or the ${rail.rail === "5V" ? "polyfuse would trip" : "regulator would overheat"}.`
    }
    if (!type) continue

    let attached = false
    for (const [id, pair] of componentNodePairs) {
      if (pair.nodeA === rail.node || pair.nodeB === rail.node) {
        warnings.push({ componentId: id, type, message })
        attached = true
      }
    }
    if (!attached && circuitComponents.length > 0) {
      warnings.push({ componentId: circuitComponents[0].id, type, message })
    }
  }
}

// ── Port-group / whole-chip current limits (ATmega328P) ───────────────
//
// Beyond the per-pin 20/40mA limits, the datasheet caps the *sum* of currents
// per port group (~100mA) and the total through the chip's VCC/GND pins
// (~200mA). Six LEDs at 30mA each are "fine" per-pin and cook the chip anyway.
const PORT_GROUP_LIMIT_MA = 100
const TOTAL_VCC_LIMIT_MA = 200
const PORT_GROUPS: Array<{ name: string; pins: Set<number> }> = [
  { name: "PORTD (D0–D7)", pins: new Set([0, 1, 2, 3, 4, 5, 6, 7]) },
  { name: "PORTB (D8–D13)", pins: new Set([8, 9, 10, 11, 12, 13]) },
  { name: "PORTC (A0–A5)", pins: new Set([14, 15, 16, 17, 18, 19]) },
]

function flagPortGroupOvercurrent(
  pinSources: Array<{ pin: number; element: string; node: string }>,
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>,
  getElementCurrent: (elementName: string) => number,
  warnings: CircuitWarning[],
): void {
  const pinCurrents = pinSources.map((src) => ({
    ...src,
    currentMa: Math.abs(getElementCurrent(src.element)) * 1000,
  }))

  const warnGroup = (sources: typeof pinCurrents, message: string) => {
    const nodes = new Set(sources.map((s) => s.node))
    const seen = new Set<string>()
    for (const [id, pair] of componentNodePairs) {
      if ((nodes.has(pair.nodeA) || nodes.has(pair.nodeB)) && !seen.has(id)) {
        warnings.push({ componentId: id, type: "overcurrent", message })
        seen.add(id)
      }
    }
  }

  for (const group of PORT_GROUPS) {
    const groupSources = pinCurrents.filter((s) => group.pins.has(s.pin))
    const totalMa = groupSources.reduce((sum, s) => sum + s.currentMa, 0)
    if (totalMa > PORT_GROUP_LIMIT_MA) {
      warnGroup(
        groupSources,
        `${group.name} pins source ${totalMa.toFixed(0)}mA combined — over the ~${PORT_GROUP_LIMIT_MA}mA the port group can safely carry. Spread the load across ports or drive it from a transistor.`,
      )
    }
  }

  const totalMa = pinCurrents.reduce((sum, s) => sum + s.currentMa, 0)
  if (totalMa > TOTAL_VCC_LIMIT_MA) {
    warnGroup(
      pinCurrents,
      `All driven pins together source ${totalMa.toFixed(0)}mA — over the ~${TOTAL_VCC_LIMIT_MA}mA the ATmega's VCC/GND pins can carry. Power heavy loads from the 5V rail through a transistor or external supply.`,
    )
  }
}
