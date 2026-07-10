import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"
import { powerSupplyPinRows } from "./pin-rows"

// Drops onto the top of the breadboard and feeds all four power rails.
// Each side (left/right) has its own voltage selector (5V or 3.3V).
// Footprint ignores the click column — pins are anchored to the four
// rail columns (-2, -1, 10, 11), so wherever the user clicks horizontally
// the module always lands across both rail pairs. The click row snaps to a
// rail block (see powerSupplyPinRows): pins land on the block's 1st and 5th
// holes, matching the real MB102's 4-hole pin-row gap.
export const powerSupply: ComponentDefinition = {
  type: "power_supply",
  category: "other",
  description: "MB102 breadboard PSU — feeds 5V/3.3V to both power rails",
  label: "Power Supply",
  defaultPins: {},
  defaultProperties: { leftVoltage: 5, rightVoltage: 3.3 },
  accentColor: "#10b981",
  footprint: (row) => {
    const [top, bottom] = powerSupplyPinRows(row)
    return {
      points: [
        { row: top, col: -2 },
        { row: top, col: -1 },
        { row: top, col: 10 },
        { row: top, col: 11 },
        { row: bottom, col: -2 },
        { row: bottom, col: -1 },
        { row: bottom, col: 10 },
        { row: bottom, col: 11 },
      ],
      width: HOLE_SPACING * 18,
      height: HOLE_SPACING * 6,
    }
  },
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={2} y={6} width={20} height={12} rx={2} fill="#0c4a3a" stroke="#0e6b51" strokeWidth={1} />
      <rect x={6} y={9} width={6} height={6} rx={1} fill="#1a1a1a" />
      <circle cx={9} cy={12} r={1.4} fill="#404040" />
      <rect x={14} y={9} width={6} height={5} rx={0.6} fill="#9ca3af" />
      <text x={12} y={5} textAnchor="middle" fontSize={3} fill="#9ca3af" fontFamily="monospace">PSU</text>
    </svg>
  ),
  buildNetlist: (comp, { footprint, resolveNode }) => {
    // The 8 footprint points correspond to:
    //   0,4: left + rail (red)
    //   1,5: left − rail (blue, ground)
    //   2,6: right − rail (blue, ground)
    //   3,7: right + rail (red)
    const lPlusNode = resolveNode(footprint.points[0])
    const lMinusNode = resolveNode(footprint.points[1])
    const rMinusNode = resolveNode(footprint.points[2])
    const rPlusNode = resolveNode(footprint.points[3])

    const leftV = (comp.properties.leftVoltage as number | undefined) ?? 5
    const rightV = (comp.properties.rightVoltage as number | undefined) ?? 3.3

    const id = sanitize(comp.id)
    const lines: string[] = []

    // Tie both − rails to ground via a tiny resistor. Using 1Ω instead
    // of a hard short avoids the singular-matrix trap that 0Ω elements
    // create in spicey's MNA solver, while still being negligible
    // compared to any real load on the rail (the rail effectively
    // sits at < 1 mV under normal currents).
    lines.push(`R_${id}_LGND ${lMinusNode} 0 1`)
    lines.push(`R_${id}_RGND ${rMinusNode} 0 1`)

    // Voltage sources from each + rail to ground.
    lines.push(`V_${id}_L ${lPlusNode} 0 ${leftV}`)
    lines.push(`V_${id}_R ${rPlusNode} 0 ${rightV}`)

    // Report the left + rail and left − rail as the primary node pair
    // — the electrical state lookup uses these to display voltage/current.
    return { lines, nodeA: lPlusNode, nodeB: lMinusNode }
  },
  computeElectricalState: (_comp, { voltageDrop }) => ({
    // Always "active" — this is a power source, not a passive load.
    // We don't want the dim-when-inactive overlay obscuring the module.
    isActive: true,
    voltage: Math.abs(voltageDrop),
    current: 0,
    isReversed: false,
    brightness: 0,
  }),
  generateSketch: () => null,
}
