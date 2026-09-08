// ── Netlist Builder ─────────────────────────────────────────────────────
//
// Converts board state (components, wires, pin states) into a SPICE
// netlist string that can be fed to `spicey.simulate()`.

import {
  MAX_ARDUINO_PIN,
  isBoardComponentType,
  resolveComponentPins,
  type BoardComponent,
  type BoardTarget,
  type Wire,
  type PinState,
} from "@dreamer/schemas"
import {
  getComponentFootprint,
  componentSurfaceBoardId,
  terminalAddressKey,
  type Net,
  type GridPoint,
  type TerminalAddress,
} from "@/breadboard/breadboard-grid"
import { getComponentDef } from "@/components/registry"
import { sanitize } from "@/components/catalog/_shared"
import { compileElectricalTopology, electricalTerminalKey } from "./electrical-topology"
import { powerModelFor } from "./power-model"
import type { PeripheralState } from "./peripherals/types"
import { describeModelCoverage } from "./model-coverage"

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
  const boardId = "boardId" in point ? sanitize(point.boardId) : "legacy"
  return nodeMap.get(pointKey(point)) ?? `unconnected_${boardId}_${point.row}_${point.col}`
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

export type NetlistModelCoverage = {
  mode: NetlistMode
  supportedComponentIds: string[]
  unsupportedComponentIds: string[]
  approximateComponentIds: string[]
  approximateReasons: Array<{ componentId: string; reason: string }>
  unsupportedReasons: Array<{ componentId: string; reason: string }>
}

export type NetlistNumericalAids = {
  /** Explicit solver-only bleeds; never interpreted as user wiring. */
  bleedResistors: string[]
  /** Series resistors added to voltage sources for finite output impedance. */
  sourceResistanceElements: string[]
  /** Primitive lines intentionally omitted because both terminals self-looped. */
  omittedSelfLoopComponents: string[]
}

