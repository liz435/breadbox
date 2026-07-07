import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const transistor: ComponentDefinition = {
  type: "transistor",
  category: "passive",
  description: "BJT switch/amplifier — small base current controls a large collector current",
  label: "Transistor (BJT)",
  defaultPins: { collector: null, base: null, emitter: null },
  defaultProperties: { polarity: "npn", beta: 200 },
  accentColor: "#f97316",
  footprint: (row, col) =>
    footprintFromPins("transistor", row, col, HOLE_SPACING, HOLE_SPACING * 3),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <circle cx={12} cy={12} r={9} fill="none" stroke="#f97316" strokeWidth={1.5} />
      <line x1={8} y1={7} x2={8} y2={17} stroke="#f97316" strokeWidth={2} />
      <line x1={2} y1={12} x2={8} y2={12} stroke="#ccc" strokeWidth={1.5} />
      <line x1={8} y1={9.5} x2={15} y2={4} stroke="#ccc" strokeWidth={1.5} />
      <line x1={8} y1={14.5} x2={15} y2={20} stroke="#ccc" strokeWidth={1.5} />
      <path d="M 12.5 16 L 15 20 L 10.8 19 Z" fill="#f97316" />
    </svg>
  ),
  spicePrefix: "Q",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    // Pin order from the shared resolver: collector, base, emitter.
    const nodeC = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1])
    const nodeE = resolveNode(footprint.points[2])
    const polarity = comp.properties.polarity === "pnp" ? "PNP" : "NPN"
    const beta = (comp.properties.beta as number) ?? 200
    const model = `QMOD_${sanitize(comp.id)}`
    return {
      lines: [`Q_${sanitize(comp.id)} ${nodeC} ${nodeB} ${nodeE} ${model}`],
      modelLines: [`.model ${model} ${polarity}(IS=1e-14 BF=${beta} NF=1)`],
      // Report VCE / collector current as the component's primary pair.
      nodeA: nodeC,
      nodeB: nodeE,
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
  schematicSymbol: "transistor",
  schematicValue: (comp) =>
    comp.properties.polarity === "pnp" ? "PNP" : "NPN",
}
