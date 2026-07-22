import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const irReceiver: ComponentDefinition = {
  type: "ir_receiver",
  category: "input",
  description: "Infrared receiver for remote control signals (38kHz)",
  label: "IR Receiver",
  defaultPins: { signal: null },
  power: { supply: ["vcc", "power"], return: ["gnd", "ground"], minOperatingVolts: 2.7 },
  defaultProperties: {},
  accentColor: "#dc2626",
  // Vertical pin column: out / gnd / vcc — matches the TSOP38238 pinout
  // and keeps each lead in its own breadboard net.
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
    ],
    width: HOLE_SPACING * 3,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <path d="M8 18 L8 10 A4 4 0 0 1 16 10 L16 18 Z" fill="#1a1a1a" stroke="#444" strokeWidth={0.8} />
      <circle cx={12} cy={10} r={3} fill="#7f1d1d" opacity={0.6} />
      <line x1={8} y1={20} x2={8} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={12} y1={20} x2={12} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={16} y1={20} x2={16} y2={22} stroke="#a0a0a0" strokeWidth={1} />
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const pin = comp.pins.signal ?? comp.pins.out
    if (pin == null) return null
    // IRremote 4.x: the receive timer ISR only services the global
    // `IrReceiver` object, so a custom `IRrecv` instance never decodes.
    return {
      globalLines: [
        `#include <IRremote.h>`,
      ],
      setupLines: [
        `  IrReceiver.begin(${pin}); // ${comp.name}`,
      ],
      loopLines: [
        `  if (IrReceiver.decode()) { // ${comp.name}`,
        `    Serial.println(IrReceiver.decodedIRData.decodedRawData, HEX);`,
        `    IrReceiver.resume();`,
        `  }`,
      ],
      hasPin: true,
    }
  },
}
