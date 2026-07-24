import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const pirSensor: ComponentDefinition = {
  type: "pir_sensor",
  category: "input",
  description: "HC-SR501 passive infrared motion detector",
  label: "PIR Sensor",
  defaultPins: { data: null },
  power: { supply: ["vcc", "power"], return: ["gnd", "ground"], minOperatingVolts: 3.3 },
  defaultProperties: {},
  accentColor: "#f59e0b",
  // Vertical header: vcc / signal / gnd each on their own row so no two
  // pins share a breadboard net.
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
    ],
    width: HOLE_SPACING * 4,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={4} y={10} width={16} height={10} rx={2} fill="#065f46" stroke="#064e3b" strokeWidth={0.8} />
      <circle cx={12} cy={8} r={6} fill="#d4d4d4" stroke="#a3a3a3" strokeWidth={0.8} />
      <circle cx={12} cy={8} r={3} fill="#fbbf24" opacity={0.6} />
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const pin = comp.pins.data ?? comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [
        `  pinMode(${pin}, INPUT); // ${comp.name}`,
      ],
      loopLines: [
        `  if (digitalRead(${pin}) == HIGH) { // ${comp.name} motion detected`,
        `    Serial.println("Motion!");`,
        `  }`,
        `  delay(200);`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "pir_sensor",
  schematicValue: () => "HC-SR501",
}
