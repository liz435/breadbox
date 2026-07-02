import type { Wire } from "@dreamer/schemas"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

// Switched-contact model, mirroring the button: a closed contact is a near
// short, an open one a near-open. The coil state picks which side conducts.
const CONTACT_CLOSED_OHMS = 0.01
const CONTACT_OPEN_OHMS = 10_000_000

/**
 * Find the Arduino pin wired to a breadboard hole via same-row bus-cluster
 * semantics (cols 0-4 / 5-9 are one net). Local copy of the LCD peripheral's
 * resolver — the shared component-pin-resolver would pull the registry back
 * into this module at init time (a fatal import cycle).
 */
function resolveArduinoPinForHole(
  wires: Record<string, Wire>,
  targetRow: number,
  targetCol: number,
): number | null {
  const clusterOf = (col: number): "L" | "R" | null => {
    if (col >= 0 && col <= 4) return "L"
    if (col >= 5 && col <= 9) return "R"
    return null
  }
  const targetCluster = clusterOf(targetCol)
  if (!targetCluster) return null
  for (const w of Object.values(wires)) {
    if (w.fromRow === -999 && w.toRow === targetRow && clusterOf(w.toCol) === targetCluster) {
      return w.fromCol
    }
    if (w.toRow === -999 && w.fromRow === targetRow && clusterOf(w.fromCol) === targetCluster) {
      return w.toCol
    }
  }
  return null
}

export const relay: ComponentDefinition = {
  type: "relay",
  category: "output",
  description: "Single-channel relay module for switching high-power loads",
  label: "Relay",
  defaultPins: { out: null, com: null, no: null, nc: null },
  defaultProperties: {},
  accentColor: "#3b82f6",
  // Coil side (rows 0-2: vcc/signal/gnd) plus switched contacts appended on
  // rows 3-5 (com/no/nc) — see resolveComponentPins("relay").
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row: row + 1, col },
      { row: row + 2, col },
      { row: row + 3, col },
      { row: row + 4, col },
      { row: row + 5, col },
    ],
    width: HOLE_SPACING * 2,
    height: HOLE_SPACING * 6,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={3} y={3} width={18} height={18} rx={2} fill="#1e40af" stroke="#1e3a5f" strokeWidth={0.8} />
      <rect x={6} y={6} width={12} height={8} rx={1} fill="#3b82f6" opacity={0.4} />
      <text x={12} y={12} textAnchor="middle" fontSize={5} fill="#93c5fd" fontFamily="monospace">RELAY</text>
      <line x1={8} y1={18} x2={8} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={12} y1={18} x2={12} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={16} y1={18} x2={16} y2={22} stroke="#a0a0a0" strokeWidth={1} />
    </svg>
  ),
  // The contacts genuinely switch in the circuit: COM↔NO closes (and COM↔NC
  // opens) when the coil/signal input reads digital HIGH, so a load wired
  // through the relay really turns on and off in the solve.
  buildNetlist: (comp, { footprint, resolveNode, pinStates, wires }) => {
    const comPoint = footprint.points[3]
    const noPoint = footprint.points[4]
    const ncPoint = footprint.points[5]
    if (!comPoint || !noPoint || !ncPoint) return null

    const coilPin =
      typeof comp.pins.out === "number" && comp.pins.out >= 0
        ? comp.pins.out
        : resolveArduinoPinForHole(wires, comp.y + 1, comp.x) // signal hole
    const coilState = coilPin != null ? pinStates[coilPin] : undefined
    const energized =
      coilState?.mode === "OUTPUT" &&
      (coilState.isPwm ? coilState.pwmValue > 127 : coilState.digitalValue === 1)

    const com = resolveNode(comPoint)
    const no = resolveNode(noPoint)
    const nc = resolveNode(ncPoint)
    const id = sanitize(comp.id)
    const lines: string[] = []
    if (com !== no) {
      lines.push(`R_${id}_no ${com} ${no} ${energized ? CONTACT_CLOSED_OHMS : CONTACT_OPEN_OHMS}`)
    }
    if (com !== nc) {
      lines.push(`R_${id}_nc ${com} ${nc} ${energized ? CONTACT_OPEN_OHMS : CONTACT_CLOSED_OHMS}`)
    }
    if (lines.length === 0) return null
    return { lines, nodeA: com, nodeB: no }
  },
  generateSketch: (comp) => {
    const pin = comp.pins.out ?? comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
      loopLines: [
        `  digitalWrite(${pin}, HIGH); // ${comp.name} ON`,
        `  delay(1000);`,
        `  digitalWrite(${pin}, LOW); // ${comp.name} OFF`,
        `  delay(1000);`,
      ],
      hasPin: true,
    }
  },
  schematicSymbol: "relay",
  schematicValue: () => "Relay",
}
