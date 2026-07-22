import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

const TMP36_MIN_TEMP_C = -40
const TMP36_MAX_TEMP_C = 125
const TMP36_OUTPUT_RESISTANCE_OHMS = 200
const TMP36_QUIESCENT_RESISTANCE_OHMS = 200_000

export const temperatureSensor: ComponentDefinition = {
  type: "temperature_sensor",
  category: "input",
  description: "Analog temperature sensor (TMP36)",
  label: "Temperature Sensor",
  defaultPins: { vcc: null, signal: null, gnd: null },
  power: { supply: ["vcc", "power"], return: ["gnd", "ground"], minOperatingVolts: 2.7 },
  defaultProperties: { temperature: 25 },
  footprint: (row, col) => ({
    points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }],
    width: HOLE_SPACING,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    // TO-92 package: flat face toward viewer, three leads below
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <defs>
        <radialGradient id="tmp-pal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#3d3d3d" />
          <stop offset="60%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
      </defs>
      {/* TO-92 body: flat bottom, rounded top */}
      <path d="M6 18 L6 11 A6 6 0 0 1 18 11 L18 18 Z"
        fill="url(#tmp-pal)" stroke="#555" strokeWidth={0.7} />
      {/* Flat face — slight lighter tint */}
      <rect x={6} y={11} width={12} height={7} fill="#2a2a2a" opacity={0.4} />
      {/* Silkscreen TMP36 text on flat face */}
      <text x={12} y={15.5} textAnchor="middle" fontSize={3.2}
        fill="#b0b0b0" fontFamily="monospace" fontWeight="bold">TMP36</text>
      {/* Three leads */}
      <line x1={9}  y1={18} x2={9}  y2={23} stroke="#b0b0b0" strokeWidth={1} />
      <line x1={12} y1={18} x2={12} y2={23} stroke="#b0b0b0" strokeWidth={1} />
      <line x1={15} y1={18} x2={15} y2={23} stroke="#b0b0b0" strokeWidth={1} />
      {/* Highlight bevel on top */}
      <path d="M6 11 A6 6 0 0 1 18 11" fill="none" stroke="#505050" strokeWidth={0.5} />
    </svg>
  ),
  // TMP36: a finite-impedance temperature voltage source, a small supply
  // load, and an output clamp. This makes the signal participate in the
  // actual net solve (including ADC loading and wiring mistakes) rather than
  // writing an unrelated value into the MCU pin store.
  spicePrefix: "R",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const vcc = resolveNode(footprint.points[0])
    const signal = resolveNode(footprint.points[1] ?? footprint.points[0])
    const gnd = resolveNode(footprint.points[2] ?? footprint.points[0])
    const id = sanitize(comp.id)
    const tempC = Math.max(
      TMP36_MIN_TEMP_C,
      Math.min(TMP36_MAX_TEMP_C, Number(comp.properties.temperature) || 25),
    )
    // TMP36 transfer: 500mV at 0°C, 10mV/°C. A series resistor represents
    // its finite output impedance. The diode keeps an unpowered/miswired
    // sensor from unrealistically driving a signal far above its VCC rail.
    const outputVolts = 0.5 + tempC * 0.01
    const raw = `tmp36_${id}_raw`
    const model = `DTMP36_${id}`
    return {
      lines: [
        `R_${id}_iq ${vcc} ${gnd} ${TMP36_QUIESCENT_RESISTANCE_OHMS}`,
        `V_${id}_temp ${raw} ${gnd} ${outputVolts}`,
        `R_${id}_out ${raw} ${signal} ${TMP36_OUTPUT_RESISTANCE_OHMS}`,
        `D_${id}_clamp ${signal} ${vcc} ${model}`,
      ],
      modelLines: [`.model ${model} D(IS=1e-14 N=1 RS=2)`],
      nodeA: vcc,
      nodeB: gnd,
    }
  },
  computeElectricalState: (comp) => {
    // TMP36: output voltage = (temperature × 10mV) + 500mV
    const temp = (comp.properties.temperature as number) ?? 25
    const voltage = temp * 0.01 + 0.5
    return { isActive: true, voltage, current: 0, isReversed: false, brightness: 0 }
  },
  schematicSymbol: "temperature_sensor",
  schematicValue: (comp) => {
    const temp = (comp.properties.temperature as number) ?? 25
    return `${temp}°C`
  },
  generateSketch: (comp) => {
    const pin = comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [`  // ${comp.name} (TMP36) on analog pin A${(pin as number) - 14}`],
      loopLines: [
        `  int ${sanitize(comp.name)}Raw = analogRead(${pin}); // ${comp.name}`,
        `  float ${sanitize(comp.name)}Voltage = ${sanitize(comp.name)}Raw * (5.0 / 1023.0);`,
        `  float ${sanitize(comp.name)}TempC = (${sanitize(comp.name)}Voltage - 0.5) * 100.0;`,
      ],
      hasPin: true,
    }
  },
}
