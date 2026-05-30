// ── Circuit Solver ──────────────────────────────────────────────────────
//
// The bridge between board state and the spicey SPICE simulator.
// Converts the board into a netlist, runs the simulation, and extracts
// per-component electrical state for rendering.

import { isBoardComponentType, type BoardComponent, type Wire, type PinState } from "@dreamer/schemas"
import { parseNetlist, simulateTRAN } from "spicey"
import { buildNetlist, type ShiftRegisterOutputs } from "./netlist-builder"
import { gridToPixel, getComponentFootprint } from "@/breadboard/breadboard-grid"
import { getComponentDef } from "@/components/registry"
import { getCapVoltage, setCapVoltage } from "./capacitor-state"
import { estimateDiodeCurrentMa, getLedDiodeModel, getRgbLedDiodeModel } from "./diode-model"

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
): void {
  if (dtSeconds <= 0) return
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
    const tauDisplay = Math.max(rth * capF, CAP_DISPLAY_TAU_FLOOR)
    const next = vth + (vd - vth) * Math.exp(-dtSeconds / tauDisplay)
    if (Number.isFinite(next)) {
      if (Math.abs(next - vd) > CAP_SETTLED_VOLTS) capacitorsMovedLastStep = true
      setCapVoltage(comp.id, next)
    }
  }
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
  const { netlist, componentNodePairs } = buildNetlist(
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
  } catch {
    // Simulation failed — mark all components as inactive. Stored capacitor
    // charge is left untouched, so a solver hiccup just holds the last value.
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

  function getNodeVoltage(nodeName: string): number {
    if (nodeName === "0") return 0
    const values = nodeVoltages[nodeName]
    if (!values || values.length === 0) return 0
    return values[values.length - 1]
  }

  function getElementCurrent(elementName: string): number {
    const values = elementCurrents[elementName]
    if (!values || values.length === 0) return 0
    return values[values.length - 1]
  }

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
    const spicePrefix = def?.spicePrefix ?? "R"
    const elementName = `${spicePrefix}_${sanitizedId}`
    let currentA = Math.abs(getElementCurrent(elementName)) * 1000 // Convert to mA
    if (comp.type === "led") {
      currentA = estimateDiodeCurrentMa(
        voltageDrop,
        getLedDiodeModel(comp.properties.color as string | undefined),
      )
    } else if (comp.type === "rgb_led") {
      currentA = estimateDiodeCurrentMa(
        voltageDrop,
        getRgbLedDiodeModel(),
      )
    }
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

  // Advance capacitor charge for the NEXT frame. The state reported above
  // reflects the cap at its current displayed voltage; this steps that voltage
  // toward its target on a watchable exponential timescale.
  if (circuit) {
    evolveCapacitorVoltages(circuit, circuitComponents, options?.dtSeconds ?? 0, getElementCurrent)
  }

  // Check for open circuits: if no component has current flowing
  const anyActive = Array.from(componentStates.values()).some((s) => s.isActive)
  if (!anyActive && circuitComponents.length > 0) {
    // Check if there are voltage sources but no current — open circuit
    const hasVoltageSource = netlist.includes("V_")
    if (hasVoltageSource) {
      for (const comp of circuitComponents) {
        if (comp.type === "led" || comp.type === "rgb_led") {
          warnings.push({
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
    warnings,
  }
}
