import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const potentiometer: ComponentDefinition = {
  type: "potentiometer",
  category: "input",
  description: "Variable resistor — turn the knob to change analog value",
  label: "Potentiometer",
  defaultPins: { vcc: null, signal: null, gnd: null },
  accentColor: "#78716c",
  footprint: (row, col) => ({
    points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }],
    width: HOLE_SPACING,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <circle cx={12} cy={12} r={8} fill="#78716c" stroke="#57534e" strokeWidth={1} />
      <line x1={12} y1={12} x2={12} y2={5} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
      <circle cx={12} cy={12} r={2} fill="#fbbf24" />
    </svg>
  ),
  buildNetlist: (comp, { footprint, resolveNode }) => {
    if (footprint.points.length < 3) return null
    const n1 = resolveNode(footprint.points[0])
    const n2 = resolveNode(footprint.points[1])
    const n3 = resolveNode(footprint.points[2])
    const totalR = 10_000
    // Clamp the ratio away from 0 and 1 — a 0Ω element in the divider
    // (e.g. wiper at an end stop) collapses a node in the conductance
    // matrix and makes spicey throw "Singular matrix". 0.5Ω is electrically
    // indistinguishable from the end stop at the pot's precision.
    const rawRatio = ((comp.properties.value as number) ?? 50) / 100
    const ratio = Math.max(0.00005, Math.min(0.99995, rawRatio))
    // Dial convention: value% = fraction of the rail at the wiper, so the
    // GND-side half carries `ratio` (wiper V = 5 · R_B/(R_A+R_B)) and the
    // VCC-side half the remainder. Orientation matters on the transient
    // path, which reads the SOLVED wiper node — the legacy injection path
    // always overwrote it, which hid this.
    return {
      lines: [
        `R_${sanitize(comp.id)}_A ${n1} ${n2} ${totalR * (1 - ratio)}`,
        `R_${sanitize(comp.id)}_B ${n2} ${n3} ${totalR * ratio}`,
      ],
      nodeA: n1,
      nodeB: n3,
    }
  },
  computeElectricalState: (comp, { voltageDrop }) => {
    // The wiper voltage is a fraction of the total voltage across the pot.
    // voltageDrop = V(vcc) - V(gnd). Wiper sits at ratio × voltageDrop.
    const ratio = ((comp.properties.value as number) ?? 50) / 100
    const wiperVoltage = Math.abs(voltageDrop) * ratio
    return {
      isActive: Math.abs(voltageDrop) > 0.01,
      voltage: wiperVoltage,
      current: 0,
      isReversed: false,
      brightness: 0,
    }
  },
  generateSketch: (comp) => {
    const pin = comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [`  // ${comp.name} on analog pin A${(pin as number) - 14}`],
      loopLines: [
        `  int ${sanitize(comp.name)}Val = analogRead(${pin}); // ${comp.name}`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "potentiometer",
  schematicValue: () => "10kΩ pot",
}
