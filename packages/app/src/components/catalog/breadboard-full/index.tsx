import type { ComponentDefinition } from "@/components/component-definition"

// Boards are visual-only components. They have no SPICE element, no
// sketch output, and an empty footprint (footprint = the holes
// components clip into; the board itself doesn't *occupy* any).
export const breadboardFull: ComponentDefinition = {
  type: "breadboard_full",
  label: "Breadboard",
  category: "other",
  description: "Full-size 830-tie solderless breadboard",
  defaultPins: {},
  defaultProperties: {},
  footprint: () => ({ points: [], width: 0, height: 0 }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={2} y={6} width={20} height={12} rx={1.5} fill="#f5f1ea" stroke="#b8b3a8" strokeWidth={0.8} />
      <line x1={2} y1={9} x2={22} y2={9} stroke="#dc2626" strokeWidth={0.6} opacity={0.7} />
      <line x1={2} y1={15} x2={22} y2={15} stroke="#2563eb" strokeWidth={0.6} opacity={0.7} />
      {[5, 8, 11, 14, 17, 20].map((x) => (
        <circle key={`bb-icon-${x}`} cx={x} cy={12} r={0.6} fill="#1a1a1a" />
      ))}
    </svg>
  ),
  generateSketch: () => null,
}
