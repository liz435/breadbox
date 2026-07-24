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
  componentSurfaceBoardId,
  terminalAddressKey,
  type Net,
  type GridPoint,
  type TerminalAddress,
} from "@/breadboard/breadboard-grid"
import { getComponentDef } from "@/components/registry"
import { powerModelFor } from "./power-model"
import type { PeripheralState } from "./peripherals/types"

// ── Helpers ──────────────────────────────────────────────────────────

function pointKey(p: GridPoint | TerminalAddress): string {
  return terminalAddressKey(p)
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
  const localNames = new Map<string, Set<string>>()

  for (const net of nets) {
    const spiceName = groundNetIds.has(net.id) ? "0" : `net_${net.id}`
    for (const pt of net.points) {
      nodeMap.set(pointKey(pt), spiceName)
      const localKey = `${pt.row},${pt.col}`
      const names = localNames.get(localKey) ?? new Set<string>()
      names.add(spiceName)
      localNames.set(localKey, names)
    }
  }

  // Legacy callers only know local coordinates. Preserve that lookup when it
  // has one electrical meaning; deliberately omit it when two boards make the
  // coordinate ambiguous so no caller can silently short them together.
  for (const [localKey, names] of localNames) {
    if (names.size === 1) nodeMap.set(localKey, names.values().next().value!)
  }

  return nodeMap
}

/**
 * Resolve the SPICE node that a grid point belongs to.
 * Falls back to a unique unconnected node name to avoid errors.
 */
