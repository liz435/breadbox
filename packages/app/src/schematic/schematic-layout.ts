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
  //    expand into one ic_pin stub per connected signal pin.
  const circuitComponents = allComponents.filter(
    (c) => !isBoardComponentType(c.type) && c.type !== "wire",
  )

  if (circuitComponents.length === 0) {
    return { nodes: [], edges: [], rails: [], boardRails: EMPTY_BOARD_RAILS, width: 0, height: 0 }
  }

  const regularComponents = circuitComponents.filter(
    (c) => !MULTI_PIN_IC_TYPES.has(c.type),
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

  // Column 2+: Regular circuit components arranged vertically. Multi-pin ICs
  //  are deferred to the next column so the visual flow reads
  //  Arduino → Resistors → IC pins → IC body.
  let compRow = 0
  const componentCol = col
  for (const comp of regularComponents) {
    const symbolType = componentTypeToSymbol(comp.type)
    if (symbolType == null) continue

    nodes.push({
      id: `comp-${comp.id}`,
      type: symbolType,
      x: PADDING + componentCol * HORIZONTAL_SPACING,
      y: PADDING + compRow * VERTICAL_SPACING,
      label: comp.name,
      value: getComponentValue(comp),
      componentId: comp.id,
    })
    compRow++
  }
  if (regularComponents.length > 0) col = componentCol + 1

  // Column N: Multi-pin IC entities — one ic_pin stub per connected named
  // signal pin. GND / VCC pins are intentionally skipped here; they are
  // already covered by the shared ground/power column nodes and would
  // otherwise create duplicate visual rails.
  const icPinCol = componentCol + (regularComponents.length > 0 ? 1 : 0)
  let icRow = 0
  for (const comp of multiPinComponents) {
    const pinMap = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties)
    for (const [pinName, pinPoint] of Object.entries(pinMap)) {
      if (MULTI_PIN_IC_SKIP_PINS.has(pinName)) continue

      // Find the net carrying this pin (skip pins that are not wired up).
      const net = nets.find((n) =>
        n.points.some((np) => np.row === pinPoint.row && np.col === pinPoint.col),
      )
      if (net == null) continue

      // If a regular component shares this net, align Y with that node so
      // the wire is a clean horizontal trace; otherwise stack down by row.
      let alignedY: number | null = null
      for (const regComp of regularComponents) {
        const regPins = resolveComponentPins(regComp.type, regComp.y, regComp.x, regComp.properties)
        const sharesNet = Object.values(regPins).some((p) =>
          net.points.some((np) => np.row === p.row && np.col === p.col),
        )
        if (sharesNet) {
          const regNode = nodes.find((n) => n.id === `comp-${regComp.id}`)
          if (regNode != null) {
            alignedY = regNode.y
            break
          }
        }
      }
      const y = alignedY ?? PADDING + icRow * VERTICAL_SPACING

      nodes.push({
        id: `ic-pin-${comp.id}-${pinName}`,
        type: "ic_pin",
        x: PADDING + icPinCol * HORIZONTAL_SPACING,
        y,
        label: pinName,
        value: comp.name,
        componentId: comp.id,
        pinName,
      })
      if (alignedY == null) icRow++
    }
  }
  if (multiPinComponents.length > 0) col = icPinCol + 1

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
  //    a 5V/3.3V pin is a power net. Those get a local flag at every component
  //    terminal instead of wires to a shared node. Everything else is a signal
  //    net and is drawn as wires between the driving pin and the components.
  const rails: SchematicRailFlag[] = []
  let edgeId = 0
  let railId = 0

  type PinMapping = { nodeId: string; side: SchematicTerminalSide }

  for (const net of nets) {
    const netGroundPins = net.arduinoPins.filter(isGroundPin)
    const netPowerPins = net.arduinoPins.filter(isPowerPin).sort((a, b) => a - b)
    const isGroundNet = netGroundPins.length > 0
    const isPowerNet = !isGroundNet && netPowerPins.length > 0
    const powerLabel = netPowerPins.length > 0 ? getPowerLabel(netPowerPins[0]) : "VCC"

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
