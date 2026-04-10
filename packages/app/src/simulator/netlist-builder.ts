// ── Netlist Builder ─────────────────────────────────────────────────────
//
// Converts board state (components, wires, pin states) into a SPICE
// netlist string that can be fed to `spicey.simulate()`.

import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import {
  resolveNets,
  getComponentFootprint,
  type Net,
  type GridPoint,
} from "@/breadboard/breadboard-grid"
import { getComponentDef } from "@/components/registry"

// ── Helpers ──────────────────────────────────────────────────────────

function pointKey(p: GridPoint): string {
  return `${p.row},${p.col}`
}

/**
 * Map every grid point to a SPICE node name via the net it belongs to.
 * Node "0" is always ground.
 */
function buildNodeMap(
  nets: Net[],
  groundNetIds: Set<string>,
): Map<string, string> {
  const nodeMap = new Map<string, string>()

  for (const net of nets) {
    const spiceName = groundNetIds.has(net.id) ? "0" : `net_${net.id}`
    for (const pt of net.points) {
      nodeMap.set(pointKey(pt), spiceName)
    }
  }

  return nodeMap
}

/**
 * Resolve the SPICE node that a grid point belongs to.
 * Falls back to a unique unconnected node name to avoid errors.
 */
function resolveNode(
  nodeMap: Map<string, string>,
  point: GridPoint,
): string {
  return nodeMap.get(pointKey(point)) ?? `unconnected_${point.row}_${point.col}`
}

// ── Public API ───────────────────────────────────────────────────────

export type NetlistResult = {
  netlist: string
  nets: Net[]
  nodeMap: Map<string, string>
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>
}

