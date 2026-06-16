import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

export const shiftRegister: ComponentDefinition = {
  type: "shift_register",
  category: "other",
  description: "74HC595 — 8-bit serial-in, parallel-out shift register",
  label: "Shift Register",
  defaultPins: { data: null, clock: null, latch: null },
  defaultProperties: {},
  accentColor: "#8b5cf6",
  footprint: (row) => {
    // DIP-16, straddling the centre gap on fixed cols 2/7: 8 holes per side
    // over 8 rows. `col` is intentionally ignored (the chip always spans the
    // centre channel). Matches the 8-row pin map in component-pins.ts and the
    // 8-row ShiftRegisterRenderer.
    const points = []
    for (let r = 0; r < 8; r++) {
      points.push({ row: row + r, col: 2 })
      points.push({ row: row + r, col: 7 })
    }
    return { points, width: 60 + HOLE_SPACING * 4, height: HOLE_SPACING * 8 }
  },
  paletteIcon: (
    // DIP-16 IC: black body, 8 silver legs per side, notch at top, part number text
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <defs>
        <linearGradient id="sr-pal-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#111" />
          <stop offset="40%"  stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#0d0d0d" />
        </linearGradient>
      </defs>
      {/* IC body */}
      <rect x={6} y={2} width={12} height={20} rx={0.8} fill="url(#sr-pal-body)" stroke="#444" strokeWidth={0.6} />
      {/* Pin-1 notch at top */}
      <path d="M10 2 A2 2 0 0 0 14 2" fill="#0d0d0d" stroke="#555" strokeWidth={0.4} />
      {/* Pin-1 dot */}
      <circle cx={7.5} cy={4.5} r={0.9} fill="#4a7a4a" />
      {/* Left legs: 8 pins */}
      {[3.5,5.5,7.5,9.5,11.5,13.5,15.5,17.5].map(y => (
        <rect key={y} x={2} y={y - 0.7} width={4} height={1.4} fill="#b8b8b8" rx={0.3} />
      ))}
      {/* Right legs: 8 pins */}
      {[3.5,5.5,7.5,9.5,11.5,13.5,15.5,17.5].map(y => (
        <rect key={y} x={18} y={y - 0.7} width={4} height={1.4} fill="#b8b8b8" rx={0.3} />
      ))}
      {/* Label */}
      <text x={12} y={11.5} textAnchor="middle" fontSize={2.8}
        fill="#c8c8c8" fontFamily="monospace" fontWeight="bold">74HC595</text>
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: (comp) => {
    const data = comp.pins.data
    const clock = comp.pins.clock
    const latch = comp.pins.latch
    if (data == null || clock == null || latch == null) return null
    return {
      setupLines: [
        `  pinMode(${data}, OUTPUT); // ${comp.name} data`,
        `  pinMode(${clock}, OUTPUT); // ${comp.name} clock`,
        `  pinMode(${latch}, OUTPUT); // ${comp.name} latch`,
      ],
      loopLines: [
        `  // ${comp.name}: shift out byte`,
        `  digitalWrite(${latch}, LOW);`,
        `  shiftOut(${data}, ${clock}, MSBFIRST, 0b10101010);`,
        `  digitalWrite(${latch}, HIGH);`,
        `  delay(500);`,
      ],
      hasPin: true,
    }
  },
}
