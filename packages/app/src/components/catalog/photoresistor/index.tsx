import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const photoresistor: ComponentDefinition = {
  type: "photoresistor",
  category: "input",
  description: "Light-dependent resistor — resistance changes with light",
  label: "Photoresistor",
  defaultPins: { a: null, b: null },
  footprint: (row, col) => ({
    points: [{ row, col }, { row: row + 1, col }],
    width: HOLE_SPACING,
    height: HOLE_SPACING * 2,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={3} y={9} width={18} height={6} rx={2} fill="#d2b48c" stroke="#a0825a" strokeWidth={1} />
      <line x1={8} y1={4} x2={10} y2={7} stroke="#fbbf24" strokeWidth={1.5} />
      <line x1={12} y1={3} x2={12} y2={6} stroke="#fbbf24" strokeWidth={1.5} />
      <line x1={16} y1={4} x2={14} y2={7} stroke="#fbbf24" strokeWidth={1.5} />
    </svg>
  ),
  // Light-dependent resistance, so the LDR behaves physically when used as a
  // real circuit element (divider, series load). The inspector's 0-100 light
  // slider maps logarithmically onto lux (0.1 lux dark → 1000 lux bright),
  // then a standard GL5528-style curve R = R10 × (lux/10)^-0.7 with R10=10kΩ:
  // ~250kΩ in the dark, 10kΩ at 10 lux, ~400Ω in bright light.
  // (The direct analogRead injection in sensor-inputs.ts remains the
  // simplified read path and ignores wiring; this models the element itself.)
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1] ?? footprint.points[0])
    const light = Math.max(0, Math.min(100, (comp.properties.light as number) ?? 50))
    const lux = 0.1 * 10 ** (light / 25)
    const ohms = Math.max(130, Math.min(1_000_000, 10_000 * (lux / 10) ** -0.7))
    return { lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} ${ohms.toFixed(0)}`], nodeA, nodeB }
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
    return { setupLines: [`  // ${comp.name} on analog pin ${pin}`], hasPin: true }
  },
  schematicSymbol: "photoresistor",
  schematicValue: () => "LDR",
}
