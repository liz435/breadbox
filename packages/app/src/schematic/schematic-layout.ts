// ── Schematic Layout ───────────────────────────────────────────────────
//
// Converts board state (components + wires) into a schematic layout
// with positioned nodes and edges for SVG rendering.

import {
  DEFAULT_BOARD_TARGET,
  formatArduinoPin,
  isBoardComponentType,
  isPwmCapablePin,
  resolveComponentPins,
  type BoardComponent,
  type BoardTarget,
  type Wire,
} from "@dreamer/schemas"
import { resolveNets, getComponentFootprint } from "@/breadboard/breadboard-grid"
import type { SchematicSymbolType } from "./schematic-symbols"
import { getComponentDef } from "@/components/registry"

// ── Types ──────────────────────────────────────────────────────────────

export type SchematicNode = {
  id: string
  type: SchematicSymbolType
  x: number
  y: number
  label: string
  value?: string
  componentId?: string
  arduinoPin?: number
  /** For ic_pin nodes: the logical pin name on the parent IC (e.g. "a", "data"). */
  pinName?: string
  /** For arduino_pin nodes: whether the pin can output a hardware PWM signal. */
  isPwm?: boolean
  /**
   * For ic_pin nodes: which edge of the IC body the stub belongs to. Inputs sit
   * on the left (facing the Arduino), outputs on the right (facing the loads).
   * Defaults to "left" (a single-sided IC).
   */
  icSide?: "left" | "right"
}

export type SchematicEdge = {
  id: string
  fromNodeId: string
  fromSide: SchematicTerminalSide
  toNodeId: string
  toSide: SchematicTerminalSide
  netId: string
}

export type SchematicTerminalSide =
  | "left"
  | "left-top"
  | "left-bottom"
  | "right"
  | "top"
  | "bottom"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type SchematicRailKind = "ground" | "power"

/**
 * A local power/ground symbol attached to a single component terminal.
 * Distributed rails (a flag at each pin) are drawn instead of routing every
 * power/ground pin across the sheet to one shared node — standard schematic
 * practice that keeps wiring local and uncluttered.
 */
export type SchematicRailFlag = {
  id: string
  nodeId: string
  side: SchematicTerminalSide
  kind: SchematicRailKind
  /** Power flags only: the rail voltage, e.g. "5V" / "3.3V". */
  label?: string
}

/** Rails the Arduino board itself supplies, drawn as flags on its body. */
export type SchematicBoardRails = {
  ground: boolean
  powerLabels: string[]
}

export type SchematicLayout = {
  nodes: SchematicNode[]
  edges: SchematicEdge[]
  rails: SchematicRailFlag[]
  boardRails: SchematicBoardRails
  width: number
  height: number
}

const EMPTY_BOARD_RAILS: SchematicBoardRails = { ground: false, powerLabels: [] }

// ── Helpers ────────────────────────────────────────────────────────────

function componentTypeToSymbol(type: string): SchematicSymbolType | null {
  return getComponentDef(type)?.schematicSymbol ?? "generic_module"
}

function getComponentValue(comp: BoardComponent): string | undefined {
  return getComponentDef(comp.type)?.schematicValue?.(comp)
}

function isGroundPin(pin: number): boolean {
  // GND pins: -3, -4, -6
  return pin === -3 || pin === -4 || pin === -6
}

function isPowerPin(pin: number): boolean {
  // 5V: -1, 3.3V: -2
  return pin === -1 || pin === -2
}

function getPowerLabel(pin: number): string {
  if (pin === -1) return "5V"
  if (pin === -2) return "3.3V"
  return "VCC"
}

/** Rail label for an external power supply, from its configured voltage. */
function powerSupplyVoltageLabel(comp: BoardComponent): string {
  const props = comp.properties ?? {}
  const left = typeof props.leftVoltage === "number" ? props.leftVoltage : 0
  const right = typeof props.rightVoltage === "number" ? props.rightVoltage : 0
  const v = Math.max(Math.abs(left), Math.abs(right))
  return v > 0 ? `${v}V` : "VCC"
}

