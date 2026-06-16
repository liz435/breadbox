import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const oledDisplay: ComponentDefinition = {
  type: "oled_display",
  category: "display",
  description: "128x64 I2C OLED display (SSD1306)",
  label: "OLED Display",
  defaultPins: { sda: null, scl: null },
  defaultProperties: {},
  accentColor: "#06b6d4",
  // Vertical 4-pin header: gnd / vcc / scl / sda.
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
      { row: row + 3, col },
    ],
    width: HOLE_SPACING * 6,
    height: HOLE_SPACING * 4,
  }),
  paletteIcon: (
    // SSD1306 module: navy PCB, black OLED panel, 4-pin header, mounting holes
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <defs>
        <linearGradient id="oled-pal-pcb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1c2d54" />
          <stop offset="100%" stopColor="#0d1730" />
        </linearGradient>
      </defs>
      {/* PCB */}
      <rect x={1} y={2} width={22} height={17} rx={2} fill="url(#oled-pal-pcb)" stroke="#0d1a35" strokeWidth={0.6} />
      {/* Corner mounting holes */}
      <circle cx={3}  cy={4}  r={1} fill="#0d1730" stroke="#2a4a8a" strokeWidth={0.3} />
      <circle cx={21} cy={4}  r={1} fill="#0d1730" stroke="#2a4a8a" strokeWidth={0.3} />
      {/* Screen bezel */}
      <rect x={3} y={3.5} width={18} height={11} rx={1.2} fill="#06080f" stroke="#0a1830" strokeWidth={0.5} />
      {/* Active OLED area */}
      <rect x={4} y={4.5} width={16} height={9} rx={0.6} fill="#020408" />
      {/* Display content */}
      <text x={12} y={8.5} textAnchor="middle" fontSize={3.2}
        fill="#06b6d4" fontFamily="monospace" fontWeight="bold">0.96"</text>
      <text x={12} y={11.8} textAnchor="middle" fontSize={2.4}
        fill="#0891b2" fontFamily="monospace">SSD1306</text>
      {/* Scan line hints */}
      <line x1={5} y1={13.5} x2={19} y2={13.5} stroke="#06b6d4" strokeWidth={0.25} opacity={0.2} />
      {/* 4-pin header at bottom */}
      {[5, 9, 14, 18].map(x => (
        <g key={x}>
          <rect x={x - 1} y={15.5} width={2} height={3} rx={0.3} fill="#c8a84a" />
          <line x1={x} y1={18.5} x2={x} y2={22} stroke="#b0b0b0" strokeWidth={0.9} />
        </g>
      ))}
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const sda = comp.pins.sda
    const scl = comp.pins.scl
    if (sda == null || scl == null) return null
    return {
      globalLines: [
        `#include <Wire.h>`,
        `#include <Adafruit_SSD1306.h>`,
        `Adafruit_SSD1306 display(128, 64, &Wire, -1);`,
      ],
      setupLines: [
        `  display.begin(SSD1306_SWITCHCAPVCC, 0x3C); // ${comp.name}`,
        `  display.clearDisplay();`,
        `  display.setTextSize(1);`,
        `  display.setTextColor(SSD1306_WHITE);`,
        `  display.setCursor(0, 0);`,
        `  display.println("Hello World!");`,
        `  display.display();`,
      ],
      loopLines: [],
      hasPin: true,
    }
  },
}