export function buildNetlist(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  pinStates: PinState[],
): NetlistResult {
  const nets = resolveNets(components, wires)
  const lines: string[] = []
  const componentNodePairs = new Map<string, { nodeA: string; nodeB: string }>()

  // Determine which nets connect to GND (Arduino pin -3 or -4, or pins set to LOW with mode OUTPUT)
  // Also determine voltage source nets (5V pin = -1, or digital pins set HIGH / PWM)
  const groundNetIds = new Set<string>()
  const voltageSourceNets: Array<{
    label: string
    netId: string
    voltage: number
  }> = []

  // Build a point→netId lookup for fast component-to-net resolution
  const pointToNetId = new Map<string, string>()
  for (const net of nets) {
    for (const pt of net.points) {
      pointToNetId.set(pointKey(pt), net.id)
    }
  }

  // Build a set of component types per net for topology-based inference
  const netComponentTypes = new Map<string, Set<string>>()
  for (const comp of Object.values(components)) {
    if (comp.type === "arduino_uno" || comp.type === "wire") continue
    const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation)
    for (const pt of footprint.points) {
      const nid = pointToNetId.get(pointKey(pt))
      if (nid) {
        if (!netComponentTypes.has(nid)) netComponentTypes.set(nid, new Set())
        netComponentTypes.get(nid)!.add(comp.type)
      }
    }
  }

  // Output component types — if one of these is on a net with a digital pin,
  // infer the pin is OUTPUT HIGH when the sketch isn't running
  const OUTPUT_COMPONENT_TYPES = new Set([
    "led", "rgb_led", "buzzer", "servo", "dc_motor", "relay", "neopixel",
  ])

  for (const net of nets) {
    for (const arduinoPin of net.arduinoPins) {
      // Power pins
      if (arduinoPin === -1) {
        // 5V pin
        voltageSourceNets.push({ label: "V_5V", netId: net.id, voltage: 5 })
      } else if (arduinoPin === -2) {
        // 3.3V pin
        voltageSourceNets.push({ label: "V_3V3", netId: net.id, voltage: 3.3 })
      } else if (arduinoPin === -3 || arduinoPin === -4) {
        // GND pins
        groundNetIds.add(net.id)
      } else if (arduinoPin === -5) {
        // VIN — treat as unregulated input, skip for now
      } else if (arduinoPin === -6) {
        // Second GND
        groundNetIds.add(net.id)
      } else if (arduinoPin >= 0 && arduinoPin <= 19) {
        // Digital/analog pin — check pin state from simulation
        const ps = pinStates[arduinoPin]
        if (ps && ps.mode === "OUTPUT") {
          // Sketch is running and has set this pin to OUTPUT
          if (ps.isPwm) {
            const voltage = (ps.pwmValue / 255) * 5
            voltageSourceNets.push({
              label: `V_D${arduinoPin}`,
              netId: net.id,
              voltage,
            })
          } else if (ps.digitalValue === 1) {
            voltageSourceNets.push({
              label: `V_D${arduinoPin}`,
              netId: net.id,
              voltage: 5,
            })
          } else {
            // Pin is LOW → connect to ground
            groundNetIds.add(net.id)
          }
        } else if (!ps || ps.mode === "UNSET") {
          // Sketch is NOT running — infer pin direction from wire topology.
          // If this net contains an output component (LED, buzzer, etc.),
          // assume the pin is driving it at 5V so the circuit analysis works
          // even before the user clicks Run.
          const compTypes = netComponentTypes.get(net.id)
          if (compTypes) {
            const hasOutputComponent = [...compTypes].some((t) => OUTPUT_COMPONENT_TYPES.has(t))
            if (hasOutputComponent) {
              voltageSourceNets.push({
                label: `V_D${arduinoPin}`,
                netId: net.id,
                voltage: 5,
              })
            }
          }
        }
      }
    }
  }

  const nodeMap = buildNodeMap(nets, groundNetIds)

  // Deduplicate voltage sources: only one source per unique node name
  const seenSourceNodes = new Set<string>()
  let vsIndex = 0

  for (const vs of voltageSourceNets) {
    const nodeName = nodeMap.get(
      pointKey(
        nets.find((n) => n.id === vs.netId)?.points[0] ?? { row: -999, col: -999 },
      ),
    )
    if (!nodeName || nodeName === "0") continue
    if (seenSourceNodes.has(nodeName)) continue
    seenSourceNodes.add(nodeName)

    lines.push(`${vs.label}_${vsIndex} ${nodeName} 0 ${vs.voltage}`)
    vsIndex++
  }

  // Build component elements
  for (const comp of Object.values(components)) {
    if (comp.type === "arduino_uno" || comp.type === "wire") continue

    const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation)
    const def = getComponentDef(comp.type)

    if (def?.buildNetlist) {
      const ctx = {
        footprint,
        resolveNode: (pt: GridPoint) => resolveNode(nodeMap, pt),
        pinStates,
        wires,
      }
      const result = def.buildNetlist(comp, ctx)
      if (result) {
        // Add a large bleed resistor (1GΩ) to ground for any floating node so
        // the SPICE solver doesn't produce a singular matrix. This is better than
        // skipping the component entirely — it keeps the component in the netlist
        // (e.g. a button with one unwired side) without affecting circuit voltages.
        let nodeA = result.nodeA
        let nodeB = result.nodeB
        let bleedIdx = lines.filter((l) => l.startsWith("R_bleed_")).length
        if (nodeA.startsWith("unconnected_")) {
          lines.push(`R_bleed_${bleedIdx} ${nodeA} 0 1000000000`)
          bleedIdx++
        }
        if (nodeB.startsWith("unconnected_")) {
          lines.push(`R_bleed_${bleedIdx} ${nodeB} 0 1000000000`)
        }

        lines.push(...result.lines)
        componentNodePairs.set(comp.id, { nodeA, nodeB })
      }
    }
  }

  // Transient analysis — short run for DC operating point
  lines.push(".tran 0.001 0.01")

  const netlist = lines.join("\n")

  return { netlist, nets, nodeMap, componentNodePairs }
}

/** Sanitize a component ID for use in SPICE element names */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)
}
