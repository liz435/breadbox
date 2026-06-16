import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const dhtSensor: ComponentDefinition = {
  type: "dht_sensor",
  category: "input",
  description: "DHT11/DHT22 temperature and humidity sensor",
  label: "DHT Sensor",
  defaultPins: { signal: null },
  defaultProperties: { variant: "DHT11" },
  accentColor: "#06b6d4",
  // Vertical header: vcc / data / gnd each on their own row.
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
    // DHT11 blue rectangular housing with vent grille on top half
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <defs>
        <linearGradient id="dht-pal-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#0e5070" />
          <stop offset="50%"  stopColor="#1a7ca8" />
          <stop offset="100%" stopColor="#0a3d5a" />
        </linearGradient>
      </defs>
      {/* Body */}
      <rect x={4} y={2} width={16} height={19} rx={2} fill="url(#dht-pal-body)" stroke="#0a3d5a" strokeWidth={0.6} />
      {/* Grille area background */}
      <rect x={6} y={4} width={12} height={8} rx={1} fill="#0e6d93" />
      {/* Vent holes — 3×2 grid */}
      {[0,1,2].map(col => [0,1].map(row => (
        <rect key={`${col}-${row}`}
          x={7 + col * 3.8} y={5.2 + row * 3.5}
          width={2.8} height={2.4} rx={0.8}
          fill="#063a52" opacity={0.9} />
      )))}
      {/* Separator line */}
      <line x1={6} y1={13} x2={18} y2={13} stroke="#0a3d5a" strokeWidth={0.5} />
      {/* Label text */}
      <text x={12} y={17.5} textAnchor="middle" fontSize={3.8}
        fill="#a5e8f7" fontFamily="monospace" fontWeight="bold">DHT11</text>
      {/* Three leads */}
      <line x1={9}  y1={21} x2={9}  y2={24} stroke="#b0b0b0" strokeWidth={1} />
      <line x1={12} y1={21} x2={12} y2={24} stroke="#b0b0b0" strokeWidth={1} />
      <line x1={15} y1={21} x2={15} y2={24} stroke="#b0b0b0" strokeWidth={1} />
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const pin = comp.pins.signal
    if (pin == null) return null
    const variant = (comp.properties.variant as string) ?? "DHT11"
    return {
      globalLines: [
        `#include <DHT.h>`,
        `DHT dht(${pin}, ${variant});`,
      ],
      setupLines: [
        `  dht.begin(); // ${comp.name}`,
      ],
      loopLines: [
        `  float temp = dht.readTemperature(); // ${comp.name}`,
        `  float hum = dht.readHumidity();`,
        `  Serial.print("Temp: "); Serial.print(temp);`,
        `  Serial.print(" Humidity: "); Serial.println(hum);`,
        `  delay(2000);`,
      ],
      hasPin: true,
    }
  },
}
