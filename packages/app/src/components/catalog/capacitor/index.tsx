import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { getCapVoltage } from "@/simulator/capacitor-state"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const capacitor: ComponentDefinition = {
  type: "capacitor",
  category: "passive",
  description: "Stores and releases electrical charge",
  label: "Capacitor",
  defaultPins: { a: null, b: null },
  defaultProperties: { capacitance: 100 },
  accentColor: "#3b82f6",
  footprint: (row, col) => footprintFromPins("capacitor", row, col, HOLE_SPACING, HOLE_SPACING * 3),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <line x1={12} y1={2} x2={12} y2={8} stroke="#ccc" strokeWidth={1.5} />
      <line x1={4} y1={8} x2={20} y2={8} stroke="#3b82f6" strokeWidth={2.5} />
      <line x1={4} y1={12} x2={20} y2={12} stroke="#3b82f6" strokeWidth={2.5} />
      <line x1={12} y1={12} x2={12} y2={22} stroke="#ccc" strokeWidth={1.5} />
    </svg>
  ),
  spicePrefix: "V",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1])
    // Model the capacitor as a DC voltage source held at its current stored
    // voltage. The circuit solver reads the resulting branch current to probe
    // the surrounding circuit (Thevenin) and steps the stored voltage toward
    // its target on a watchable exponential timescale (see circuit-solver.ts
    // → evolveCapacitorVoltages). The branch current also drives the charge/
    // discharge current-path animation.
    const storedV = getCapVoltage(comp.id)
    return {
      lines: [`V_${sanitize(comp.id)} ${nodeA} ${nodeB} ${storedV}`],
      nodeA,
      nodeB,
    }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    isActive: Math.abs(currentMa) > 0.01,
    voltage: voltageDrop,
    current: currentMa,
    isReversed: false,
    brightness: 0,
    emitCurrentPath: Math.abs(currentMa) > 0.01,
  }),
  generateSketch: () => null, // passive — no sketch code
  schematicSymbol: "capacitor",
  schematicValue: (comp) => {
    const cap = comp.properties.capacitance as number | undefined
    return cap != null ? `${cap}µF` : undefined
  },
}
