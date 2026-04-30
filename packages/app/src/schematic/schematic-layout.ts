// ── Schematic Layout ───────────────────────────────────────────────────
//
// Converts board state (components + wires) into a schematic layout
// with positioned nodes and edges for SVG rendering.

import {
  DEFAULT_BOARD_TARGET,
  formatArduinoPin,
  isBoardComponentType,
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
  | "right"
  | "top"
  | "bottom"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type SchematicLayout = {
  nodes: SchematicNode[]
  edges: SchematicEdge[]
  width: number
  height: number
}

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
      if (pinName === "signal") return "bottom-left"
      if (pinName === "vcc") return "bottom-center"
      return "bottom-right"
    case "temperature_sensor":
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

export function generateSchematicLayout(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): SchematicLayout {
  const nodes: SchematicNode[] = []
  const edges: SchematicEdge[] = []
  const allComponents = Object.values(components)
  const boardTarget = detectBoardTarget(allComponents)

  // 1. Filter circuit components (not arduino_uno or wire)
  const circuitComponents = allComponents.filter(
    (c) => !isBoardComponentType(c.type) && c.type !== "wire",
  )

  if (circuitComponents.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 }
  }

  // 2. Resolve nets to understand connectivity
  const nets = resolveNets(components, wires)

  // 3. Determine which Arduino pins are connected
  const connectedArduinoPins = new Set<number>()
  for (const net of nets) {
    for (const pin of net.arduinoPins) {
      connectedArduinoPins.add(pin)
    }
  }

  // 4. Create nodes for power sources, Arduino pins, components, and ground
  //    Layout columns: power | arduino pins | components | ground
  let col = 0

  // Column 0: Power sources
  const powerPins = [...connectedArduinoPins].filter(isPowerPin).sort()
  let powerRow = 0
  for (const pin of powerPins) {
    nodes.push({
      id: `power-${pin}`,
      type: "voltage_source",
      x: PADDING + col * HORIZONTAL_SPACING,
      y: PADDING + powerRow * VERTICAL_SPACING,
      label: getPowerLabel(pin),
      arduinoPin: pin,
    })
    powerRow++
  }
  if (powerPins.length > 0) col++

  // Column 1: Arduino digital/analog pins
  const signalPins = [...connectedArduinoPins]
    .filter((p) => !isPowerPin(p) && !isGroundPin(p))
    .sort((a, b) => a - b)
  let signalRow = 0
  for (const pin of signalPins) {
    nodes.push({
      id: `pin-${pin}`,
      type: "arduino_pin",
      x: PADDING + col * HORIZONTAL_SPACING,
      y: PADDING + signalRow * VERTICAL_SPACING,
      label: formatArduinoPin(pin, boardTarget),
      arduinoPin: pin,
    })
    signalRow++
  }
  if (signalPins.length > 0) col++

  // Column 2+: Circuit components arranged vertically
  let compRow = 0
  const componentCol = col
  for (const comp of circuitComponents) {
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
  if (circuitComponents.length > 0) col = componentCol + 1

  // Column last: Ground nodes
  const groundPins = [...connectedArduinoPins].filter(isGroundPin)
  if (groundPins.length > 0) {
    // Single ground symbol is sufficient
    nodes.push({
      id: "ground",
      type: "ground",
      x: PADDING + col * HORIZONTAL_SPACING,
      y: PADDING + Math.floor(Math.max(compRow, signalRow, powerRow) / 2) * VERTICAL_SPACING,
      label: "GND",
      arduinoPin: groundPins[0],
    })
    col++
  }

  // 5. Create edges based on net connectivity
  //    For each net, find which nodes share it and connect them
  let edgeId = 0

  // Build a map: arduinoPin -> nodeId
  const pinToNodeId = new Map<number, string>()
  for (const node of nodes) {
    if (node.arduinoPin != null) {
      pinToNodeId.set(node.arduinoPin, node.id)
    }
  }
  // Ground pins all map to the single ground node
  for (const pin of groundPins) {
    pinToNodeId.set(pin, "ground")
  }

  // Build a map: component grid points -> component node id
  // We need to figure out which net each component pin belongs to
  type PinMapping = { nodeId: string; side: SchematicTerminalSide }

  for (const net of nets) {
    // Find all schematic nodes that participate in this net
    const participatingNodes: PinMapping[] = []

    // Check Arduino pin nodes
    for (const pin of net.arduinoPins) {
      const nodeId = pinToNodeId.get(pin)
      if (nodeId != null) {
        const node = nodes.find((n) => n.id === nodeId)
        if (node != null) {
          // Power and pin nodes connect from their right side
          // Ground connects from its left side
          const side = node.type === "ground" ? "left" as const : "right" as const
          participatingNodes.push({ nodeId, side })
        }
      }
    }

    // Check component nodes by named pins first. The footprint order is a
    // physical rendering detail; schematic terminals need electrical meaning
    // (anode/cathode, signal/vcc/gnd, etc.) so polarity and sensor headers do
    // not drift when a component has more than two footprint points.
    for (const comp of circuitComponents) {
      const compNodeId = `comp-${comp.id}`
      if (!nodes.find((n) => n.id === compNodeId)) continue

      let matchedNamedPin = false
      const pinMap = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties)
      for (const [pinName, pinPoint] of Object.entries(pinMap)) {
        const inNet = net.points.some((np) => np.row === pinPoint.row && np.col === pinPoint.col)
        if (inNet) {
          participatingNodes.push({
            nodeId: compNodeId,
            side: terminalSideForPin(comp.type, pinName),
          })
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
          const side = fallbackTerminalSide(pinIdx)
          participatingNodes.push({ nodeId: compNodeId, side })
          break // One connection per component per net
        }
      }
    }

    // Connect participating nodes pairwise (chain them)
    for (let i = 0; i < participatingNodes.length - 1; i++) {
      const from = participatingNodes[i]
      const to = participatingNodes[i + 1]
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

  return { nodes, edges, width, height }
}
