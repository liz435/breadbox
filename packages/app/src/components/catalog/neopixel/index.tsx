import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const neopixel: ComponentDefinition = {
  type: "neopixel",
  category: "output",
  description: "WS2812 addressable RGB LED strip",
  label: "NeoPixel Strip",
  defaultPins: { din: null, vcc: null, gnd: null },
  defaultProperties: { numLeds: 8 },
  accentColor: "#a855f7",
  // Vertical header: din / 5v / gnd each on their own row.
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
    ],
    width: HOLE_SPACING * 5,
    height: HOLE_SPACING * 3,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={1} y={8} width={22} height={8} rx={2} fill="#1a1a1a" stroke="#333" strokeWidth={0.5} />
      {[4, 8, 12, 16, 20].map((x, i) => (
        <circle key={i} cx={x} cy={12} r={2.5} fill={["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7"][i]} opacity={0.9} />
      ))}
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const pin = comp.pins.din
    if (pin == null) return null
    const numLeds = (comp.properties.numLeds as number) ?? 8
    return {
      globalLines: [
        `#include <Adafruit_NeoPixel.h>`,
        `Adafruit_NeoPixel strip(${numLeds}, ${pin}, NEO_GRB + NEO_KHZ800);`,
      ],
      setupLines: [
        `  strip.begin(); // ${comp.name}`,
        `  strip.setBrightness(50);`,
        `  strip.show();`,
      ],
      loopLines: [
        `  // ${comp.name}: rainbow cycle`,
        `  for (int i = 0; i < strip.numPixels(); i++) {`,
        `    strip.setPixelColor(i, strip.Color(255, 0, 0));`,
        `  }`,
        `  strip.show();`,
        `  delay(500);`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "neopixel",
  schematicValue: (comp) => {
    const n = (comp.properties.numLeds as number) ?? 8
    return `WS2812 ×${n}`
  },
}
