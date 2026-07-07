import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const inductor: ComponentDefinition = {
  type: "inductor",
  category: "passive",
  description: "Stores energy in a magnetic field; opposes changes in current",
  label: "Inductor",
  defaultPins: { a: null, b: null },
  defaultProperties: { inductance: 10 }, // millihenries
  accentColor: "#8b5cf6",
  footprint: (row, col) => footprintFromPins("inductor", row, col, HOLE_SPACING, HOLE_SPACING * 2),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <line x1={12} y1={2} x2={12} y2={5} stroke="#ccc" strokeWidth={1.5} />
      <path
        d="M12 5 a3 3 0 0 1 0 5 a3 3 0 0 1 0 5 a3 3 0 0 1 0 5"
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={2.5}
      />
      <line x1={12} y1={20} x2={12} y2={22} stroke="#ccc" strokeWidth={1.5} />
    </svg>
  ),
  spicePrefix: "L",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1])
    const henries = ((comp.properties.inductance as number) ?? 10) * 1e-3
    // Real L element in both modes: at the legacy solve's effective DC
    // operating point an inductor is a near-short (correct), and in
    // transient mode spicey integrates iPrev across session steps.
    return {
      lines: [`L_${sanitize(comp.id)} ${nodeA} ${nodeB} ${henries}`],
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
  schematicSymbol: "inductor",
  schematicValue: (comp) => {
    const mh = comp.properties.inductance as number | undefined
    return mh != null ? `${mh}mH` : undefined
  },
}
