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
import {
  resolveNets,
  getComponentFootprint,
  componentSurfaceBoardId,
  isPositiveRailCol,
  type TerminalAddress,
} from "@/breadboard/breadboard-grid"
import { compileElectricalTopology } from "@/simulator/electrical-topology"
import type { SchematicSymbolType } from "./schematic-symbols"
import { validateSchematicRouting } from "./schematic-routing"
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
  /** Explicit ports for a multi-terminal generic module. */
  terminals?: Array<{ side: SchematicTerminalSide; label?: string }>
  /** Stable electrical ports emitted by the layout compiler. */
  ports?: SchematicPort[]
}

/**
 * A rendered port is the bridge between a logical terminal and the symbol
 * geometry.  `nodeId`/`side` are presentation details; `terminalId` and
 * `netId` are the electrical identity used by validators and exporters.
 */
export type SchematicPort = {
  id: string
  terminalId: string
  netId: string
  nodeId: string
  side: SchematicTerminalSide
}

export type SchematicEdge = {
  id: string
  fromNodeId: string
  fromSide: SchematicTerminalSide
  toNodeId: string
  toSide: SchematicTerminalSide
  netId: string
  fromPortId?: string
  toPortId?: string
}

export type SchematicTerminalSide =
  | "left"
  | "left-top"
  | "left-bottom"
  | "right"
  | "right-top"
  | "right-bottom"
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
  /** The resolved electrical net represented by this local rail symbol. */
  netId?: string
  nodeId: string
  side: SchematicTerminalSide
  kind: SchematicRailKind
  /** Power flags only: the rail voltage, e.g. "5V" / "3.3V". */
  label?: string
  portId?: string
  terminalId?: string
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

export type SchematicValidationIssue = {
  code:
    | "missing_edge_node"
    | "missing_edge_port"
    | "edge_net_mismatch"
    | "duplicate_port"
    | "missing_rail_node"
    | "missing_route_endpoint"
    | "wire_through_symbol"
    | "net_crossing_without_junction"
  severity: "error" | "warning"
  message: string
  edgeId?: string
  nodeId?: string
  portId?: string
}

export type SchematicValidationResult = {
  valid: boolean
  issues: SchematicValidationIssue[]
}

const EMPTY_BOARD_RAILS: SchematicBoardRails = { ground: false, powerLabels: [] }

// ── Helpers ────────────────────────────────────────────────────────────

function componentTypeToSymbol(type: string): SchematicSymbolType | null {
  // These parts have more terminals than their illustrative symbols expose.
  // Render them as labelled terminal blocks until they get dedicated symbols;
  // a plain two-terminal picture would silently change the shown topology.
  if (MULTI_TERMINAL_GENERIC_TYPES.has(type)) {
    return "generic_module"
  }
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
  // 5V: -1 (and the corner socket -12), 3.3V: -2
  return pin === -1 || pin === -12 || pin === -2
}

function getPowerLabel(pin: number): string {
  if (pin === -1 || pin === -12) return "5V"
  if (pin === -2) return "3.3V"
  return "VCC"
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
      if (pinName === "data" || pinName === "signal") return "left"
      return pinName === "vcc" ? "right-top" : "right-bottom"
    case "ultrasonic_sensor":
      if (pinName === "trigger") return "left-top"
      if (pinName === "echo") return "left-bottom"
      return pinName === "vcc" ? "right-top" : "right-bottom"
    case "neopixel":
      return pinName === "din" ? "left" : pinName === "vcc" ? "right-top" : "right-bottom"
    case "pir_sensor":
      return pinName === "signal" ? "left" : pinName === "vcc" ? "right-top" : "right-bottom"
    case "ir_receiver":
      return pinName === "out" ? "left" : pinName === "vcc" ? "right-top" : "right-bottom"
    case "relay":
      if (pinName === "vcc") return "left-top"
      if (pinName === "signal") return "left"
      if (pinName === "gnd") return "left-bottom"
      if (pinName === "com") return "right-top"
      if (pinName === "no") return "right"
      return "right-bottom"
    case "stepper_motor":
      if (pinName === "in1") return "left-top"
      if (pinName === "in2") return "left"
      if (pinName === "in3") return "left-bottom"
      if (pinName === "in4") return "right-top"
      return pinName === "vplus" ? "right" : "right-bottom"
    case "oled_display":
      if (pinName === "scl") return "left-top"
      if (pinName === "sda") return "left-bottom"
      return pinName === "vcc" ? "right-top" : "right-bottom"
    case "rgb_led":
      if (pinName === "red") return "left-top"
      if (pinName === "green") return "left"
      if (pinName === "blue") return "left-bottom"
      return "right"
    case "transistor":
      if (pinName === "base") return "left"
      return pinName === "collector" ? "right-top" : "right-bottom"
    case "mosfet":
      if (pinName === "gate") return "left"
      return pinName === "drain" ? "right-top" : "right-bottom"
    case "lcd_16x2":
    case "seven_segment":
    case "shift_register":
      return pinName === "gnd" || pinName === "vss" || pinName === "vdd" ? "right" : "left"
    default:
      return "left"
  }
}