function resolveNode(
  nodeMap: Map<string, string>,
  point: GridPoint | TerminalAddress,
): string {
  return nodeMap.get(pointKey(point)) ?? `unconnected_${point.row}_${point.col}`
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Netlist emission mode.
 *  - "op": legacy repeated operating-point solve. Capacitors emit as held
 *    V sources (see capacitor def), PWM stays duty-averaged DC.
 *  - "transient": real-physics path. Capacitors emit as C elements,
 *    inductors as L; PWM sources are flagged for the TransientSession to
 *    replace with square-wave waveforms phased to session time.
 */
export type NetlistMode = "op" | "transient"

export type NetlistResult = {
  netlist: string
  nets: Net[]
  nodeMap: Map<string, string>
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>
  /** Resolved supply requirement per component that declares a power model. */
  componentPowerBindings: Map<
    string,
    {
      /** SPICE node the part draws supply from; read ground-referenced. */
      supply: string
      /** True when the declared return reaches ground — either a fixed-ground
       * net or a supply's own return node. Null when the part declares no
       * return pin, so consumers know not to require one. */
      returnGrounded: boolean | null
      /** Ids of the supplies feeding `supply`, for fault inheritance. */
      supplyIds: string[]
    }
  >
  /**
   * Digital output pins that drive the circuit, with the SPICE element whose
   * branch current equals the pin's current and the net node it drives. Lets
   * the solver check each pin against the ATmega's per-pin current limits.
   */
  pinSources: Array<{ pin: number; element: string; node: string }>
  /**
   * PWM-driven sources. The emitted netlist holds each at its duty-averaged
   * voltage (the safe fallback); the solver can instead enumerate HIGH/LOW
   * switching states by flipping each source between `highVolts` and 0 and
   * weight-averaging the results — the physically correct time average for
   * nonlinear loads like LEDs (avg of currents, not current at avg voltage).
   * In transient mode the session installs a real square wave on the source
   * at `frequencyHz` instead.
   */
  pwmSources: Array<{ element: string; duty: number; highVolts: number; frequencyHz: number }>
  /**
   * The 5V / 3.3V rail sources, for supply-limit checks. Unlike digital pins
   * the rails come from the regulator/polyfuse, so they get their own (small)
   * source resistance and their own current limits.
   */
  railSources: Array<{ element: string; rail: "5V" | "3V3"; node: string }>
  /** Every solved supply, including external modules such as the MB102. */
  powerSources: Array<{
    id: string
    label: string
    element: string
    node: string
    /** The source's own return node, when it is not SPICE node "0". */
    returnNode?: string
    /** Set when this supply is an MCU board rail, so diagnostics can name the
     * real failure mode (polyfuse, regulator) instead of generic wording. */
    rail?: "5V" | "3V3"
    nominalVoltage: number
    currentLimitMa: number
    sourceResistanceOhms?: number
  }>
  /**
   * Rails that are wired directly into a ground net — a dead short. These
   * never make it into the netlist (the merged net IS node 0, so the source
   * is dropped), so they must be flagged at build time. `componentIds` are
   * the components touching the shorted net, for warning placement.
   */
  railShorts: Array<{ rail: "5V" | "3V3"; componentIds: string[] }>
}

const ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS = 25

/**
 * Nominal Uno PWM frequency per pin: Timer0 pins (5, 6) run ~976.56 Hz,
 * Timer1/Timer2 pins (9, 10, 3, 11) run ~490.2 Hz. Used by the transient
 * session to synthesize the real square wave.
 */
function pwmFrequencyForPin(pin: number): number {
  return pin === 5 || pin === 6 ? 976.5625 : 490.196
}
// The 5V rail on a real Uno comes through a ~0.3Ω polyfuse plus traces (USB)
// or the regulator; the 3V3 rail is an LP2985 LDO. Small series resistances
// make rails sag realistically under heavy load instead of holding an ideal
// 5.000V into a short.
const RAIL_5V_SOURCE_RESISTANCE_OHMS = 0.5
const RAIL_3V3_SOURCE_RESISTANCE_OHMS = 1.0

/** Latched parallel outputs (Q0..Q7) per shift-register component id. */
export type ShiftRegisterOutputs = ReadonlyMap<string, readonly boolean[]>

const SHIFT_REGISTER_OUTPUT_KEYS = ["q0", "q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const

export function buildNetlist(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  pinStates: PinState[],
  shiftRegisterOutputs?: ShiftRegisterOutputs,
  mode: NetlistMode = "op",
  peripheralStates?: Record<string, PeripheralState>,
): NetlistResult {
  const nets = resolveNets(components, wires)
  const lines: string[] = []
  const modelLines = new Set<string>()
  const componentNodePairs = new Map<string, { nodeA: string; nodeB: string }>()
  const componentPowerBindings: NetlistResult["componentPowerBindings"] = new Map()
  const pendingPowerNodes = new Map<
    string,
    { supply: string; return: string | null; declaresReturn: boolean }
  >()

  // Determine which nets connect to fixed ground (Arduino GND pins).
  // Also determine voltage source nets (5V pin = -1, 3V3 pin = -2, or digital
  // pins set OUTPUT HIGH/PWM/LOW).
  const groundNetIds = new Set<string>()
  const voltageSourceNets: Array<{
    label: string
    netId: string
    voltage: number
    sourceResistanceOhms?: number
    /** Arduino digital pin number, when this source is a driven I/O pin. */
    pin?: number
    /** PWM duty 0..1 when this source is a switching pin (voltage = duty-avg). */
    pwmDuty?: number
    /** HIGH-state voltage for a PWM source (what the pin drives when on). */
    pwmHighVolts?: number
    /** Set when this source is a supply rail rather than an I/O pin. */
    rail?: "5V" | "3V3"
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
    const boardId = componentSurfaceBoardId(comp, components)
    for (const pt of footprint.points) {
      const nid = pointToNetId.get(pointKey({ ...pt, boardId }))
      if (nid) componentNets.add(nid)
    }
  }

  for (const net of nets) {
    for (const arduinoPin of net.arduinoPins) {
      // Power pins
      if (arduinoPin === -1 || arduinoPin === -12) {
        // 5V pins (mid-strip -1 and the corner socket -12)
        voltageSourceNets.push({
          label: "V_5V",
          netId: net.id,
          voltage: 5,
          sourceResistanceOhms: RAIL_5V_SOURCE_RESISTANCE_OHMS,
          rail: "5V",
        })
      } else if (arduinoPin === -2) {
        // 3.3V pin
        voltageSourceNets.push({
          label: "V_3V3",
          netId: net.id,
          voltage: 3.3,
          sourceResistanceOhms: RAIL_3V3_SOURCE_RESISTANCE_OHMS,
          rail: "3V3",
        })
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
            // Netlist holds the duty-averaged voltage as the safe fallback;
            // the solver enumerates HIGH/LOW states via pwmSources when it can.
            const duty = ps.pwmValue / 255
            voltageSourceNets.push({
              label: `V_D${arduinoPin}`,
              netId: net.id,
              voltage: duty * 5,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
              pin: arduinoPin,
              pwmDuty: duty,
              pwmHighVolts: 5,
            })
          } else if (ps.digitalValue === 1) {
            voltageSourceNets.push({
              label: `V_D${arduinoPin}`,
              netId: net.id,
              voltage: 5,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
              pin: arduinoPin,
            })
          } else {
            // Pin is OUTPUT LOW → drive 0V through realistic output resistance.
            voltageSourceNets.push({
              label: `V_D${arduinoPin}_LOW`,
              netId: net.id,
              voltage: 0,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
              pin: arduinoPin,
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
      const boardId = componentSurfaceBoardId(comp, components)
      for (let i = 0; i < SHIFT_REGISTER_OUTPUT_KEYS.length; i++) {
        const pt = pinMap[SHIFT_REGISTER_OUTPUT_KEYS[i]]
        if (!pt) continue
        const netId = pointToNetId.get(pointKey({ ...pt, boardId }))
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

  // A supply rail landing in a ground net is a dead short: the merged net IS
  // node 0, so its source gets dropped below and no current would ever be
  // computed. Flag it here, attaching the components that touch the net so
  // the warning can render somewhere meaningful.
  const railShorts: NetlistResult["railShorts"] = []
  for (const vs of voltageSourceNets) {
    if (!vs.rail || !groundNetIds.has(vs.netId)) continue
    if (railShorts.some((s) => s.rail === vs.rail)) continue
    const componentIds: string[] = []
    for (const comp of Object.values(components)) {
      if (isBoardComponentType(comp.type) || comp.type === "wire") continue
      const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
      const boardId = componentSurfaceBoardId(comp, components)
      if (footprint.points.some((pt) => pointToNetId.get(pointKey({ ...pt, boardId })) === vs.netId)) {
        componentIds.push(comp.id)
      }
    }
    railShorts.push({ rail: vs.rail, componentIds })
  }

  // Deduplicate voltage sources: only one source per unique node name
  const seenSourceNodes = new Set<string>()
  const pinSources: NetlistResult["pinSources"] = []
  const pwmSources: NetlistResult["pwmSources"] = []
  const railSources: NetlistResult["railSources"] = []
  const powerSources: NetlistResult["powerSources"] = []
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

    const element = `${vs.label}_${vsIndex}`
    if (vs.sourceResistanceOhms && vs.sourceResistanceOhms > 0) {
      const sourceNode = `src_${vsIndex}`
      lines.push(`${element} ${sourceNode} 0 ${vs.voltage}`)
      lines.push(`R_src_${vsIndex} ${sourceNode} ${nodeName} ${vs.sourceResistanceOhms}`)
    } else {
      lines.push(`${element} ${nodeName} 0 ${vs.voltage}`)
    }
    // The source's branch current is the pin's current; record it so the solver
    // can check the pin against the ATmega's current limits.
    if (vs.pin != null) pinSources.push({ pin: vs.pin, element, node: nodeName })
    if (vs.pwmDuty != null) {
      pwmSources.push({
        element,
        duty: vs.pwmDuty,
        highVolts: vs.pwmHighVolts ?? 5,
        frequencyHz: pwmFrequencyForPin(vs.pin ?? -1),
      })
    }
    if (vs.rail) {
      railSources.push({ element, rail: vs.rail, node: nodeName })
      powerSources.push({
        id: `arduino:${vs.rail}:${nodeName}`,
        label: `Arduino ${vs.rail}`,
        element,
        node: nodeName,
        rail: vs.rail,
        nominalVoltage: vs.voltage,
        currentLimitMa: vs.rail === "5V" ? 500 : 50,
        sourceResistanceOhms: vs.sourceResistanceOhms,
      })
    }
    vsIndex++
  }

  // Build component elements
  for (const comp of Object.values(components)) {
    if (isBoardComponentType(comp.type) || comp.type === "wire") continue

    const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
    const boardId = componentSurfaceBoardId(comp, components)
    const def = getComponentDef(comp.type)

    // Resolve the declared power pins to nodes now, but defer the binding
    // itself: parts emit their own supplySources further down this same loop,
    // so the supply table isn't complete until it finishes.
    const powerModel = powerModelFor(comp.type)
    if (powerModel) {
      const pinMap = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties)
      const supplyPoint = powerModel.supply.map((name) => pinMap[name]).find(Boolean)
      const returnPoint = powerModel.return?.map((name) => pinMap[name]).find(Boolean)
      if (supplyPoint) {
        pendingPowerNodes.set(comp.id, {
          supply: resolveNode(nodeMap, { ...supplyPoint, boardId }),
          // A declared return pin that resolves to nothing stays null — an
          // unwired ground must not read the same as a wired one.
          return: returnPoint ? resolveNode(nodeMap, { ...returnPoint, boardId }) : null,
          declaresReturn: powerModel.return !== undefined,
        })
      }
    }

    if (def?.buildNetlist) {
      const ctx = {
        footprint,
        resolveNode: (pt: GridPoint) => resolveNode(nodeMap, { ...pt, boardId }),
        pinStates,
        wires,
        components,
        mode,
        peripheralStates,
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
        if (result.supplySources) powerSources.push(...result.supplySources)
        componentNodePairs.set(comp.id, { nodeA, nodeB })
      }
    }
  }

  // Bind each declared part to the supplies feeding it. resolveNets has
  // already merged everything on a net into one SPICE node, so this is a
  // direct name match rather than a graph walk.
  const supplyIdsByNode = new Map<string, string[]>()
  const supplyReturnNodes = new Set<string>()
  for (const source of powerSources) {
    const ids = supplyIdsByNode.get(source.node) ?? []
    ids.push(source.id)
    supplyIdsByNode.set(source.node, ids)
    if (source.returnNode) supplyReturnNodes.add(source.returnNode)
  }
  for (const [componentId, nodes] of pendingPowerNodes) {
    // "0" covers a fixed-ground net; a supply's own return node covers parts
    // grounded through an MB102 − rail, which is a real net tied to 0 through
    // a 1Ω resistor and so never equals "0".
    const grounded =
      nodes.return !== null && (nodes.return === "0" || supplyReturnNodes.has(nodes.return))
    componentPowerBindings.set(componentId, {
      supply: nodes.supply,
      returnGrounded: nodes.declaresReturn ? grounded : null,
      supplyIds: supplyIdsByNode.get(nodes.supply) ?? [],
    })
  }

  // Transient analysis — short run for DC operating point
  if (modelLines.size > 0) {
    for (const modelLine of Array.from(modelLines).sort()) {
      lines.push(modelLine)
    }
  }
  lines.push(".tran 0.001 0.01")

  const netlist = lines.join("\n")

  return { netlist, nets, nodeMap, componentNodePairs, componentPowerBindings, pinSources, pwmSources, railSources, powerSources, railShorts }
}

/** Sanitize a component ID for use in SPICE element names */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)
}
