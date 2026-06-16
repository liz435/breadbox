import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const dcMotor: ComponentDefinition = {
  type: "dc_motor",
  category: "output",
  description: "Small DC motor — control speed with PWM via analogWrite()",
  label: "DC Motor",
  defaultPins: { signal: null },
  defaultProperties: {},
  accentColor: "#f97316",
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
    ],
    width: HOLE_SPACING * 2,
    height: HOLE_SPACING * 2,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <circle cx={12} cy={12} r={8} fill="#374151" stroke="#6b7280" strokeWidth={1} />
      <circle cx={12} cy={12} r={5} fill="#1f2937" stroke="#4b5563" strokeWidth={0.5} />
      <line x1={12} y1={7} x2={12} y2={4} stroke="#a0a0a0" strokeWidth={1.5} strokeLinecap="round" />
      <text x={12} y={13} textAnchor="middle" fontSize={5} fill="#9ca3af" fontFamily="monospace">M</text>
    </svg>
  ),
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeVcc = resolveNode(footprint.points[0])
    const nodeSignal = resolveNode(footprint.points[1] ?? footprint.points[0])
    // Simple winding model: ~20Ω gives 250mA at 5V nominal.
    return { lines: [`R_${sanitize(comp.id)} ${nodeVcc} ${nodeSignal} 20`], nodeA: nodeVcc, nodeB: nodeSignal }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    isActive: Math.abs(currentMa) > 0.5,
    voltage: Math.abs(voltageDrop),
    current: Math.abs(currentMa),
    isReversed: false,
    brightness: Math.min(1, Math.abs(currentMa) / 250),
  }),
  generateSketch: (comp) => {
    const pin = comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
      loopLines: [
        `  analogWrite(${pin}, 128); // ${comp.name} half speed`,
        `  delay(2000);`,
        `  analogWrite(${pin}, 255); // ${comp.name} full speed`,
        `  delay(2000);`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "dc_motor",
  schematicValue: () => "DC",
}