function fallbackTerminalSide(pinIdx: number, pinCount: number): SchematicTerminalSide {
  if (pinCount <= 1) return "left"
  if (pinCount === 2) return pinIdx === 0 ? "left" : "right"
  if (pinCount === 3) return (["left-top", "left-bottom", "right"] as const)[pinIdx] ?? "right"
  if (pinCount === 4) return (["left-top", "left-bottom", "right-top", "right-bottom"] as const)[pinIdx] ?? "right"
  return (["left-top", "left", "left-bottom", "right-top", "right", "right-bottom"] as const)[pinIdx] ?? "right"
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
const MULTI_TERMINAL_GENERIC_TYPES = new Set([
  "rgb_led",
  "relay",
  "ultrasonic_sensor",
  "neopixel",
  "pir_sensor",
])

/**
 * Component types that should be rendered as IC entities — one ic_pin stub
 * per connected named signal pin — instead of a single 2-terminal symbol.
 * Every connected pin, including VCC/GND, gets its own stub. This lets the
 * distributed-rail pass attach a visible power/ground marker to the IC.
 */
const MULTI_PIN_IC_TYPES = new Set(["seven_segment", "lcd_16x2", "shift_register"])

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
  const nets = compileElectricalTopology(components, wires).nets

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
  const boardIdOf = (c: BoardComponent) => componentSurfaceBoardId(c, components)
  const footprintPointsOf = (c: BoardComponent): TerminalAddress[] =>
    getComponentFootprint(c.type, c.y, c.x, c.rotation, c.properties).points
      .map((point) => ({ ...point, boardId: boardIdOf(c) }))
  const onNet = (
    points: ReadonlyArray<TerminalAddress>,
    net: ReturnType<typeof resolveNets>[number],
  ) => points.some((p) => net.points.some(
    (np) => np.boardId === p.boardId && np.row === p.row && np.col === p.col,
  ))
  const pointOnNet = (point: { row: number; col: number }, boardId: string, net: ReturnType<typeof resolveNets>[number]) =>
    net.points.some((np) => np.boardId === boardId && np.row === point.row && np.col === point.col)
  const isRailNet = (net: ReturnType<typeof resolveNets>[number]) =>
    net.arduinoPins.some((p) => isPowerPin(p) || isGroundPin(p))
  const netsOfComp = (c: BoardComponent) => {
    const pts = footprintPointsOf(c)
    return nets.filter((n) => onNet(pts, n))
  }

  /**
   * Return a complete, signal-led series chain when the regular components
   * form one. Rendering these vertically makes a basic D-pin → resistor → LED
   * → ground circuit look as though its LED terminal is reversed, so they get
   * a conventional left-to-right schematic flow instead.
   */
  const orderedSeriesChain = (): BoardComponent[] | null => {
    if (regularComponents.length < 2) return null

    const neighbours = new Map<string, Set<string>>(
      regularComponents.map((comp) => [comp.id, new Set<string>()]),
    )
    for (const net of nets) {
      const onThisNet = regularComponents.filter((comp) => onNet(footprintPointsOf(comp), net))
      for (let i = 0; i < onThisNet.length; i++) {
        for (let j = i + 1; j < onThisNet.length; j++) {
          neighbours.get(onThisNet[i]!.id)!.add(onThisNet[j]!.id)
          neighbours.get(onThisNet[j]!.id)!.add(onThisNet[i]!.id)
        }
      }
    }

    const start = regularComponents.find((comp) =>
      neighbours.get(comp.id)!.size <= 1 &&
      netsOfComp(comp).some((net) => net.arduinoPins.some((pin) => pin >= 0)),
    )
    if (start == null || [...neighbours.values()].some((set) => set.size > 2)) return null

    const ordered: BoardComponent[] = []
    let current: BoardComponent | undefined = start
    let previousId: string | undefined
    while (current != null) {
      ordered.push(current)
      const currentNeighbours = neighbours.get(current.id)
      const nextId: string | undefined = currentNeighbours == null
        ? undefined
        : [...currentNeighbours].find((id: string) => id !== previousId)
      previousId = current.id
      current = nextId == null ? undefined : regularComponents.find((comp) => comp.id === nextId)
    }

    return ordered.length === regularComponents.length ? ordered : null
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
      const net = nets.find((n) =>
        pointOnNet(pinPoint, boardIdOf(ic), n),
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
    const pinMap = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties)
    const namedPinNames = Object.keys(pinMap)
    // Custom parts carry their names in their registered definition, but the
    // schema resolver deliberately has no runtime custom-footprint lookup.
    // Use the registered names and footprint ordering to preserve each port.
    const declaredPinNames = Object.keys(getComponentDef(comp.type)?.defaultPins ?? {})
    const pinNames = namedPinNames.length > 0 ? namedPinNames : declaredPinNames
    const terminalCount = Math.max(
      pinNames.length,
      getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties).points.length,
    )
    const terminals = pinNames.map((pinName, index) => ({
      side: namedPinNames.length > 0
        ? terminalSideForPin(comp.type, pinName)
        : fallbackTerminalSide(index, terminalCount),
      label: pinName,
    }))
    nodes.push({
      id: `comp-${comp.id}`,
      type: symbolType,
      x,
      y,
      label: comp.name,
      value: getComponentValue(comp),
      componentId: comp.id,
      terminals: terminals.length > 2 ? terminals : undefined,
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
    const componentCol = col
    const seriesChain = orderedSeriesChain()
    if (seriesChain != null) {
      for (const [index, comp] of seriesChain.entries()) {
        pushCompNodeAt(comp, PADDING + (componentCol + index) * HORIZONTAL_SPACING, PADDING)
      }
    } else {
      let compRow = 0
      for (const comp of regularComponents) {
        pushCompNodeAt(comp, PADDING + componentCol * HORIZONTAL_SPACING, PADDING + compRow * VERTICAL_SPACING)
        compRow++
      }
    }
    const componentColumnCount = seriesChain?.length ?? (regularComponents.length > 0 ? 1 : 0)
    if (componentColumnCount > 0) col = componentCol + componentColumnCount

    const icPinCol = componentCol + componentColumnCount
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
  const ports: SchematicPort[] = []
  const portById = new Set<string>()
  const portIdFor = (netId: string, terminalId: string) =>
    `port-${netId}-${terminalId.replace(/[^A-Za-z0-9_.-]/g, "_")}`
  const registerPort = (
    netId: string,
    terminalId: string,
    nodeId: string,
    side: SchematicTerminalSide,
  ): string => {
    const id = portIdFor(netId, terminalId)
    if (!portById.has(id)) {
      portById.add(id)
      ports.push({ id, terminalId, netId, nodeId, side })
    }
    return id
  }
  let edgeId = 0
  let railId = 0

  // Grid points occupied by each external supply, so nets that reach one can be
  // recognised as power rails (the supply itself is not drawn).
  const supplyFootprints = powerSupplies.map((ps) => ({
    comp: ps,
    points: footprintPointsOf(ps),
  }))

  type PinMapping = { nodeId: string; side: SchematicTerminalSide; terminalId: string }

  for (const net of nets) {
    const netGroundPins = net.arduinoPins.filter(isGroundPin)
    const netPowerPins = net.arduinoPins.filter(isPowerPin).sort((a, b) => a - b)
    const supplyTerminals = supplyFootprints.flatMap((sf) => sf.points
      .filter((point) => onNet([point], net))
      .map((point) => ({
        comp: sf.comp,
        positive: isPositiveRailCol(point.col),
        voltage: point.col < 0
          ? (typeof sf.comp.properties?.leftVoltage === "number" ? sf.comp.properties.leftVoltage : 5)
          : (typeof sf.comp.properties?.rightVoltage === "number" ? sf.comp.properties.rightVoltage : 3.3),
      })))
    const supplyPower = supplyTerminals.find((terminal) => terminal.positive)
    const isGroundNet = netGroundPins.length > 0 || supplyTerminals.some((terminal) => !terminal.positive)
    const isPowerNet = !isGroundNet && (netPowerPins.length > 0 || supplyPower != null)
    const powerLabel =
      netPowerPins.length > 0
        ? getPowerLabel(netPowerPins[0])
        : supplyPower != null
          ? `${Math.abs(supplyPower.voltage)}V`
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
        const inNet = pointOnNet(pinPoint, boardIdOf(comp), net)
        if (inNet) {
          terminals.push({
            nodeId: compNodeId,
            side: terminalSideForPin(comp.type, pinName),
            terminalId: `${comp.id}:${pinName}`,
          })
          matchedNamedPin = true
        }
      }
      if (matchedNamedPin) continue

      const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
      for (let pinIdx = 0; pinIdx < footprint.points.length; pinIdx++) {
        const fp = footprint.points[pinIdx]
        const inNet = onNet([{ ...fp, boardId: boardIdOf(comp) }], net)
        if (inNet) {
          terminals.push({
            nodeId: compNodeId,
            side: fallbackTerminalSide(pinIdx, footprint.points.length),
            terminalId: `${comp.id}:pin${pinIdx}`,
          })
        }
      }
    }

    // Multi-pin ICs: each connected signal pin terminates at its own ic_pin
    // stub rather than collapsing onto a shared terminal.
    for (const ic of multiPinComponents) {
      const icPinMap = resolveComponentPins(ic.type, ic.y, ic.x, ic.properties)
      for (const [pinName, pinPoint] of Object.entries(icPinMap)) {
        const inNet = pointOnNet(pinPoint, boardIdOf(ic), net)
        if (!inNet) continue
        const icPinNodeId = `ic-pin-${ic.id}-${pinName}`
        if (nodes.find((n) => n.id === icPinNodeId)) {
          terminals.push({
            nodeId: icPinNodeId,
            side: "left" as const,
            terminalId: `${ic.id}:${pinName}`,
          })
        }
      }
    }

    if (isGroundNet || isPowerNet) {
      // Distributed rail: drop a local flag at each terminal, no cross wires.
      for (const t of terminals) {
        const portId = registerPort(net.id, t.terminalId, t.nodeId, t.side)
        rails.push({
          id: `rail-${railId++}`,
          netId: net.id,
          nodeId: t.nodeId,
          side: t.side,
          kind: isGroundNet ? "ground" : "power",
          label: isPowerNet ? powerLabel : undefined,
          portId,
          terminalId: t.terminalId,
        })
      }
      continue
    }

    // Signal net: chain the driving Arduino pin(s) and the component terminals.
    const participating: PinMapping[] = []
    for (const pin of net.arduinoPins) {
      const nodeId = `pin-${pin}`
      if (nodes.find((n) => n.id === nodeId)) {
        participating.push({
          nodeId,
          side: "right" as const,
          terminalId: `arduino:${pin}`,
        })
      }
    }
    participating.push(...terminals)
    for (const mapping of participating) {
      registerPort(net.id, mapping.terminalId, mapping.nodeId, mapping.side)
    }

    // Collapse adjacent terminals belonging to one schematic node into a
    // port group. A multi-pin part can legally have two terminals on one net;
    // connect both ports to the preceding distinct node rather than dropping
    // the second one as a self-edge.
    const groups: PinMapping[][] = []
    for (const mapping of participating) {
      const last = groups[groups.length - 1]
      if (last && last[0]?.nodeId === mapping.nodeId) last.push(mapping)
      else groups.push([mapping])
    }
    for (let i = 1; i < groups.length; i++) {
      const from = groups[i - 1]![groups[i - 1]!.length - 1]!
      for (const to of groups[i]!) {
        if (from.nodeId === to.nodeId && from.side === to.side) continue
        edges.push({
          id: `edge-${edgeId++}`,
          fromNodeId: from.nodeId,
          fromSide: from.side,
          toNodeId: to.nodeId,
          toSide: to.side,
          netId: net.id,
          fromPortId: registerPort(net.id, from.terminalId, from.nodeId, from.side),
          toPortId: registerPort(net.id, to.terminalId, to.nodeId, to.side),
        })
      }
    }
  }

  // Ports are part of the production layout, not inferred by the renderer.
  // Keep them attached to their owning node so a validator/exporter can
  // compare the rendered graph with the electrical terminal contract.
  for (const node of nodes) {
    const nodePorts = ports.filter((port) => port.nodeId === node.id)
    if (nodePorts.length > 0) node.ports = nodePorts
  }

  // 6. Compute total dimensions
  const maxX = nodes.reduce((max, n) => Math.max(max, n.x), 0) + HORIZONTAL_SPACING
  const maxY = nodes.reduce((max, n) => Math.max(max, n.y), 0) + VERTICAL_SPACING
  const width = maxX + PADDING
  const height = maxY + PADDING

  return { nodes, edges, rails, boardRails, width, height }
}

