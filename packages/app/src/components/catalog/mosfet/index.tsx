import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const mosfet: ComponentDefinition = {
  type: "mosfet",
  category: "passive",
  description: "MOSFET switch — gate voltage controls the drain-source channel",
  label: "MOSFET",
  defaultPins: { drain: null, gate: null, source: null },
  defaultProperties: { polarity: "nmos", vt: 2, kp: 0.1 },
  accentColor: "#f97316",
  footprint: (row, col) =>
    footprintFromPins("mosfet", row, col, HOLE_SPACING, HOLE_SPACING * 3),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <line x1={2} y1={12} x2={8} y2={12} stroke="#ccc" strokeWidth={1.5} />
      <line x1={8} y1={6} x2={8} y2={18} stroke="#f97316" strokeWidth={2} />
      <line x1={11} y1={5} x2={11} y2={9} stroke="#f97316" strokeWidth={2} />
      <line x1={11} y1={10} x2={11} y2={14} stroke="#f97316" strokeWidth={2} />
      <line x1={11} y1={15} x2={11} y2={19} stroke="#f97316" strokeWidth={2} />
      <line x1={11} y1={7} x2={18} y2={7} stroke="#ccc" strokeWidth={1.5} />
      <line x1={18} y1={7} x2={18} y2={2} stroke="#ccc" strokeWidth={1.5} />
      <line x1={11} y1={17} x2={18} y2={17} stroke="#ccc" strokeWidth={1.5} />
      <line x1={18} y1={17} x2={18} y2={22} stroke="#ccc" strokeWidth={1.5} />
    </svg>
  ),
  spicePrefix: "M",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    // Pin order from the shared resolver: drain, gate, source.
    const nodeD = resolveNode(footprint.points[0])
    const nodeG = resolveNode(footprint.points[1])
    const nodeS = resolveNode(footprint.points[2])
    const polarity = comp.properties.polarity === "pmos" ? "PMOS" : "NMOS"
    const vt = (comp.properties.vt as number) ?? 2
    const kp = (comp.properties.kp as number) ?? 0.1
    const model = `MMOD_${sanitize(comp.id)}`
    return {
      lines: [`M_${sanitize(comp.id)} ${nodeD} ${nodeG} ${nodeS} ${model}`],
      modelLines: [`.model ${model} ${polarity}(VTO=${vt} KP=${kp})`],
      // Report VDS / drain current as the component's primary pair.
      nodeA: nodeD,
      nodeB: nodeS,
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
  schematicSymbol: "mosfet",
  schematicValue: (comp) =>
    comp.properties.polarity === "pmos" ? "P-ch" : "N-ch",
}
