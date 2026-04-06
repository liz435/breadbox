// ── Schematic Layout ───────────────────────────────────────────────────
//
// Converts board state (components + wires) into a schematic layout
// with positioned nodes and edges for SVG rendering.

import type { BoardComponent, Wire } from "@dreamer/schemas"
import { resolveNets } from "@/breadboard/breadboard-grid"
import { getComponentFootprint } from "@/breadboard/breadboard-grid"
import type { SchematicSymbolType } from "./schematic-symbols"

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
  fromSide: "left" | "right" | "top" | "bottom"
  toNodeId: string
  toSide: "left" | "right" | "top" | "bottom"
  netId: string
}

export type SchematicLayout = {
  nodes: SchematicNode[]
  edges: SchematicEdge[]
  width: number
  height: number
}

// ── Helpers ────────────────────────────────────────────────────────────

function componentTypeToSymbol(type: string): SchematicSymbolType | null {
  switch (type) {
    case "resistor":
      return "resistor"
    case "led":
    case "rgb_led":
      return "led"
    case "button":
      return "button"
    case "capacitor":
      return "capacitor"
    case "buzzer":
      return "buzzer"
    case "servo":
      return "servo"
    case "potentiometer":
      return "potentiometer"
    default:
      return null
  }
}

function getComponentValue(comp: BoardComponent): string | undefined {
  const props = comp.properties
  switch (comp.type) {
    case "resistor": {
      const ohms = props.resistance as number | undefined
      if (ohms != null) {
        if (ohms >= 1000000) return `${(ohms / 1000000).toFixed(1)}M\u03A9`
        if (ohms >= 1000) return `${(ohms / 1000).toFixed(1)}k\u03A9`
        return `${ohms}\u03A9`
      }
      return undefined
    }
    case "led":
    case "rgb_led": {
      const color = props.color as string | undefined
      return color ? `${color} LED` : "LED"
    }
    case "capacitor": {
      const cap = props.capacitance as string | undefined
      return cap ?? undefined
    }
    case "buzzer":
      return "Buzzer"
    case "servo":
      return "Servo"
    case "potentiometer": {
      const val = props.resistance as number | undefined
      return val != null ? `${val}\u03A9 pot` : "Pot"
    }
    default:
      return undefined
  }
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

function getDigitalPinLabel(pin: number): string {
  if (pin >= 14) return `A${pin - 14}`
  return `D${pin}`
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

  // 1. Filter circuit components (not arduino_uno or wire)
  const circuitComponents = Object.values(components).filter(
    (c) => c.type !== "arduino_uno" && c.type !== "wire",
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
      label: getDigitalPinLabel(pin),
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
  type PinMapping = { nodeId: string; side: "left" | "right" }

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

    // Check component nodes: a component is in a net if any of its footprint
    // grid points falls within the net's points
    for (const comp of circuitComponents) {
      const footprint = getComponentFootprint(comp.type, comp.y, comp.x)
      const compNodeId = `comp-${comp.id}`
      if (!nodes.find((n) => n.id === compNodeId)) continue

      for (let pinIdx = 0; pinIdx < footprint.points.length; pinIdx++) {
        const fp = footprint.points[pinIdx]
        const inNet = net.points.some((np) => np.row === fp.row && np.col === fp.col)
        if (inNet) {
          // First pin = left side (input), last pin = right side (output)
          const side = pinIdx === 0 ? "left" as const : "right" as const
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
