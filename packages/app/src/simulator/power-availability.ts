// ── Pre-solve topology seed ───────────────────────────────────────────────
//
// Answers "could this part be powered at all?" from wiring alone. This is the
// seed a peripheral uses at attach time, before any solve has completed; the
// PowerDomain is the authority from the first solved frame onward. Topology
// cannot distinguish 5V from a collapsed rail, so nothing downstream should
// treat this as an electrical claim.
//
// Deliberately free of any registry import: catalog parts call this from their
// own buildNetlist, and pulling the registry in here would close an init-time
// import cycle (see the same note in catalog/relay/index.tsx). Callers pass the
// part's declared model instead.

import { isBoardComponentType, resolveComponentPins, type BoardComponent, type Wire } from "@dreamer/schemas"
import type { PartPowerModel } from "@/components/part-spec"
import { componentSurfaceBoardId, getComponentFootprint, resolveNets, terminalAddressKey } from "@/breadboard/breadboard-grid"

function powerSupplyNets(
  components: Record<string, BoardComponent>,
  pointToNet: Map<string, string>,
): { positive: Set<string>; ground: Set<string> } {
  const positive = new Set<string>()
  const ground = new Set<string>()
  for (const component of Object.values(components)) {
    if (component.type !== "power_supply") continue
    const boardId = componentSurfaceBoardId(component, components)
    const points = getComponentFootprint(component.type, component.y, component.x, component.rotation, component.properties).points
    // Footprint polarity mirrors the PSU's buildNetlist: indices 1,3,5,7 are
    // the + rail columns (−1, 11 — the second column of each pair), indices
    // 0,2,4,6 the − columns (−2, 10).
    for (const index of [1, 3, 5, 7]) {
      const point = points[index]
      if (point) {
        const net = pointToNet.get(terminalAddressKey({ ...point, boardId }))
        if (net) positive.add(net)
      }
    }
    for (const index of [0, 2, 4, 6]) {
      const point = points[index]
      if (point) {
        const net = pointToNet.get(terminalAddressKey({ ...point, boardId }))
        if (net) ground.add(net)
      }
    }
  }
  return { positive, ground }
}

/**
 * True when the part's declared supply pin lands on a source net and — if it
 * declares one — its return pin lands on a reference net.
 *
 * A part with no declared return (the DC motor returns through its driver pin)
 * is judged on its supply pin alone. Requiring a ground pin it does not have
 * would report it permanently dead.
 */
export function isComponentPowered(
  component: BoardComponent,
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  model: PartPowerModel | undefined,
): boolean {
  if (!model || isBoardComponentType(component.type)) return false
  const nets = resolveNets(components, wires)
  const pointToNet = new Map<string, string>()
  const positive = new Set<string>()
  const ground = new Set<string>()
  for (const net of nets) {
    for (const point of net.points) pointToNet.set(terminalAddressKey(point), net.id)
    if (net.arduinoPins.some((pin) => pin === -1 || pin === -2 || pin === -12)) positive.add(net.id)
    if (net.arduinoPins.some((pin) => pin === -3 || pin === -4 || pin === -6)) ground.add(net.id)
  }
  const supply = powerSupplyNets(components, pointToNet)
  for (const net of supply.positive) positive.add(net)
  for (const net of supply.ground) ground.add(net)

  const boardId = componentSurfaceBoardId(component, components)
  const pinMap = resolveComponentPins(component.type, component.y, component.x, component.properties)
  const resolvesTo = (names: readonly string[], validNets: Set<string>) =>
    names.some((name) => {
      const point = pinMap[name]
      return !!point && validNets.has(pointToNet.get(terminalAddressKey({ ...point, boardId })) ?? "")
    })
  if (!resolvesTo(model.supply, positive)) return false
  return model.return === undefined || resolvesTo(model.return, ground)
}
