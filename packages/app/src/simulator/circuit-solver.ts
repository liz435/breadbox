// ── Circuit Solver ──────────────────────────────────────────────────────
//
// The bridge between board state and the spicey SPICE simulator.
// Converts the board into a netlist, runs the simulation, and extracts
// per-component electrical state for rendering.

import { isBoardComponentType, type BoardComponent, type Wire, type PinState } from "@dreamer/schemas"
import { simulate } from "spicey"
import { buildNetlist } from "./netlist-builder"
import { gridToPixel, getComponentFootprint } from "@/breadboard/breadboard-grid"
import { getComponentDef } from "@/components/registry"
import { stepCapVoltage } from "./capacitor-state"

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

  // Run the simulation
  let simResult: ReturnType<typeof simulate>
  try {
    simResult = simulate(netlist)
  } catch {
    // Simulation failed — mark all components as inactive
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

  const tran = simResult.tran
  const circuit = simResult.circuit

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

    // Step capacitor charge forward using the current from this frame.
    // The cap is modeled as a voltage source in the netlist; the current
    // SPICE computes tells us how fast it's charging or discharging.
    // V_source current convention: positive = current flowing INTO the +
    // terminal, which for a cap means DISCHARGING (voltage decreasing).
    if (comp.type === "capacitor") {
      const capUf = (comp.properties.capacitance as number) ?? 100
      const capF = capUf * 1e-6
      // SPICE voltage source current: negative = current flows from + to -
      // through external circuit (charging the cap). We want:
      //   charging (external current into cap +) → voltage increases
      //   discharging (current out of cap +) → voltage decreases
      // getElementCurrent returns the raw SPICE value; for a V source
      // positive means current INTO the + terminal from the external circuit.
      const rawCurrentA = getElementCurrent(elementName)
      // dt = approximate frame interval. The circuit-analysis hook runs at
      // ~200ms throttle; the simulation loop runs faster (~16ms). Use a
      // conservative 50ms as a middle ground that produces visible charge/
      // discharge behavior without oscillating.
      const dt = 0.05
      stepCapVoltage(comp.id, rawCurrentA, capF, dt)
    }

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
