import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const ic: ComponentDefinition = {
  type: "ic",
  category: "other",
  description: "Generic DIP integrated circuit chip",
  label: "IC Chip",
  defaultPins: {},
  footprint: (row, col) => {
    const pinCount = 8
    const rowCount = pinCount / 2
    const points = []
    for (let r = 0; r < rowCount; r++) {
      points.push({ row: row + r, col: 2 })
      points.push({ row: row + r, col: 7 })
    }
    return { points, width: 60 + HOLE_SPACING * 4, height: HOLE_SPACING * rowCount }
  },
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={6} y={4} width={12} height={16} rx={2} fill="#374151" stroke="#6b7280" strokeWidth={1} />
      {[6, 9, 12, 15].map(y => (
        <line key={`l${y}`} x1={2} y1={y} x2={6} y2={y} stroke="#9ca3af" strokeWidth={1} />
      ))}
      {[6, 9, 12, 15].map(y => (
        <line key={`r${y}`} x1={18} y1={y} x2={22} y2={y} stroke="#9ca3af" strokeWidth={1} />
      ))}
      <circle cx={8} cy={6} r={1} fill="#9ca3af" />
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: () => null,
}
