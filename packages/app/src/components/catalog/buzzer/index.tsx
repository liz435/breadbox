import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const buzzer: ComponentDefinition = {
  type: "buzzer",
  category: "output",
  description: "Piezo buzzer — generates tones with tone()",
  label: "Buzzer",
  defaultPins: { positive: null, negative: null },
  accentColor: "#1a1a1a",
  // Vertical layout: positive on top row, negative on row below.
  // Keeps the two legs in separate nets on the breadboard.
  footprint: (row, col) => ({
    points: [{ row, col }, { row: row + 1, col }],
    width: HOLE_SPACING * 2,
    height: HOLE_SPACING * 2,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <circle cx={12} cy={12} r={8} fill="#1f2937" stroke="#374151" strokeWidth={1} />
      <circle cx={12} cy={12} r={4} fill="#374151" stroke="#4b5563" strokeWidth={0.5} />
      <circle cx={12} cy={12} r={1.5} fill="#4b5563" />
    </svg>
  ),
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1] ?? footprint.points[0])
    return { lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} 30`], nodeA, nodeB }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    isActive: currentMa > 0.5,
    voltage: voltageDrop,
    current: currentMa,
    isReversed: voltageDrop < -0.1,
    brightness: currentMa > 0.5 ? Math.min(1, currentMa / 50) : 0,
  }),
  generateSketch: (comp) => {
    const pin = comp.pins.positive
    if (pin == null) return null
    return {
      setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
      hasPin: true,
    }
  },
  schematicSymbol: "buzzer",
  schematicValue: () => "Buzzer",
}
