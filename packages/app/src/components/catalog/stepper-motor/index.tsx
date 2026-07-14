import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const stepperMotor: ComponentDefinition = {
  type: "stepper_motor",
  category: "output",
  description: "28BYJ-48 stepper + ULN2003 driver — 4-phase, driven with Stepper.h",
  label: "Stepper Motor",
  // IN1–IN4 go to Arduino digital pins; vplus/gnd power the driver board (5V).
  defaultPins: { in1: null, in2: null, in3: null, in4: null, vplus: null, gnd: null },
  defaultProperties: { stepsPerRev: 2048 },
  accentColor: "#2563eb",
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
      { row: row + 3, col },
      { row: row + 4, col },
      { row: row + 5, col },
    ],
    width: HOLE_SPACING * 7,
    height: HOLE_SPACING * 6,
  }),
  paletteIcon: (
    // 28BYJ-48: blue motor can with a shaft, wired to the ULN2003 driver board.
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <defs>
        <radialGradient id="stp-can" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </radialGradient>
      </defs>
      {/* Driver board */}
      <rect x={2} y={14} width={11} height={7} rx={1} fill="#1e40af" stroke="#1e3a8a" strokeWidth={0.5} />
      <rect x={9.5} y={16} width={2.5} height={3} rx={0.3} fill="#0f172a" />
      {/* Motor can */}
      <circle cx={16} cy={9} r={6.5} fill="url(#stp-can)" stroke="#1e3a8a" strokeWidth={0.6} />
      <circle cx={16} cy={9} r={2} fill="#cbd5e1" stroke="#64748b" strokeWidth={0.4} />
      {/* mounting tab */}
      <rect x={8} y={8} width={4} height={2} rx={0.5} fill="#93c5fd" />
      {/* ribbon to board */}
      <path d="M11 12 L8 15" stroke="#f59e0b" strokeWidth={1} fill="none" />
    </svg>
  ),
  // Digitally driven: the IN pins are read by the stepper peripheral, so the
  // part contributes no analog netlist elements (like the shift register).
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const { in1, in2, in3, in4 } = comp.pins
    if (in1 == null || in2 == null || in3 == null || in4 == null) return null
    const steps =
      typeof comp.properties?.stepsPerRev === "number" ? comp.properties.stepsPerRev : 2048
    const varName = comp.name.replace(/[^a-zA-Z0-9]/g, "") || "stepper"
    // 28BYJ-48 wiring convention for Stepper.h is IN1, IN3, IN2, IN4.
    return {
      globalLines: [
        `#include <Stepper.h>`,
        `Stepper ${varName}(${steps}, ${in1}, ${in3}, ${in2}, ${in4}); // ${comp.name}`,
      ],
      setupLines: [`  ${varName}.setSpeed(10); // ${comp.name} rpm`],
      loopLines: [
        `  ${varName}.step(${steps}); // ${comp.name} one revolution`,
        `  delay(1000);`,
      ],
      hasPin: true,
    }
  },
  // No dedicated schematic symbol — the 6-pin driver board renders with the
  // generic-module symbol (labelled box with pins).
  schematicValue: () => "STEP",
}