function terminalSideForPin(
  compType: string,
  pinName: string,
): SchematicTerminalSide {
  switch (compType) {
    case "led":
      return pinName === "cathode" ? "right" : "left"
    case "capacitor":
      return pinName === "negative" ? "right" : "left"
    case "button":
    case "resistor":
    case "photoresistor":
    case "buzzer":
    case "dc_motor":
      return pinName === "b" || pinName === "negative" || pinName === "signal"
        ? "right"
        : "left"
    case "potentiometer":
      if (pinName === "signal") return "top"
      return pinName === "gnd" ? "right" : "left"
    case "servo":
      // Signal + power enter from the left (pin / power columns); ground exits
      // to the right toward the shared ground column. This keeps all three
      // traces as clean horizontal runs instead of crossing under the body.
      if (pinName === "signal") return "left-top"
      if (pinName === "vcc") return "left-bottom"
      return "right"
    case "temperature_sensor":
      // Same connector-block flow as the servo: output + power on the left,
      // ground on the right, so labels and rail flags don't collide.
      if (pinName === "signal" || pinName === "data") return "left-top"
      if (pinName === "vcc") return "left-bottom"
      return "right"
    case "dht_sensor":
      if (pinName === "vcc") return "bottom-left"
      if (pinName === "signal" || pinName === "data") return "bottom-center"
      return "bottom-right"
    case "ultrasonic_sensor":
      return pinName === "trigger" || pinName === "echo" ? "left" : "right"
    case "neopixel":
      return pinName === "din" ? "left" : "right"
    case "pir_sensor":
    case "ir_receiver":
      return pinName === "signal" || pinName === "out" ? "left" : "right"
    case "relay":
      return pinName === "signal" ? "left" : "right"
    case "oled_display":
      return pinName === "sda" || pinName === "scl" ? "left" : "right"
    case "lcd_16x2":
    case "seven_segment":
    case "shift_register":
      return pinName === "gnd" || pinName === "vss" || pinName === "vdd" ? "right" : "left"
    default:
      return "left"
  }
}

function fallbackTerminalSide(pinIdx: number): SchematicTerminalSide {
  return pinIdx === 0 ? "left" : "right"
}

function detectBoardTarget(components: BoardComponent[]): BoardTarget {
  for (const component of components) {
    if (component.type === "arduino_uno" || component.type === "arduino_nano" || component.type === "arduino_mega_2560") {
      return component.type
    }
  }
  return DEFAULT_BOARD_TARGET
}

// ── Layout Generation ──────────────────────────────────────────────────

const HORIZONTAL_SPACING = 150
const VERTICAL_SPACING = 100
const PADDING = 80

/**
 * Component types that should be rendered as IC entities — one ic_pin stub
 * per connected named signal pin — instead of a single 2-terminal symbol.
 * GND/VCC pins of these ICs are still routed through the shared GND/power
 * column nodes; only signal pins become ic_pin stubs.
 */
const MULTI_PIN_IC_TYPES = new Set(["seven_segment", "lcd_16x2", "shift_register"])

/**
 * Named pins on multi-pin ICs that should NOT become ic_pin stubs because
 * they are already represented by the shared ground/power nodes.
 */
const MULTI_PIN_IC_SKIP_PINS = new Set([
  "gnd",
  "gnd_a",
  "gnd_b",
  "vss",
  "vdd",
  "vcc",
])

