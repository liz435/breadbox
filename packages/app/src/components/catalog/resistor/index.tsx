import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const resistor: ComponentDefinition = {
  type: "resistor",
  category: "passive",
  description: "Limits current flow — essential for protecting LEDs",
  label: "Resistor",
  defaultPins: { a: null, b: null },
  defaultProperties: { resistance: 220 },
  accentColor: "#d2b48c",
  // Horizontal resistor that STRADDLES the center gap: one leg in the left
  // half (col 3), the other in the right half (col 6). This matches how
  // resistors are placed on a real breadboard and keeps the two legs in
  // separate nets. The stored `x` (col) is ignored for pin placement — the
  // `row` decides which row of 5 each leg lives in.
  footprint: (row, col) => footprintFromPins("resistor", row, col, HOLE_SPACING * 5, HOLE_SPACING),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={3} y={9} width={18} height={6} rx={2} fill="#d2b48c" stroke="#a0825a" strokeWidth={1} />
      <line x1={3} y1={12} x2={1} y2={12} stroke="#ccc" strokeWidth={1.5} />
      <line x1={21} y1={12} x2={23} y2={12} stroke="#ccc" strokeWidth={1.5} />
    </svg>
  ),
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1])
    const resistance = (comp.properties.resistance as number) ?? 220
    return { lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} ${resistance}`], nodeA, nodeB }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    isActive: currentMa > 0.01,
    voltage: voltageDrop,
    current: currentMa,
    isReversed: false,
    brightness: 0,
    emitCurrentPath: currentMa > 0.01,
  }),
  generateSketch: () => null, // passive — no sketch code
  schematicSymbol: "resistor",
  schematicValue: (comp) => {
    const ohms = comp.properties.resistance as number | undefined
    if (ohms == null) return undefined
    if (ohms >= 1_000_000) return `${(ohms / 1_000_000).toFixed(1)}MΩ`
    if (ohms >= 1_000) return `${(ohms / 1_000).toFixed(1)}kΩ`
    return `${ohms}Ω`
  },
}
