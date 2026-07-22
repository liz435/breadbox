import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const ultrasonicSensor: ComponentDefinition = {
  type: "ultrasonic_sensor",
  category: "input",
  description: "HC-SR04 distance sensor — measures 2-400cm via echo",
  label: "Ultrasonic Sensor",
  defaultPins: { trigger: null, echo: null, vcc: null, gnd: null },
  power: { supply: ["vcc", "power"], return: ["gnd", "ground"], minOperatingVolts: 4.5 },
  // Vertical pin column: vcc → trig → echo → gnd, each in its own row.
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
      { row: row + 3, col },
    ],
    width: HOLE_SPACING * 4,
    height: HOLE_SPACING * 4,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={2} y={8} width={20} height={8} rx={2} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={1} />
      <circle cx={8} cy={12} r={2.5} fill="#1d4ed8" stroke="#3b82f6" strokeWidth={0.5} />
      <circle cx={16} cy={12} r={2.5} fill="#1d4ed8" stroke="#3b82f6" strokeWidth={0.5} />
    </svg>
  ),
  // Model VCC/trigger/echo/GND as 10kΩ input impedance (high-Z CMOS inputs).
  spicePrefix: "R",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const pinNames = ["vcc", "trigger", "echo", "gnd"]
    const lines: string[] = []
    let nodeA = "0"
    let nodeB = "0"
    for (let i = 0; i < 4; i++) {
      const node = resolveNode(footprint.points[i])
      if (i === 0) nodeA = node
      if (i === 3) nodeB = node
      if (node !== "0") {
        lines.push(`R_${sanitize(comp.id)}_${pinNames[i]} ${node} 0 10000`)
      }
    }
    return { lines, nodeA, nodeB }
  },
  computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
    isActive: Math.abs(voltageDrop) > 2,
    voltage: voltageDrop,
    current: currentMa,
    isReversed: false,
    brightness: 0,
    warnings: [],
  }),
  generateSketch: (comp) => {
    const { trigger, echo } = comp.pins
    const lines: string[] = []
    let hasPin = false
    if (trigger != null) { lines.push(`  pinMode(${trigger}, OUTPUT); // ${comp.name} trigger`); hasPin = true }
    if (echo != null) { lines.push(`  pinMode(${echo}, INPUT); // ${comp.name} echo`); hasPin = true }
    return hasPin ? { setupLines: lines, hasPin } : null
  },
  schematicSymbol: "ultrasonic_sensor",
  schematicValue: () => "HC-SR04",
}
