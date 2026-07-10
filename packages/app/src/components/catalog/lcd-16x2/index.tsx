import { resolveComponentPins } from "@dreamer/schemas"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const lcd16x2: ComponentDefinition = {
  type: "lcd_16x2",
  category: "display",
  description: "16x2 character LCD display",
  label: "LCD 16×2",
  defaultPins: { rs: null, en: null, d4: null, d5: null, d6: null, d7: null },
  // Full HD44780 16-pin header (vss/vdd/vo/rs/rw/en/d0..d3/d4..d7/a/k) —
  // canonical layout owned by @dreamer/schemas so the breadboard render,
  // the SPICE netlist, and the simulator peripheral all resolve pins from
  // the same source. D0–D3 are no-connect in 4-bit mode but occupy real holes.
  footprint: (row, col) => footprintFromPins("lcd_16x2", row, col, HOLE_SPACING * 6, HOLE_SPACING * 16),
  paletteIcon: (
    // HD44780 16×2 module: dark green PCB, yellow-green character panel,
    // corner mounting holes, bezel frame, silver trim pot.
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <defs>
        <linearGradient id="lcd-pal-pcb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0d5a3f" />
          <stop offset="100%" stopColor="#042f22" />
        </linearGradient>
        <linearGradient id="lcd-pal-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#c9f7de" />
          <stop offset="100%" stopColor="#8cdcb3" />
        </linearGradient>
      </defs>
      {/* PCB */}
      <rect x={1} y={4} width={22} height={16} rx={2} fill="url(#lcd-pal-pcb)" stroke="#02241a" strokeWidth={0.6} />
      {/* Corner mounting holes */}
      <circle cx={3}  cy={6}  r={0.9} fill="#011a12" stroke="#3a7a5a" strokeWidth={0.3} />
      <circle cx={21} cy={6}  r={0.9} fill="#011a12" stroke="#3a7a5a" strokeWidth={0.3} />
      {/* Screen bezel */}
      <rect x={2.5} y={7.5} width={19} height={9} rx={1} fill="#02241a" stroke="#011a12" strokeWidth={0.4} />
      {/* Active display */}
      <rect x={3.2} y={8.2} width={17.6} height={7.6} rx={0.5} fill="url(#lcd-pal-screen)" />
      {/* Character cells hint */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect key={`r1-${i}`} x={4 + i * 2.6} y={9} width={1.8} height={2.6} fill="#065f46" opacity={0.25} />
      ))}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect key={`r2-${i}`} x={4 + i * 2.6} y={12.3} width={1.8} height={2.6} fill="#065f46" opacity={0.25} />
      ))}
      {/* Silkscreen */}
      <text x={3} y={18.8} fontSize={2} fill="#4a9e78" fontFamily="monospace" opacity={0.8}>HD44780</text>
      {/* Contrast trim pot */}
      <rect x={17.5} y={17.3} width={3.5} height={2.2} rx={0.3} fill="#1e40af" stroke="#0b2e80" strokeWidth={0.25} />
      <circle cx={19.25} cy={18.4} r={0.7} fill="#d4d4d8" />
    </svg>
  ),
  // Model the 6 control/data pins as high-impedance 10kΩ pull-downs.
  // This gives the SPICE solver a DC path without drawing meaningful
  // current. Resolved by name from the canonical pin map so the footprint
  // can carry its full 16-pin header without the netlist re-shuffling.
  spicePrefix: "R",
  buildNetlist: (comp, { resolveNode }) => {
    const pinMap = resolveComponentPins("lcd_16x2", comp.y, comp.x, comp.properties)
    const signalNames = ["rs", "en", "d4", "d5", "d6", "d7"] as const
    const lines: string[] = []
    let nodeA = "0"
    let nodeB = "0"
    for (let i = 0; i < signalNames.length; i++) {
      const name = signalNames[i]
      const hole = pinMap[name]
      if (!hole) continue
      const node = resolveNode(hole)
      if (i === 0) nodeA = node
      if (i === signalNames.length - 1) nodeB = node
      if (node !== "0") {
        lines.push(`R_${sanitize(comp.id)}_${name} ${node} 0 10000`)
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
    const { rs, en, d4, d5, d6, d7 } = comp.pins
    if (rs == null || en == null || d4 == null || d5 == null || d6 == null || d7 == null) return null
    return {
      globalLines: [`LiquidCrystal lcd(${rs}, ${en}, ${d4}, ${d5}, ${d6}, ${d7});`],
      setupLines: [`  lcd.begin(16, 2); // ${comp.name}`],
      loopLines: [`  lcd.setCursor(0, 0);`, `  lcd.print("Hello, World!");`],
      hasPin: true,
    }
  },
  schematicSymbol: "lcd",
  schematicValue: () => "LCD 16×2",
}