export type NetlistResult = {
  netlist: string
  nets: Net[]
  nodeMap: Map<string, string>
  /** Canonical component terminal → SPICE node mapping for diagnostics/tests. */
  terminalNodeMap: Map<string, string>
  componentNodePairs: Map<string, { nodeA: string; nodeB: string }>
  /** Resolved supply requirement per component that declares a power model. */
  componentPowerBindings: Map<
    string,
    {
      /** SPICE node the part draws supply from; read ground-referenced. */
      supply: string
      /** True only when the declared return is wired to global SPICE ground.
       * A supply's private return does not implicitly count. Null when the
       * part declares no return pin, so consumers know not to require one. */
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
  /** Distinct voltage drivers that share one resolved SPICE node. */
  driveConflicts: Array<{
    node: string
    netId: string
    sources: Array<{ label: string; pin?: number; rail?: "5V" | "3V3"; sourceKey?: string }>
  }>
  /** Honest coverage and numerical assumptions for UI/export diagnostics. */
  modelCoverage: NetlistModelCoverage
  numericalAids: NetlistNumericalAids
  analysisSettings: { mode: NetlistMode; nominalTransientDtSeconds: number; nominalTransientStopSeconds: number }
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

/** Logic-high level comes from the selected MCU profile, not a global Uno
 * constant. Rails remain separate sources; this value only describes GPIO
 * output drive and PWM high state. */
function logicHighVoltageFor(boardTarget?: BoardTarget): number {
  return boardTarget === "rpi_pico" ? 3.3 : 5
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
  boardTarget?: BoardTarget,
): NetlistResult {
  const topology = compileElectricalTopology(components, wires)
  const nets = topology.nets
  const lines: string[] = []
  const logicHighVolts = logicHighVoltageFor(boardTarget)
  const circuitComponents = Object.values(components).filter(
    (component) => !isBoardComponentType(component.type) && component.type !== "wire",
  )
  const supportedComponentIds: string[] = []
  const unsupportedComponentIds: string[] = []
  const approximateComponentIds: string[] = []
  const approximateReasons: Array<{ componentId: string; reason: string }> = []
  const unsupportedReasons: Array<{ componentId: string; reason: string }> = []
  for (const component of circuitComponents) {
    const definition = getComponentDef(component.type)
    const coverage = describeModelCoverage(component.type, Boolean(definition?.buildNetlist))
    if (coverage.classification !== "unsupported") {
      supportedComponentIds.push(component.id)
      if (coverage.classification === "approximate") {
        approximateComponentIds.push(component.id)
        if (coverage.reason) approximateReasons.push({ componentId: component.id, reason: coverage.reason })
      }
    } else {
      unsupportedComponentIds.push(component.id)
      unsupportedReasons.push({
        componentId: component.id,
        reason: coverage.reason!,
      })
    }
  }
  const numericalAids: NetlistNumericalAids = {
    bleedResistors: [],
    sourceResistanceElements: [],
    omittedSelfLoopComponents: [],
  }
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
    /** Physical source identity; aliases of one rail must not be emitted twice. */
    sourceKey: string
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
          sourceKey: "rail:5V",
        })
      } else if (arduinoPin === -2) {
        // 3.3V pin
        voltageSourceNets.push({
          label: "V_3V3",
          netId: net.id,
          voltage: 3.3,
          sourceResistanceOhms: RAIL_3V3_SOURCE_RESISTANCE_OHMS,
          rail: "3V3",
          sourceKey: "rail:3V3",
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
              voltage: duty * logicHighVolts,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
              pin: arduinoPin,
              pwmDuty: duty,
              pwmHighVolts: logicHighVolts,
              sourceKey: `pin:${arduinoPin}`,
            })
          } else if (ps.digitalValue === 1) {
            voltageSourceNets.push({
              label: `V_D${arduinoPin}`,
              netId: net.id,
              voltage: logicHighVolts,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
              pin: arduinoPin,
              sourceKey: `pin:${arduinoPin}`,
            })
          } else {
            // Pin is OUTPUT LOW → drive 0V through realistic output resistance.
            voltageSourceNets.push({
              label: `V_D${arduinoPin}_LOW`,
              netId: net.id,
              voltage: 0,
              sourceResistanceOhms: ARDUINO_OUTPUT_SOURCE_RESISTANCE_OHMS,
              pin: arduinoPin,
              sourceKey: `pin:${arduinoPin}`,
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
          sourceKey: `shift:${comp.id}:Q${i}`,
        })
      }
    }
  }

  const nodeMap = buildNodeMap(nets, groundNetIds)
  const terminalNodeMap = new Map<string, string>()
  for (const terminal of topology.terminals) {
    if (!terminal.netId) continue
    const net = nets.find((candidate) => candidate.id === terminal.netId)
    const node = net ? nodeMap.get(pointKey(net.points[0])) : undefined
    if (node) terminalNodeMap.set(electricalTerminalKey(terminal.componentId, terminal.pinName), node)
  }

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
    const element = `R_bleed_float_${net.id}`
    lines.push(`${element} ${nodeName} 0 1000000000`)
    numericalAids.bleedResistors.push(element)
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

  const pinSources: NetlistResult["pinSources"] = []
  const pwmSources: NetlistResult["pwmSources"] = []
  const railSources: NetlistResult["railSources"] = []
  const powerSources: NetlistResult["powerSources"] = []
  const driveConflicts: NetlistResult["driveConflicts"] = []
  const emittedSourceKeys = new Set<string>()
  const sourceGroups = new Map<string, {
    node: string
    netId: string
    sources: Array<{ label: string; pin?: number; rail?: "5V" | "3V3"; sourceKey?: string }>
  }>()
  let vsIndex = 0

  for (const vs of voltageSourceNets) {
    const nodeName = nodeMap.get(
      pointKey(
        nets.find((n) => n.id === vs.netId)?.points[0] ?? { row: -999, col: -999 },
      ),
    )
    if (!nodeName) continue
    // Multiple Arduino aliases can point to the same physical rail. Emit one
    // source for that physical driver, but retain distinct pin/rail/IC drivers
    // so the solver can expose contention and current sharing.
    const sourceGroupKey = `${nodeName}\u0000${vs.sourceKey}`
    if (emittedSourceKeys.has(sourceGroupKey)) continue
    emittedSourceKeys.add(sourceGroupKey)

    const group = sourceGroups.get(nodeName) ?? {
      node: nodeName,
      netId: vs.netId,
      sources: [],
    }
    group.sources.push({ label: vs.label, pin: vs.pin, rail: vs.rail, sourceKey: vs.sourceKey })
    sourceGroups.set(nodeName, group)

    const element = `${vs.label}_${vsIndex}`
    if (vs.sourceResistanceOhms && vs.sourceResistanceOhms > 0) {
      const sourceNode = `src_${vsIndex}`
      lines.push(`${element} ${sourceNode} 0 ${vs.voltage}`)
      const sourceResistanceElement = `R_src_${vsIndex}`
      lines.push(`${sourceResistanceElement} ${sourceNode} ${nodeName} ${vs.sourceResistanceOhms}`)
      numericalAids.sourceResistanceElements.push(sourceResistanceElement)
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
          const element = `R_bleed_${bleedIdx}`
          lines.push(`${element} ${nodeA} 0 1000000000`)
          numericalAids.bleedResistors.push(element)
          bleedIdx++
        }
        if (nodeB.startsWith("unconnected_")) {
          const element = `R_bleed_${bleedIdx}`
          lines.push(`${element} ${nodeB} 0 1000000000`)
          numericalAids.bleedResistors.push(element)
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
        // A one-line primitive with both terminals on one net is a true
        // self-loop and must be omitted. Multi-line parts (motors, RGB LEDs)
        // and explicitly multi-terminal primitives (transistor/MOSFET) may
        // still contain internal branches that remain meaningful even when
        // their primary measurement pair collapses to one node.
        if (nodeA !== nodeB || result.lines.length > 1 || result.preserveOnSelfLoop) {
          lines.push(...result.lines)
        } else {
          numericalAids.omittedSelfLoopComponents.push(comp.id)
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

  // External supplies are component-emitted sources rather than Arduino pin
  // sources, so add them after component netlists have been compiled. This
  // catches MB102-vs-GPIO and MB102-vs-Arduino-rail contention on one net too.
  for (const source of powerSources) {
    if (source.rail) continue
    const group = sourceGroups.get(source.node) ?? {
      node: source.node,
      netId: source.id,
      sources: [],
    }
    if (!group.sources.some((existing) => existing.sourceKey === `supply:${source.id}`)) {
      group.sources.push({
        label: source.label,
        sourceKey: `supply:${source.id}`,
      })
    }
    sourceGroups.set(source.node, group)
  }
  for (const group of sourceGroups.values()) {
    const distinctDrivers = new Set(group.sources.map((source) => source.sourceKey ?? (
      source.pin != null ? `pin:${source.pin}` : source.rail != null ? `rail:${source.rail}` : source.label
    )))
    if (distinctDrivers.size > 1) driveConflicts.push(group)
  }

  // Bind each declared part to the supplies feeding it. resolveNets has
  // already merged everything on a net into one SPICE node, so this is a
  // direct name match rather than a graph walk.
  const supplyIdsByNode = new Map<string, string[]>()
  for (const source of powerSources) {
    const ids = supplyIdsByNode.get(source.node) ?? []
    ids.push(source.id)
    supplyIdsByNode.set(source.node, ids)
  }
  for (const [componentId, nodes] of pendingPowerNodes) {
    // A supply return is not implicitly global ground. It becomes grounded
    // only when the user wires that return net to an Arduino GND net; the
    // supply's own SPICE reference resistor is intentionally not enough.
    const grounded = nodes.return !== null && nodes.return === "0"
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

  return {
    netlist,
    nets,
    nodeMap,
    terminalNodeMap,
    componentNodePairs,
    componentPowerBindings,
    pinSources,
    pwmSources,
    railSources,
    powerSources,
    railShorts,
    driveConflicts,
    modelCoverage: {
      mode,
      supportedComponentIds,
      unsupportedComponentIds,
      approximateComponentIds,
      approximateReasons,
      unsupportedReasons,
    },
    numericalAids,
    analysisSettings: {
      mode,
      nominalTransientDtSeconds: 0.001,
      nominalTransientStopSeconds: 0.01,
    },
  }
}
