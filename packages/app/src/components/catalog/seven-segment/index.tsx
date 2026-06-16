import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const sevenSegment: ComponentDefinition = {
  type: "seven_segment",
  category: "display",
  description: "7-segment numeric display (0-9)",
  label: "7-Segment Display",
  defaultPins: { a: null, b: null, c: null, d: null, e: null, f: null, g: null, dp: null, gnd: null },
  // Vertical pin column: a..g, dp, gnd each in their own row so no two pins
  // share a breadboard net.
  footprint: (row, col) => footprintFromPins("seven_segment", row, col, HOLE_SPACING * 5, HOLE_SPACING * 9),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={4} y={3} width={16} height={18} rx={2} fill="#1f2937" stroke="#374151" strokeWidth={1} />
      <rect x={7} y={5} width={10} height={2} rx={1} fill="#ef4444" opacity={0.8} />
      <rect x={7} y={11} width={10} height={2} rx={1} fill="#ef4444" opacity={0.8} />
      <rect x={7} y={17} width={10} height={2} rx={1} fill="#ef4444" opacity={0.8} />
      <rect x={5} y={5} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
      <rect x={17} y={5} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
      <rect x={5} y={11} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
      <rect x={17} y={11} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
    </svg>
  ),
  spicePrefix: "R",
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const segments = ["a", "b", "c", "d", "e", "f", "g"] as const
    const lines: string[] = []

    for (let i = 0; i < segments.length; i++) {
      const point = footprint.points[i]
      if (!point) continue
      const node = resolveNode(point)
      // Common-cathode approximation: each segment acts like a branch to GND.
      if (node !== "0") {
        lines.push(`R_${sanitize(comp.id)}_${segments[i]} ${node} 0 220`)
      }
    }

    const nodeA = resolveNode(footprint.points[0] ?? { row: comp.y, col: comp.x })
    return {
      lines,
      nodeA,
      nodeB: "0",
    }
  },
  generateSketch: (comp) => {
    const segPins = [comp.pins.a, comp.pins.b, comp.pins.c, comp.pins.d, comp.pins.e, comp.pins.f, comp.pins.g]
    const dpPin = comp.pins.dp
    const assigned = segPins.filter(p => p != null)
    if (assigned.length === 0 && dpPin == null) return null
    const setupLines = segPins.map((p, i) => {
      const seg = "abcdefg"[i]
      return p != null ? `  pinMode(${p}, OUTPUT); // ${comp.name} segment ${seg}` : null
    }).filter(Boolean) as string[]
    if (dpPin != null) setupLines.push(`  pinMode(${dpPin}, OUTPUT); // ${comp.name} segment dp`)
    // Display digit 0 by default (segments a,b,c,d,e,f on, g off)
    const pattern = [1, 1, 1, 1, 1, 1, 0] // 0 = abcdef
    const loopLines = segPins.map((p, i) => {
      return p != null ? `  digitalWrite(${p}, ${pattern[i] ? "HIGH" : "LOW"}); // seg ${("abcdefg")[i]}` : null
    }).filter(Boolean) as string[]
    if (dpPin != null) loopLines.push(`  digitalWrite(${dpPin}, LOW); // seg dp`)
    return { setupLines, loopLines, hasPin: true }
  },
  schematicSymbol: "seven_segment",
  schematicValue: () => "7-Seg",
}
