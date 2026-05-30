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

// ── Transient stepping for reactive elements ─────────────────────────
//
// Capacitors and inductors only behave correctly inside a time-domain solve.
// Each analysis call advances the transient by CAP_ADVANCE_SECONDS of
// simulated time, integrated in CAP_SUBSTEPS backward-Euler steps (spicey's
// native companion model — a true exponential RC curve). The analysis runs at
// a ~200ms cadence (the simulation loop calls it every 12 frames ≈ 200ms; the
// stopped-board hook throttles to 200ms), so a 0.2s advance per call makes
// simulated time track wall-clock roughly 1:1 — a 100µF·10kΩ (τ=1s) cap
// visibly settles over about a second of watching.
const CAP_ADVANCE_SECONDS = 0.2
const CAP_SUBSTEPS = 20

/** SPICE element name the registry emits for a capacitor component. */
function capElementName(componentId: string): string {
  return `C_${componentId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)}`
}

/**
 * Seed each capacitor's stored charge as the initial condition for this
 * solve. spicey resets vPrev to 0 on every parse, so without this the cap
 * would restart from 0V every frame and never hold a charge.
 */
function seedCapacitorVoltages(circuit: ParsedCircuit, comps: BoardComponent[]): void {
  if (circuit.C.length === 0) return
  for (const comp of comps) {
    if (comp.type !== "capacitor") continue
    const cap = circuit.C.find((c) => c.name === capElementName(comp.id))
    if (cap) cap.vPrev = getCapVoltage(comp.id)
  }
}

/** Write back the voltage each capacitor reached so the next frame resumes from it. */
function persistCapacitorVoltages(circuit: ParsedCircuit, comps: BoardComponent[]): void {
  if (circuit.C.length === 0) return
  for (const comp of comps) {
    if (comp.type !== "capacitor") continue
    const cap = circuit.C.find((c) => c.name === capElementName(comp.id))
    if (cap) setCapVoltage(comp.id, cap.vPrev)
  }
}

/**
 * Widen the transient window for boards with reactive elements so charge
 * visibly evolves. Purely resistive/diode circuits reach steady state
 * instantly, so they keep the netlist's tiny `.tran` window for speed.
 */
function configureTransientWindow(circuit: ParsedCircuit, advanceSeconds: number): void {
  if (circuit.C.length === 0 && circuit.L.length === 0) return
  const tstop = Math.max(advanceSeconds, 1e-4)
  circuit.analyses.tran = { dt: tstop / CAP_SUBSTEPS, tstop }
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
  options?: { capAdvanceSeconds?: number },
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

  // Parse + run the transient solve directly (rather than spicey's all-in-one
  // simulate()) so we can seed each capacitor's stored charge as its initial
  // condition before integrating, and skip the unused AC pass.
  let tran: ReturnType<typeof simulateTRAN>
  try {
    const circuit = parseNetlist(netlist)
    seedCapacitorVoltages(circuit, circuitComponents)
    configureTransientWindow(circuit, options?.capAdvanceSeconds ?? CAP_ADVANCE_SECONDS)
    tran = simulateTRAN(circuit)
    // Persist the voltage each capacitor reached so the next frame resumes
    // from it (charge retention + continued charge/discharge across frames).
    persistCapacitorVoltages(circuit, circuitComponents)
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
