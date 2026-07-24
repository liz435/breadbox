import type { Wire } from "@dreamer/schemas"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import type { PartPowerModel } from "@/components/part-spec"
import { sanitize } from "@/components/catalog/_shared"
import { isComponentPowered } from "@/simulator/power-availability"

// Switched-contact model, mirroring the button: a closed contact is a near
// short, an open one a near-open. The coil state picks which side conducts.
const CONTACT_CLOSED_OHMS = 0.01
const CONTACT_OPEN_OHMS = 10_000_000

// Named separately so buildNetlist's pre-solve seed can pass it without
// referencing `relay` before its own initializer has run.
const RELAY_POWER: PartPowerModel = {
  supply: ["vcc", "power"],
  return: ["gnd", "ground"],
  minOperatingVolts: 4.5,
}

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
  power: RELAY_POWER,
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
  // opens) only when the input is commanded *and* the coil has its own VCC
  // and GND topology. A HIGH GPIO is not enough to move an unpowered relay.
  buildNetlist: (comp, { footprint, resolveNode, pinStates, wires, components, peripheralStates }) => {
    const coilVcc = resolveNode(footprint.points[0])
    const coilGnd = resolveNode(footprint.points[2] ?? footprint.points[0])
    const comPoint = footprint.points[3]
    const noPoint = footprint.points[4]
    const ncPoint = footprint.points[5]
    if (!comPoint || !noPoint || !ncPoint) return null

    // Backward-compat gate: boards saved before the relay had contact pins
    // may have unrelated circuitry on rows y+3..y+5 — blindly emitting a
    // closed COM↔NO branch there would silently short those rows together.
    // Only switch the contacts when the user has actually wired the COM hole
    // (any wire endpoint in its row cluster), which old layouts never did.
    const hasWireAt = (row: number, col: number): boolean => {
      const clusterOf = (c: number): "L" | "R" | null => (c >= 0 && c <= 4 ? "L" : c >= 5 && c <= 9 ? "R" : null)
      const cluster = clusterOf(col)
      if (!cluster) return false
      return Object.values(wires).some(
        (w) =>
          (w.toRow === row && clusterOf(w.toCol) === cluster) ||
          (w.fromRow === row && clusterOf(w.fromCol) === cluster),
      )
    }
    if (!hasWireAt(comPoint.row, comPoint.col)) {
      // The relay module still draws coil current when powered even if no
      // switched load is wired. 70Ω is a conservative 5V relay-coil model.
      return { lines: [`R_${sanitize(comp.id)} ${coilVcc} ${coilGnd} 70`], nodeA: coilVcc, nodeB: coilGnd }
    }

    const coilPin =
      typeof comp.pins.out === "number" && comp.pins.out >= 0
        ? comp.pins.out
        : resolveArduinoPinForHole(wires, comp.y + 1, comp.x) // signal hole
    const coilState = coilPin != null ? pinStates[coilPin] : undefined
    const powered = components ? isComponentPowered(comp, components, wires, RELAY_POWER) : true
    const peripheralState = peripheralStates?.[comp.id]
    const mechanicallyEnergized = peripheralState?.kind === "relay"
      ? peripheralState.energized
      : undefined
    const energized = mechanicallyEnergized ?? (
      powered &&
      coilState?.mode === "OUTPUT" &&
      (coilState.isPwm ? coilState.pwmValue > 127 : coilState.digitalValue === 1)
    )

    const com = resolveNode(comPoint)
    const no = resolveNode(noPoint)
    const nc = resolveNode(ncPoint)
    const id = sanitize(comp.id)
    const lines: string[] = [`R_${id} ${coilVcc} ${coilGnd} 70`]
    if (com !== no) {
      lines.push(`R_${id}_no ${com} ${no} ${energized ? CONTACT_CLOSED_OHMS : CONTACT_OPEN_OHMS}`)
    }
    if (com !== nc) {
      lines.push(`R_${id}_nc ${com} ${nc} ${energized ? CONTACT_OPEN_OHMS : CONTACT_CLOSED_OHMS}`)
    }
    return { lines, nodeA: coilVcc, nodeB: coilGnd }
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
