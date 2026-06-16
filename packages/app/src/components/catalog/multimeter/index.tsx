import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

// A simple test instrument: drop two probes onto any two breadboard rows
// and the LCD on the body shows the DC voltage between them. The user
// doesn't have to wire it to anything — it just reports whatever voltage
// exists between the two grid points it's anchored to.
//
// Inserted into the netlist as a 10 MΩ element so it acts like a real
// high-impedance voltmeter: the simulator gives us the voltage across
// its two nodes for free via componentNodePairs / voltageDrop, and the
// load is small enough that it doesn't perturb the circuit being tested.
export const multimeter: ComponentDefinition = {
  type: "multimeter",
  category: "input",
  description: "Two-probe DMM — measures DC volts, current, or resistance",
  label: "Multimeter",
  defaultPins: {},
  // Probe A is the component's (x, y); probe B lives in properties so the
  // user can drop the two probes anywhere on the board (jumper-wire style).
  // `mode` selects what the LCD displays: "volts" (DC voltage drop between
  // probes), "amps" (current flowing through the meter — inserted as a
  // near-short in series), or "ohms" (resistance between the probes,
  // computed geometrically from the board state in the renderer).
  defaultProperties: { probeBRow: 1, probeBCol: 0, mode: "volts" },
  accentColor: "#fbbf24",
  footprint: (row, col, properties) => {
    const probeBRow = (properties?.probeBRow as number | undefined) ?? row + 1
    const probeBCol = (properties?.probeBCol as number | undefined) ?? col
    const minRow = Math.min(row, probeBRow)
    const maxRow = Math.max(row, probeBRow)
    const minCol = Math.min(col, probeBCol)
    const maxCol = Math.max(col, probeBCol)
    return {
      points: [
        { row, col },
        { row: probeBRow, col: probeBCol },
      ],
      width: (maxCol - minCol + 1) * HOLE_SPACING,
      height: (maxRow - minRow + 1) * HOLE_SPACING,
    }
  },
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={3} y={5} width={18} height={14} rx={2} fill="#fbbf24" stroke="#7c2d12" strokeWidth={1} />
      <rect x={5} y={7} width={14} height={5} rx={0.6} fill="#0a0a0a" />
      <rect x={5.5} y={7.5} width={13} height={4} rx={0.4} fill="#9ade7a" />
      <text x={18} y={11} textAnchor="end" fontSize={3.5} fill="#0a1f08" fontFamily="monospace" fontWeight="bold">5.00V</text>
      <circle cx={8} cy={16} r={1.2} fill="#ef4444" />
      <circle cx={16} cy={16} r={1.2} fill="#1f2937" />
    </svg>
  ),
  spicePrefix: "R",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[1])
    const mode = (comp.properties.mode as string | undefined) ?? "volts"
    // Amps mode: insert as a near-short (0.01 Ω) so the meter sits in
    // series and the solver reports the current flowing through it.
    // Volts / Ohms modes: 10 MΩ so the meter doesn't perturb the circuit
    // under test. (Ohms is read geometrically in the renderer, not from
    // SPICE, so the impedance choice doesn't affect its accuracy.)
    const resistance = mode === "amps" ? "0.01" : "10000000"
    return {
      lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} ${resistance}`],
      nodeA,
      nodeB,
    }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    // Report BOTH the raw voltage drop (signed so reversed probes read
    // negative) and the current through the element. The renderer picks
    // which one to display based on the selected mode.
    isActive: true,
    voltage: voltageDrop,
    current: currentMa,
    isReversed: false,
    brightness: 0,
  }),
  generateSketch: () => null,
}
