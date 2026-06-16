import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const relay: ComponentDefinition = {
  type: "relay",
  category: "output",
  description: "Single-channel relay module for switching high-power loads",
  label: "Relay",
  defaultPins: { out: null },
  defaultProperties: {},
  accentColor: "#3b82f6",
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
    ],
    width: HOLE_SPACING * 2,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={3} y={3} width={18} height={18} rx={2} fill="#1e40af" stroke="#1e3a5f" strokeWidth={0.8} />
      <rect x={6} y={6} width={12} height={8} rx={1} fill="#3b82f6" opacity={0.4} />
      <text x={12} y={12} textAnchor="middle" fontSize={5} fill="#93c5fd" fontFamily="monospace">RELAY</text>
      <line x1={8} y1={18} x2={8} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={12} y1={18} x2={12} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={16} y1={18} x2={16} y2={22} stroke="#a0a0a0" strokeWidth={1} />
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const pin = comp.pins.out ?? comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
      loopLines: [
        `  digitalWrite(${pin}, HIGH); // ${comp.name} ON`,
        `  delay(1000);`,
        `  digitalWrite(${pin}, LOW); // ${comp.name} OFF`,
        `  delay(1000);`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "relay",
  schematicValue: () => "Relay",
}