export function generateSchematicLayout(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): SchematicLayout {
  const nodes: SchematicNode[] = []
  const edges: SchematicEdge[] = []
  const allComponents = Object.values(components)
  const boardTarget = detectBoardTarget(allComponents)

  // 1. Filter circuit components (not arduino_uno or wire), then split into
  //    regular (single 2-terminal symbol) vs multi-pin IC components which
  //    expand into one ic_pin stub per connected signal pin. Power supplies
  //    are sources, not drawn boxes — they become power/ground rail flags on
  //    the loads they feed (see net classification below).
  const circuitComponents = allComponents.filter(
    (c) => !isBoardComponentType(c.type) && c.type !== "wire",
  )

  if (circuitComponents.length === 0) {
    return { nodes: [], edges: [], rails: [], boardRails: EMPTY_BOARD_RAILS, width: 0, height: 0 }
  }

  const powerSupplies = circuitComponents.filter((c) => c.type === "power_supply")
  const regularComponents = circuitComponents.filter(
    (c) => !MULTI_PIN_IC_TYPES.has(c.type) && c.type !== "power_supply",
  )
  const multiPinComponents = circuitComponents.filter(
    (c) => MULTI_PIN_IC_TYPES.has(c.type),
  )

  // 2. Resolve nets to understand connectivity
  const nets = resolveNets(components, wires)

  // 3. Determine which Arduino pins are connected
  const connectedArduinoPins = new Set<number>()
  for (const net of nets) {
    for (const pin of net.arduinoPins) {
      connectedArduinoPins.add(pin)
    }
  }

  // 4. Create nodes. Layout columns: arduino pins | components | ic pins.
  //    Power and ground are NOT shared column nodes — each connection is drawn
  //    as a local flag on the component (distributed rails), so wires don't
  //    converge across the sheet.
  let col = 0

  // Column 0: Arduino digital/analog signal pins
  const signalPins = [...connectedArduinoPins]
    .filter((p) => !isPowerPin(p) && !isGroundPin(p))
    .sort((a, b) => a - b)
  let signalRow = 0
  for (const pin of signalPins) {
    const pwm = isPwmCapablePin(pin, boardTarget)
    nodes.push({
      id: `pin-${pin}`,
      type: "arduino_pin",
      x: PADDING + col * HORIZONTAL_SPACING,
      y: PADDING + signalRow * VERTICAL_SPACING,
      // Prefix PWM-capable pins with the board's silkscreen "~" marker.
      label: `${pwm ? "~" : ""}${formatArduinoPin(pin, boardTarget)}`,
      arduinoPin: pin,
      isPwm: pwm,
    })
    signalRow++
  }
  if (signalPins.length > 0) col++

  // ── Component + multi-pin IC placement ────────────────────────────────
  const footprintPointsOf = (c: BoardComponent) =>
    getComponentFootprint(c.type, c.y, c.x, c.rotation, c.properties).points
  const onNet = (
    points: ReadonlyArray<{ row: number; col: number }>,
    net: ReturnType<typeof resolveNets>[number],
  ) => points.some((p) => net.points.some((np) => np.row === p.row && np.col === p.col))
  const isRailNet = (net: ReturnType<typeof resolveNets>[number]) =>
    net.arduinoPins.some((p) => isPowerPin(p) || isGroundPin(p))
  const netsOfComp = (c: BoardComponent) => {
    const pts = footprintPointsOf(c)
    return nets.filter((n) => onNet(pts, n))
  }

  // Classify each connected IC signal pin: an "output" drives a regular-
  // component load; everything else (Arduino-driven, rail-tied) is an "input".
  type IcPinInfo = {
    ic: BoardComponent
    pinName: string
    net: ReturnType<typeof resolveNets>[number]
    kind: "input" | "output"
  }
  const icPinInfos: IcPinInfo[] = []
  for (const ic of multiPinComponents) {
    const pinMap = resolveComponentPins(ic.type, ic.y, ic.x, ic.properties)
    for (const [pinName, pinPoint] of Object.entries(pinMap)) {
      if (MULTI_PIN_IC_SKIP_PINS.has(pinName)) continue
      const net = nets.find((n) =>
        n.points.some((np) => np.row === pinPoint.row && np.col === pinPoint.col),
      )
      if (net == null) continue
      const drivenByArduino = net.arduinoPins.some((p) => p >= 0)
      // The pin's immediate loads on this net.
      const loadComps =
        !drivenByArduino && !isRailNet(net)
          ? regularComponents.filter((rc) => onNet(footprintPointsOf(rc), net))
          : []
      // Output = the load leads onward (to another load / ground), not back to
      // an Arduino pin driving *through* it (that's an input, e.g. a 7-seg fed
      // Arduino → resistor → segment).
      const drivesLoad =
        loadComps.length > 0 &&
        !loadComps.some((load) =>
          netsOfComp(load)
            .filter((n) => n.id !== net.id)
            .some((n) => n.arduinoPins.some((p) => p >= 0)),
        )
      icPinInfos.push({ ic, pinName, net, kind: drivesLoad ? "output" : "input" })
    }
  }
  const outputPins = icPinInfos.filter((p) => p.kind === "output").sort((a, b) => a.pinName.localeCompare(b.pinName))
  // Order inputs by their Arduino driver pin so each control line is a straight
  // horizontal trace (no crossing); rail-tied / unconnected inputs come after.
  const arduinoDriverPin = (info: IcPinInfo): number => {
    const signalPins = info.net.arduinoPins.filter((p) => p >= 0)
    return signalPins.length > 0 ? Math.min(...signalPins) : Number.POSITIVE_INFINITY
  }
  const inputPins = icPinInfos
    .filter((p) => p.kind === "input")
    .sort((a, b) => arduinoDriverPin(a) - arduinoDriverPin(b) || a.pinName.localeCompare(b.pinName))
  const twoSidedIc = outputPins.length > 0

  const placedCompIds = new Set<string>()
  const pushCompNodeAt = (comp: BoardComponent, x: number, y: number) => {
    const symbolType = componentTypeToSymbol(comp.type)
    if (symbolType == null) return
    nodes.push({
      id: `comp-${comp.id}`,
      type: symbolType,
      x,
      y,
      label: comp.name,
      value: getComponentValue(comp),
      componentId: comp.id,
    })
    placedCompIds.add(comp.id)
  }
  const pushIcPinAt = (info: IcPinInfo, x: number, y: number, side: "left" | "right") => {
    nodes.push({
      id: `ic-pin-${info.ic.id}-${info.pinName}`,
      type: "ic_pin",
      x,
      y,
      label: info.pinName,
      value: info.ic.name,
      componentId: info.ic.id,
      pinName: info.pinName,
      icSide: side,
    })
  }

  if (twoSidedIc) {
    // Chip in the middle: inputs on the left (facing the Arduino), outputs on
    // the right driving R → LED → ground chains that flow rightward. The body
    // height is max(#inputs, #outputs) rows — not the sum — and the load chains
    // sit past the outputs, so nothing crosses.
    const icLeftPinX = PADDING + col * HORIZONTAL_SPACING
    const icRightPinX = icLeftPinX + HORIZONTAL_SPACING
    const primaryLoadX = icRightPinX + HORIZONTAL_SPACING
    const secondaryLoadX = primaryLoadX + HORIZONTAL_SPACING

    // One row per output channel: output stub → resistor → LED.
    let row = 0
    for (const out of outputPins) {
      const y = PADDING + row * VERTICAL_SPACING
      pushIcPinAt(out, icRightPinX, y, "right")

      const primary = regularComponents.find(
        (rc) => !placedCompIds.has(rc.id) && onNet(footprintPointsOf(rc), out.net),
      )
      if (primary != null) {
        pushCompNodeAt(primary, primaryLoadX, y)
        const primaryPts = footprintPointsOf(primary)
        const secondary = regularComponents.find(
          (rc) =>
            !placedCompIds.has(rc.id) &&
            !onNet(footprintPointsOf(rc), out.net) &&
            netsOfComp(rc).some((n) => !isRailNet(n) && onNet(primaryPts, n)),
        )
        if (secondary != null) pushCompNodeAt(secondary, secondaryLoadX, y)
      }
      row++
    }

    // Input pins stack on the left edge of the body.
    let inputRow = 0
    for (const inp of inputPins) {
      pushIcPinAt(inp, icLeftPinX, PADDING + inputRow * VERTICAL_SPACING, "left")
      inputRow++
    }

    // Any regular component not part of an output chain: stack it past the loads.
    let orphanRow = Math.max(row, inputRow)
    for (const rc of regularComponents) {
      if (placedCompIds.has(rc.id)) continue
      pushCompNodeAt(rc, primaryLoadX, PADDING + orphanRow * VERTICAL_SPACING)
      orphanRow++
    }
  } else {
    // Single-sided layout: regular components stacked, then the IC's pins to
    // their right (Arduino → loads → IC pins → body). Output pins align to
    // their load's row; control pins fill the free rows in between.
    let compRow = 0
    const componentCol = col
    for (const comp of regularComponents) {
      pushCompNodeAt(comp, PADDING + componentCol * HORIZONTAL_SPACING, PADDING + compRow * VERTICAL_SPACING)
      compRow++
    }
    if (regularComponents.length > 0) col = componentCol + 1

    const icPinCol = componentCol + (regularComponents.length > 0 ? 1 : 0)
    const icPinX = PADDING + icPinCol * HORIZONTAL_SPACING
    const usedIcYs = new Set<number>()
    const unaligned: IcPinInfo[] = []

    for (const info of icPinInfos) {
      let alignedY: number | null = null
      for (const regComp of regularComponents) {
        if (onNet(footprintPointsOf(regComp), info.net)) {
          const regNode = nodes.find((n) => n.id === `comp-${regComp.id}`)
          if (regNode != null) {
            alignedY = regNode.y
            break
          }
        }
      }
      if (alignedY != null) {
        pushIcPinAt(info, icPinX, alignedY, "left")
        usedIcYs.add(alignedY)
      } else {
        unaligned.push(info)
      }
    }

    let icSlot = 0
    for (const info of unaligned) {
      let y = PADDING + icSlot * VERTICAL_SPACING
      while (usedIcYs.has(y)) {
        icSlot++
        y = PADDING + icSlot * VERTICAL_SPACING
      }
      pushIcPinAt(info, icPinX, y, "left")
      icSlot++
    }
  }

  // Board rails: whether the Arduino itself supplies ground / power in this
  // circuit. Drawn as flags on the board body rather than as separate columns.
  const groundPins = [...connectedArduinoPins].filter(isGroundPin)
  const powerPins = [...connectedArduinoPins].filter(isPowerPin).sort((a, b) => a - b)
  const boardRails: SchematicBoardRails = {
    ground: groundPins.length > 0,
    powerLabels: powerPins.map(getPowerLabel),
  }

  // 5. Build signal edges and distributed power/ground rail flags.
  //    A net that touches an Arduino GND pin is a ground net; one that touches
  //    a 5V/3.3V pin — or an external power supply's output — is a power net.
  //    Those get a local flag at every component terminal instead of wires to a
  //    shared node. Everything else is a signal net, drawn as wires between the
  //    driving pin and the components.
  const rails: SchematicRailFlag[] = []
  let edgeId = 0
  let railId = 0

  // Grid points occupied by each external supply, so nets that reach one can be
  // recognised as power rails (the supply itself is not drawn).
  const supplyFootprints = powerSupplies.map((ps) => ({
    comp: ps,
    points: getComponentFootprint(ps.type, ps.y, ps.x, ps.rotation, ps.properties).points,
  }))

  type PinMapping = { nodeId: string; side: SchematicTerminalSide }

  for (const net of nets) {
    const netGroundPins = net.arduinoPins.filter(isGroundPin)
    const netPowerPins = net.arduinoPins.filter(isPowerPin).sort((a, b) => a - b)
    const supplyOnNet = supplyFootprints.find((sf) =>
      sf.points.some((fp) => net.points.some((np) => np.row === fp.row && np.col === fp.col)),
    )
    const isGroundNet = netGroundPins.length > 0
    const isPowerNet = !isGroundNet && (netPowerPins.length > 0 || supplyOnNet != null)
    const powerLabel =
      netPowerPins.length > 0
        ? getPowerLabel(netPowerPins[0])
        : supplyOnNet != null
          ? powerSupplyVoltageLabel(supplyOnNet.comp)
          : "VCC"

    // Component / IC terminals participating in this net. Named pins carry
    // electrical meaning (anode/cathode, signal/vcc/gnd) so terminals stay put
    // even when a component has more than two footprint points; fall back to
    // footprint order only when no named pin matches.
    const terminals: PinMapping[] = []
    for (const comp of regularComponents) {
      const compNodeId = `comp-${comp.id}`
      if (!nodes.find((n) => n.id === compNodeId)) continue

      let matchedNamedPin = false
      const pinMap = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties)
      for (const [pinName, pinPoint] of Object.entries(pinMap)) {
        const inNet = net.points.some((np) => np.row === pinPoint.row && np.col === pinPoint.col)
        if (inNet) {
          terminals.push({ nodeId: compNodeId, side: terminalSideForPin(comp.type, pinName) })
          matchedNamedPin = true
          break
        }
      }
      if (matchedNamedPin) continue

      const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
      for (let pinIdx = 0; pinIdx < footprint.points.length; pinIdx++) {
        const fp = footprint.points[pinIdx]
        const inNet = net.points.some((np) => np.row === fp.row && np.col === fp.col)
        if (inNet) {
          terminals.push({ nodeId: compNodeId, side: fallbackTerminalSide(pinIdx) })
          break // One connection per component per net
        }
      }
    }

    // Multi-pin ICs: each connected signal pin terminates at its own ic_pin
    // stub rather than collapsing onto a shared terminal.
    for (const ic of multiPinComponents) {
      const icPinMap = resolveComponentPins(ic.type, ic.y, ic.x, ic.properties)
      for (const [pinName, pinPoint] of Object.entries(icPinMap)) {
        const inNet = net.points.some((np) => np.row === pinPoint.row && np.col === pinPoint.col)
        if (!inNet) continue
        const icPinNodeId = `ic-pin-${ic.id}-${pinName}`
        if (nodes.find((n) => n.id === icPinNodeId)) {
          terminals.push({ nodeId: icPinNodeId, side: "left" as const })
          break
        }
      }
    }

    if (isGroundNet || isPowerNet) {
      // Distributed rail: drop a local flag at each terminal, no cross wires.
      for (const t of terminals) {
        rails.push({
          id: `rail-${railId++}`,
          nodeId: t.nodeId,
          side: t.side,
          kind: isGroundNet ? "ground" : "power",
          label: isPowerNet ? powerLabel : undefined,
        })
      }
      continue
    }

    // Signal net: chain the driving Arduino pin(s) and the component terminals.
    const participating: PinMapping[] = []
    for (const pin of net.arduinoPins) {
      const nodeId = `pin-${pin}`
      if (nodes.find((n) => n.id === nodeId)) {
        participating.push({ nodeId, side: "right" as const })
      }
    }
    participating.push(...terminals)

    for (let i = 0; i < participating.length - 1; i++) {
      const from = participating[i]
      const to = participating[i + 1]
      if (from.nodeId === to.nodeId) continue

      edges.push({
        id: `edge-${edgeId++}`,
        fromNodeId: from.nodeId,
        fromSide: from.side,
        toNodeId: to.nodeId,
        toSide: to.side,
        netId: net.id,
      })
    }
  }

  // 6. Compute total dimensions
  const maxX = nodes.reduce((max, n) => Math.max(max, n.x), 0) + HORIZONTAL_SPACING
  const maxY = nodes.reduce((max, n) => Math.max(max, n.y), 0) + VERTICAL_SPACING
  const width = maxX + PADDING
  const height = maxY + PADDING

  return { nodes, edges, rails, boardRails, width, height }
}
