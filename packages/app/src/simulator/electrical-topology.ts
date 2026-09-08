// ── Electrical topology contract ─────────────────────────────────────
//
// The board is the source of truth for connectivity. Consumers such as the
// schematic and SPICE compiler must not each infer their own version of the
// breadboard graph. This module gives those consumers one deliberately small
// contract: resolved nets plus a stable lookup for named component terminals.

import {
  isBoardComponentType,
  resolveComponentPins,
  type BoardComponent,
  type Wire,
} from "@dreamer/schemas"
import {
  componentSurfaceBoardId,
  terminalAddressKey,
  getComponentFootprint,
  type Net,
  type TerminalAddress,
} from "@/breadboard/breadboard-grid"
import { compileElectricalTopology as compileBoardTopology } from "@dreamer/board-domain"
import { getComponentDef } from "@/components/registry"

export type ElectricalTerminal = {
  componentId: string
  pinName: string
  address: TerminalAddress
  netId: string | null
}

export type TopologyDiagnostic = {
  code: "unconnected_terminal"
  componentId: string
  pinName: string
  message: string
}

export type ElectricalTopology = {
  nets: Net[]
  terminals: ElectricalTerminal[]
  terminalToNet: Map<string, string>
  diagnostics: TopologyDiagnostic[]
}

export function electricalTerminalKey(componentId: string, pinName: string): string {
  return `${componentId}\u0000${pinName}`
}

function addressInNet(address: TerminalAddress, net: Net): boolean {
  const key = terminalAddressKey(address)
  return net.points.some((point) => terminalAddressKey(point) === key)
}

/**
 * Compile the physical board topology once for all electrical consumers.
 *
 * `resolveNets` remains the low-level breadboard implementation. Keeping this
 * adapter separate means schematic, SPICE, ERC, and future exporters share a
 * contract without importing one another or duplicating pin matching logic.
 */
export function compileElectricalTopology(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): ElectricalTopology {
  // The board-domain compiler is the cross-package source of truth. The app
  // adapter only enriches its result with registry-aware terminal metadata
  // needed by schematic/SPICE diagnostics.
  const customFootprints = (type: string) => {
    if (!type.startsWith("custom:")) return undefined
    const definition = getComponentDef(type)
    if (!definition) return undefined
    const names = Object.keys(definition.defaultPins)
    const points = definition.footprint(0, 0, definition.defaultProperties).points
    return names.map((name, index) => {
      const point = points[index]
      return point == null ? undefined : { name, dx: point.col, dy: point.row }
    }).filter((point): point is { name: string; dx: number; dy: number } => point != null)
  }
  const nets = compileBoardTopology({ components, wires }, customFootprints).nets as Net[]
  const terminals: ElectricalTerminal[] = []
  const terminalToNet = new Map<string, string>()
  const diagnostics: TopologyDiagnostic[] = []

  for (const component of Object.values(components)) {
    if (isBoardComponentType(component.type) || component.type === "wire") continue

    const boardId = componentSurfaceBoardId(component, components)
    const namedPins = resolveComponentPins(
      component.type,
      component.y,
      component.x,
      component.properties,
    )
    const pinEntries = Object.entries(namedPins)
    const fallbackPoints = getComponentFootprint(
      component.type,
      component.y,
      component.x,
      component.rotation,
      component.properties,
    ).points
    const entries = pinEntries.length > 0
      ? pinEntries.map(([pinName, point]) => [pinName, point] as const)
      : fallbackPoints.map((point, index) => [`pin${index}`, point] as const)

    for (const [pinName, point] of entries) {
      const address = { ...point, boardId }
      const net = nets.find((candidate) => addressInNet(address, candidate))
      const terminal: ElectricalTerminal = {
        componentId: component.id,
        pinName,
        address,
        netId: net?.id ?? null,
      }
      terminals.push(terminal)
      if (net) {
        terminalToNet.set(electricalTerminalKey(component.id, pinName), net.id)
      } else {
        diagnostics.push({
          code: "unconnected_terminal",
          componentId: component.id,
          pinName,
          message: `${component.name} pin ${pinName} is not connected to a resolved net`,
        })
      }
    }
  }

  return { nets, terminals, terminalToNet, diagnostics }
}