/**
 * Validate the production layout without re-running the breadboard resolver.
 * This catches presentation drift: an edge that points at a missing symbol,
 * a port whose net disagrees with the edge, or a rail flag detached from its
 * terminal. Layouts authored by older callers may omit port metadata; those
 * are accepted for compatibility because their node/side edges remain valid.
 */
export function validateSchematicLayout(layout: SchematicLayout): SchematicValidationResult {
  const issues: SchematicValidationIssue[] = []
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]))
  const portsById = new Map<string, SchematicPort>()

  for (const node of layout.nodes) {
    for (const port of node.ports ?? []) {
      if (portsById.has(port.id)) {
        issues.push({
          code: "duplicate_port",
          severity: "error",
          message: `Schematic port ${port.id} is emitted more than once`,
          nodeId: node.id,
          portId: port.id,
        })
      } else {
        portsById.set(port.id, port)
      }
    }
  }

  for (const edge of layout.edges) {
    const fromNode = nodesById.get(edge.fromNodeId)
    const toNode = nodesById.get(edge.toNodeId)
    if (!fromNode) {
      issues.push({
        code: "missing_edge_node",
        severity: "error",
        message: `Edge ${edge.id} references missing source node ${edge.fromNodeId}`,
        edgeId: edge.id,
        nodeId: edge.fromNodeId,
      })
    }
    if (!toNode) {
      issues.push({
        code: "missing_edge_node",
        severity: "error",
        message: `Edge ${edge.id} references missing target node ${edge.toNodeId}`,
        edgeId: edge.id,
        nodeId: edge.toNodeId,
      })
    }

    if (edge.fromPortId && edge.toPortId) {
      const fromPort = portsById.get(edge.fromPortId)
      const toPort = portsById.get(edge.toPortId)
      if (!fromPort) {
        issues.push({
          code: "missing_edge_port",
          severity: "error",
          message: `Edge ${edge.id} references missing source port ${edge.fromPortId}`,
          edgeId: edge.id,
          portId: edge.fromPortId,
        })
      }
      if (!toPort) {
        issues.push({
          code: "missing_edge_port",
          severity: "error",
          message: `Edge ${edge.id} references missing target port ${edge.toPortId}`,
          edgeId: edge.id,
          portId: edge.toPortId,
        })
      }
      if (fromPort && (fromPort.netId !== edge.netId || fromPort.nodeId !== edge.fromNodeId)) {
        issues.push({
          code: "edge_net_mismatch",
          severity: "error",
          message: `Edge ${edge.id} source port does not belong to its declared node/net`,
          edgeId: edge.id,
          portId: edge.fromPortId,
        })
      }
      if (toPort && (toPort.netId !== edge.netId || toPort.nodeId !== edge.toNodeId)) {
        issues.push({
          code: "edge_net_mismatch",
          severity: "error",
          message: `Edge ${edge.id} target port does not belong to its declared node/net`,
          edgeId: edge.id,
          portId: edge.toPortId,
        })
      }
    }
  }

  for (const rail of layout.rails) {
    if (!nodesById.has(rail.nodeId)) {
      issues.push({
        code: "missing_rail_node",
        severity: "error",
        message: `Rail ${rail.id} references missing node ${rail.nodeId}`,
        nodeId: rail.nodeId,
      })
    }
    if (rail.portId && !portsById.has(rail.portId)) {
      issues.push({
        code: "missing_edge_port",
        severity: "error",
        message: `Rail ${rail.id} references missing port ${rail.portId}`,
        portId: rail.portId,
      })
    }
  }

  // Validate the actual route consumed by the SVG renderer. This is separate
  // from port metadata: a layout can have correct net IDs while the visual
  // path still crosses a symbol or joins two isolated nets at a crossing.
  issues.push(...validateSchematicRouting(layout))

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  }
}
