// ── Netlist Builder ─────────────────────────────────────────────────────
//
// Converts board state (components, wires, pin states) into a SPICE
// netlist string that can be fed to `spicey.simulate()`.

import {
  MAX_ARDUINO_PIN,
  isBoardComponentType,
  resolveComponentPins,
  type BoardComponent,
  type Wire,
  type PinState,
} from "@dreamer/schemas"
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

const ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS = 25

// TODO(multi-board-resolver): inherits resolveNets's single-board assumption.
// In a scene with >1 surface board, components on different boards that
// happen to share (row, col) will be merged into the same SPICE node,
// producing a wrong netlist. The fix lives in breadboard-grid.ts; once
// resolveNets returns board-scoped nets this function will pick it up
// for free.
/** Latched parallel outputs (Q0..Q7) per shift-register component id. */
export type ShiftRegisterOutputs = ReadonlyMap<string, readonly boolean[]>

const SHIFT_REGISTER_OUTPUT_KEYS = ["q0", "q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const

export function buildNetlist(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  pinStates: PinState[],
  shiftRegisterOutputs?: ShiftRegisterOutputs,
): NetlistResult {
  const nets = resolveNets(components, wires)
  const lines: string[] = []
  const modelLines = new Set<string>()
  const componentNodePairs = new Map<string, { nodeA: string; nodeB: string }>()

  // Determine which nets connect to fixed ground (Arduino GND pins).
  // Also determine voltage source nets (5V pin = -1, 3V3 pin = -2, or digital
  // pins set OUTPUT HIGH/PWM/LOW).
  const groundNetIds = new Set<string>()
  const voltageSourceNets: Array<{
    label: string
    netId: string
    voltage: number
    sourceResistanceOhms?: number
  }> = []

  // Build a point→netId lookup for fast component-to-net resolution
  const pointToNetId = new Map<string, string>()
  for (const net of nets) {
    for (const pt of net.points) {
      pointToNetId.set(pointKey(pt), net.id)
    }
  }

  // Track which nets touch any component footprint so we can identify floating
  // component nets and add bleed resistors for solver stability.
  const componentNets = new Set<string>()
  for (const comp of Object.values(components)) {
    if (isBoardComponentType(comp.type) || comp.type === "wire") continue
    const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
    for (const pt of footprint.points) {
      const nid = pointToNetId.get(pointKey(pt))
      if (nid) componentNets.add(nid)
    }
  }

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
      } else if (arduinoPin >= 0 && arduinoPin <= MAX_ARDUINO_PIN) {
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
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
            })
          } else if (ps.digitalValue === 1) {
            voltageSourceNets.push({
              label: `V_D${arduinoPin}`,
              netId: net.id,
              voltage: 5,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
            })
          } else {
            // Pin is OUTPUT LOW → drive 0V through realistic output resistance.
            voltageSourceNets.push({
              label: `V_D${arduinoPin}_LOW`,
              netId: net.id,
              voltage: 0,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
            })
          }
        } else if (!ps || ps.mode === "UNSET") {
          // UNSET pins are high-impedance by default: do not source/sink.
        }
      }
    }
  }

  // Shift-register parallel outputs. The 74HC595 isn't an Arduino pin, so its
  // Q0..Q7 lines never show up in net.arduinoPins. Instead, drive each output
  // net from the peripheral's latched byte: HIGH → 5V, LOW → 0V, through the
  // same output resistance a real driver pin has. Wired LEDs then light via the
  // normal diode path. When the byte isn't supplied (sim not running) the chip
  // sources nothing and the outputs stay dark.
  if (shiftRegisterOutputs && shiftRegisterOutputs.size > 0) {
    for (const comp of Object.values(components)) {
      if (comp.type !== "shift_register") continue
      const outputs = shiftRegisterOutputs.get(comp.id)
      if (!outputs) continue
      const pinMap = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties)
      for (let i = 0; i < SHIFT_REGISTER_OUTPUT_KEYS.length; i++) {
        const pt = pinMap[SHIFT_REGISTER_OUTPUT_KEYS[i]]
        if (!pt) continue
        const netId = pointToNetId.get(pointKey(pt))
        if (!netId) continue
        voltageSourceNets.push({
          label: `V_SR_${sanitize(comp.id)}_Q${i}`,
          netId,
          voltage: outputs[i] ? 5 : 0,
          sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
        })
      }
    }
  }

  const nodeMap = buildNodeMap(nets, groundNetIds)

  // Bleed every floating net (no voltage source, no ground, at least one
  // component pin touching it) to ground via a large resistor.
  //
  // Why:
  //   spicey's modified-nodal-analysis solver needs every node to have a DC
  //   path to ground. A pair of floating nets connected only by a resistor
  //   (classic example: a resistor sitting on an unwired row of the
  //   breadboard) has no absolute voltage reference and produces a singular
  //   conductance matrix — spicey throws "Singular matrix (real)" and the
  //   ENTIRE solve fails. That means one dangling resistor silently breaks
  //   every unrelated component on the board: the pot stops reading, LEDs
  //   stop updating, analogRead returns stale values forever.
  //
  //   A 1 GΩ bleed to ground is large enough that it doesn't perturb real
  //   circuit voltages (leakage on that scale is nanoamps) but guarantees
  //   every node has a path to ground, so the solver always converges.
  //
  // What counts as "floating":
  //   - Not already tied to ground by an Arduino GND pin.
  //   - No voltage source driving it (5V pin, 3V3 pin, OUTPUT-HIGH digital
  //     pin, PWM pin, etc.).
  //   - Has at least one component footprint point on it — otherwise it's
  //     purely an unused breadboard bus and doesn't need a bleed.
  const voltageSourceNetIds = new Set(voltageSourceNets.map((v) => v.netId))
  for (const net of nets) {
    if (groundNetIds.has(net.id)) continue
    if (voltageSourceNetIds.has(net.id)) continue
    if (!componentNets.has(net.id)) continue
    // Use the net's first point to look up its SPICE node name.
    const representativeKey = pointKey(net.points[0])
    const nodeName = nodeMap.get(representativeKey)
    if (!nodeName || nodeName === "0") continue
    lines.push(`R_bleed_float_${net.id} ${nodeName} 0 1000000000`)
  }

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

    if (vs.sourceResistanceOhms && vs.sourceResistanceOhms > 0) {
      const sourceNode = `src_${vsIndex}`
      lines.push(`${vs.label}_${vsIndex} ${sourceNode} 0 ${vs.voltage}`)
      lines.push(`R_src_${vsIndex} ${sourceNode} ${nodeName} ${vs.sourceResistanceOhms}`)
    } else {
      lines.push(`${vs.label}_${vsIndex} ${nodeName} 0 ${vs.voltage}`)
    }
    vsIndex++
  }

  // Build component elements
  for (const comp of Object.values(components)) {
    if (isBoardComponentType(comp.type) || comp.type === "wire") continue

    const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
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
        const nodeA = result.nodeA
        const nodeB = result.nodeB
        let bleedIdx = lines.filter((l) => l.startsWith("R_bleed_")).length
        if (nodeA.startsWith("unconnected_")) {
          lines.push(`R_bleed_${bleedIdx} ${nodeA} 0 1000000000`)
          bleedIdx++
        }
        if (nodeB.startsWith("unconnected_")) {
          lines.push(`R_bleed_${bleedIdx} ${nodeB} 0 1000000000`)
        }

        // If both pins resolve to the same SPICE node, emitting the element
        // would create a self-loop (e.g. "R_led1 0 0 120"), which collapses a
        // row in the conductance matrix and makes spicey throw "Singular
        // matrix (real)". That one failure then aborts the whole solve so
        // *every other component* — including unrelated potentiometers —
        // reads as inactive, which shows up to the user as "analogRead never
        // changes". Drop the element lines but still register the pair so
        // downstream code reports the component as present (inactive).
        //
        // This most commonly happens when an LED is wired anode→D<n> and
        // cathode→GND but the sketch pulls D<n> LOW: both ends collapse to
        // node "0".
        if (nodeA !== nodeB) {
          lines.push(...result.lines)
        }
        if (result.modelLines) {
          for (const modelLine of result.modelLines) {
            modelLines.add(modelLine)
          }
        }
        componentNodePairs.set(comp.id, { nodeA, nodeB })
      }
    }
  }

  // Transient analysis — short run for DC operating point
  if (modelLines.size > 0) {
    for (const modelLine of Array.from(modelLines).sort()) {
      lines.push(modelLine)
    }
  }
  lines.push(".tran 0.001 0.01")

  const netlist = lines.join("\n")

  return { netlist, nets, nodeMap, componentNodePairs }
}

/** Sanitize a component ID for use in SPICE element names */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)
}
