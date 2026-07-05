import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { servoVarName } from "@/components/catalog/_shared"

export const servo: ComponentDefinition = {
  type: "servo",
  category: "output",
  description: "Servo motor — rotate to a precise angle (0-180°)",
  label: "Servo Motor",
  defaultPins: { signal: null, vcc: null, gnd: null },
  defaultProperties: { angle: 90 },
  accentColor: "#22c55e",
  footprint: (row, col) => ({
    points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }],
    width: HOLE_SPACING,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={3} y={6} width={18} height={12} rx={2} fill="#166534" stroke="#22c55e" strokeWidth={1} />
      <circle cx={12} cy={12} r={3} fill="#22c55e" />
      <line x1={12} y1={12} x2={12} y2={7} stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  // Visual only — not in SPICE
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const pin = comp.pins.signal
    if (pin == null) return null
    return {
      globalLines: [`Servo ${servoVarName(comp.name)};`],
      setupLines: [
        `  ${servoVarName(comp.name)}.attach(${pin}); // ${comp.name}`,
        `  ${servoVarName(comp.name)}.write(90); // ${comp.name}`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "servo",
  // Show the commanded angle rather than repeating the component name.
  schematicValue: (comp) => {
    const angle = comp.properties?.angle
    return typeof angle === "number" ? `${angle}°` : undefined
  },
}
