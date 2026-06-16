import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { buttonPressStore } from "@/simulator/button-press-store"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const button: ComponentDefinition = {
  type: "button",
  category: "input",
  description: "Momentary push button — closes circuit when pressed",
  label: "Push Button",
  defaultPins: { a: null, b: null },
  accentColor: "#f59e0b",
  // Button has 4 physical footprint points (2 rows x 2 sides) but only 2
  // electrical nodes. resolveComponentPins returns the wire-targeting points
  // (row,3) and (row,6); this footprint includes all 4 physical holes for
  // rendering and bus connectivity. If pin positions change in component-pins.ts,
  // update the cols here to match.
  footprint: (row) => ({
    points: [
      { row, col: 3 },
      { row: row + 1, col: 3 },
      { row, col: 6 },
      { row: row + 1, col: 6 },
    ],
    width: 60,
    height: HOLE_SPACING * 2,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={4} y={8} width={16} height={8} rx={2} fill="#374151" stroke="#f59e0b" strokeWidth={1.5} />
      <circle cx={12} cy={12} r={3} fill="#f59e0b" />
    </svg>
  ),
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const leftNode = resolveNode(footprint.points[0])
    const rightNode = resolveNode(footprint.points[2])
    // Strict button model: only physical press changes contact resistance.
    // Do not infer press state from pin values, which can create feedback loops.
    const isPressed = buttonPressStore.isPressed(comp.id)
    const resistance = isPressed ? 0.01 : 10_000_000
    return { lines: [`R_${sanitize(comp.id)} ${leftNode} ${rightNode} ${resistance}`], nodeA: leftNode, nodeB: rightNode }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    isActive: currentMa > 0.01,
    voltage: voltageDrop,
    current: currentMa,
    isReversed: false,
    brightness: 0,
  }),
  generateSketch: (comp) => {
    const pin = comp.pins.a ?? comp.pins.b
    if (pin == null) return null
    return {
      setupLines: [`  pinMode(${pin}, INPUT_PULLUP); // ${comp.name}`],
      hasPin: true,
    }
  },
  schematicSymbol: "button",
  schematicValue: () => undefined,
}
