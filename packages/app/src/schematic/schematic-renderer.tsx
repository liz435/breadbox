// ── Schematic Renderer ─────────────────────────────────────────────────
//
// Renders a SchematicLayout as SVG: nodes as schematic symbols,
// edges as orthogonal wires, with optional circuit analysis annotations.

import type { CircuitAnalysis } from "@/simulator/circuit-solver"
import type { SchematicLayout, SchematicEdge, SchematicTerminalSide } from "./schematic-layout"
import { renderSymbol, WireJunction, GroundFlag, PowerFlag, ARDUINO_IC_LABEL_WIDTH, ARDUINO_IC_TERMINAL_OFFSET, type SymbolProps } from "./schematic-symbols"

type SchematicRendererProps = {
  layout: SchematicLayout
  analysis: CircuitAnalysis | null
  pressedButtons: ReadonlySet<string>
  selectedComponentId?: string | null
  onSelectComponent?: (id: string) => void
}

// ── Wire Routing ───────────────────────────────────────────────────────

/** Terminal offset: how far from the node center to the wire connection point */
const TERMINAL_OFFSET: Record<SchematicTerminalSide, { dx: number; dy: number }> = {
  left: { dx: 0, dy: 0 },
  "left-top": { dx: 0, dy: -14 },
  "left-bottom": { dx: 0, dy: 14 },
  right: { dx: 60, dy: 0 },
  top: { dx: 30, dy: -20 },
  bottom: { dx: 30, dy: 20 },
  "bottom-left": { dx: 18, dy: 25 },
  "bottom-center": { dx: 30, dy: 25 },
  "bottom-right": { dx: 42, dy: 25 },
}

/** Special terminal offsets per node type */
function getTerminalPos(
  nodeX: number,
  nodeY: number,
  nodeType: string,
  side: SchematicTerminalSide,
): { x: number; y: number } {
  const offset = TERMINAL_OFFSET[side]

  // Arduino pin terminal is at the end of the IC stub
  if (nodeType === "arduino_pin" && side === "right") {
    return { x: nodeX + ARDUINO_IC_TERMINAL_OFFSET, y: nodeY }
  }

  // Voltage source has terminal at right (x + 60)
  if (nodeType === "voltage_source" && side === "right") {
    return { x: nodeX + 60, y: nodeY }
  }

  // Ground has terminal at left (x)
  if (nodeType === "ground" && side === "left") {
    return { x: nodeX, y: nodeY }
  }

  // Connector-block modules (servo, temperature sensor): signal/power on the
  // left, ground on the right. Must match MODULE_PIN_DY / MODULE_GND_X used by
  // ServoSymbol and TemperatureSensorSymbol.
  if (nodeType === "servo" || nodeType === "temperature_sensor") {
    if (side === "left-top") return { x: nodeX, y: nodeY - 14 }
    if (side === "left-bottom") return { x: nodeX, y: nodeY + 14 }
    if (side === "right") return { x: nodeX + 64, y: nodeY }
  }

  // An IC pin's terminal is its node position (the stub runs into the body).
  if (nodeType === "ic_pin") {
    return { x: nodeX, y: nodeY }
  }

  return { x: nodeX + offset.dx, y: nodeY + offset.dy }
}

/** Unit vector pointing away from a component for a terminal on the given side. */
function outwardDir(side: SchematicTerminalSide): { dx: number; dy: number } {
  switch (side) {
    case "left":
    case "left-top":
    case "left-bottom":
      return { dx: -1, dy: 0 }
    case "right":
      return { dx: 1, dy: 0 }
    case "top":
      return { dx: 0, dy: -1 }
    default:
      return { dx: 0, dy: 1 } // bottom / bottom-* terminals face down
  }
}

function RailFlags({ layout }: { layout: SchematicLayout }) {
  return (
    <g>
      {layout.rails.map((rail) => {
        const node = layout.nodes.find((n) => n.id === rail.nodeId)
        if (node == null) return null
        const pos = getTerminalPos(node.x, node.y, node.type, rail.side)
        const dir = outwardDir(rail.side)
        return rail.kind === "ground" ? (
          <GroundFlag key={rail.id} x={pos.x} y={pos.y} dir={dir} />
        ) : (
          <PowerFlag key={rail.id} x={pos.x} y={pos.y} dir={dir} label={rail.label ?? "VCC"} />
        )
      })}
    </g>
  )
}

function wireColor(edge: SchematicEdge, layout: SchematicLayout): string {
  const fromNode = layout.nodes.find((n) => n.id === edge.fromNodeId)
  const toNode = layout.nodes.find((n) => n.id === edge.toNodeId)
  if (fromNode?.type === "voltage_source" || toNode?.type === "voltage_source") {
    return "#ef4444"
  }
  if (fromNode?.type === "ground" || toNode?.type === "ground") {
    return "#3b82f6"
  }
  return "#555"
}

function WirePath({ edge, layout }: { edge: SchematicEdge; layout: SchematicLayout }) {
  const fromNode = layout.nodes.find((n) => n.id === edge.fromNodeId)
  const toNode = layout.nodes.find((n) => n.id === edge.toNodeId)
  if (fromNode == null || toNode == null) return null

  const from = getTerminalPos(fromNode.x, fromNode.y, fromNode.type, edge.fromSide)
  const to = getTerminalPos(toNode.x, toNode.y, toNode.type, edge.toSide)

  const color = wireColor(edge, layout)

  // Orthogonal routing: horizontal to midpoint, then vertical, then horizontal
  let pathD: string
  if (Math.abs(from.y - to.y) < 2) {
    // Same Y: straight horizontal
    pathD = `M ${from.x} ${from.y} H ${to.x}`
  } else {
    const midX = (from.x + to.x) / 2
    pathD = `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`
  }

  return (
    <path
      d={pathD}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

// ── Junction Detection ─────────────────────────────────────────────────

function findJunctions(layout: SchematicLayout): Array<{ x: number; y: number }> {
  // A junction exists where more than 2 edges meet at the same terminal point
  const pointCount = new Map<string, { x: number; y: number; count: number }>()

  for (const edge of layout.edges) {
    const fromNode = layout.nodes.find((n) => n.id === edge.fromNodeId)
    const toNode = layout.nodes.find((n) => n.id === edge.toNodeId)
    if (fromNode == null || toNode == null) continue

    const from = getTerminalPos(fromNode.x, fromNode.y, fromNode.type, edge.fromSide)
    const to = getTerminalPos(toNode.x, toNode.y, toNode.type, edge.toSide)

    for (const pt of [from, to]) {
      const key = `${Math.round(pt.x)},${Math.round(pt.y)}`
      const existing = pointCount.get(key)
      if (existing != null) {
        existing.count++
      } else {
        pointCount.set(key, { x: pt.x, y: pt.y, count: 1 })
      }
    }
  }

  return [...pointCount.values()].filter((p) => p.count > 2)
}

// ── Main Renderer ──────────────────────────────────────────────────────

function ArduinoICBody({ layout }: { layout: SchematicLayout }) {
  const pinNodes = layout.nodes.filter((n) => n.type === "arduino_pin")
  if (pinNodes.length === 0) return null

  const ys = pinNodes.map((n) => n.y)
  const x = pinNodes[0]!.x
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  // Pad by half a pin slot above/below the first and last pin
  const vPad = 40
  const bodyX = x - 4
  const bodyY = minY - vPad
  const bodyW = ARDUINO_IC_LABEL_WIDTH + 4  // label area + left pad
  const bodyH = maxY - minY + vPad * 2

  const midY = bodyY + bodyH / 2
  const { ground, powerLabels } = layout.boardRails

  return (
    <g>
      {/* IC body rectangle */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        fill="rgba(34,197,94,0.05)"
        stroke="#22c55e"
        strokeWidth={1.5}
        rx={2}
      />
      {/* "Arduino" label rotated vertically in the center */}
      <text
        x={bodyX + bodyW / 2}
        y={midY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#22c55e"
        style={{ font: "bold 10px monospace", opacity: 0.6 }}
        transform={`rotate(-90, ${bodyX + bodyW / 2}, ${midY})`}
      >
        Arduino
      </text>
      {/* Board power rail flags on the top edge (power points up) */}
      {powerLabels.map((label, i) => (
        <PowerFlag
          key={`board-power-${label}`}
          x={bodyX + bodyW / 2 + (i - (powerLabels.length - 1) / 2) * 26}
          y={bodyY}
          dir={{ dx: 0, dy: -1 }}
          label={label}
        />
      ))}
      {/* Board ground flag on the bottom edge (ground points down) */}
      {ground && <GroundFlag x={bodyX + bodyW / 2} y={bodyY + bodyH} dir={{ dx: 0, dy: 1 }} />}
    </g>
  )
}

function IcBodyGroup({ layout }: { layout: SchematicLayout }) {
  // Group ic_pin nodes by their parent componentId so each multi-pin IC
  // gets a single body rectangle wrapping all its named pin stubs.
  const icGroups = new Map<string, { nodes: typeof layout.nodes; name: string }>()
  for (const node of layout.nodes) {
    if (node.type !== "ic_pin" || node.componentId == null) continue
    const existing = icGroups.get(node.componentId)
    if (existing != null) {
      existing.nodes.push(node)
    } else {
      icGroups.set(node.componentId, {
        nodes: [node],
        name: node.value ?? "",
      })
    }
  }

  if (icGroups.size === 0) return null

  return (
    <g>
      {[...icGroups.entries()].map(([componentId, group]) => {
        const ys = group.nodes.map((n) => n.y)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        // Left (input) pins define the body's left edge; right (output) pins its
        // right edge. A single-sided IC keeps the old fixed body width.
        const leftXs = group.nodes.filter((n) => n.icSide !== "right").map((n) => n.x)
        const rightXs = group.nodes.filter((n) => n.icSide === "right").map((n) => n.x)
        const singleWidth = 58
        let bodyX: number
        let bodyRight: number
        if (leftXs.length > 0 && rightXs.length > 0) {
          bodyX = Math.min(...leftXs) + 12
          bodyRight = Math.max(...rightXs) - 12
        } else if (leftXs.length > 0) {
          bodyX = Math.min(...leftXs) + 12
          bodyRight = bodyX + singleWidth
        } else {
          bodyRight = Math.max(...rightXs) - 12
          bodyX = bodyRight - singleWidth
        }
        const bodyW = bodyRight - bodyX
        const bodyY = minY - 40
        const bodyH = maxY - minY + 80

        return (
          <g key={`ic-body-${componentId}`}>
            <rect
              x={bodyX}
              y={bodyY}
              width={bodyW}
              height={bodyH}
              fill="rgba(100,100,100,0.08)"
              stroke="#555"
              strokeWidth={1.5}
              rx={2}
            />
            {group.name && (
              <text
                x={bodyX + bodyW / 2}
                y={bodyY + 12}
                textAnchor="middle"
                fill="currentColor" fillOpacity={0.6}
                fontStyle="italic"
                style={{ font: "10px monospace" }}
              >
                {group.name}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

export function SchematicRenderer({ layout, analysis, pressedButtons, selectedComponentId, onSelectComponent }: SchematicRendererProps) {
  const junctions = findJunctions(layout)

  return (
    // color drives currentColor for all neutral symbol ink, so the schematic
    // follows the theme foreground instead of hardcoded dark-canvas grays.
    <g style={{ color: "var(--foreground)" }}>
      {/* Arduino IC body (drawn behind everything) */}
      <ArduinoICBody layout={layout} />

      {/* Multi-pin IC bodies (shift register, seven-segment, lcd_16x2) */}
      <IcBodyGroup layout={layout} />

      {/* Edges (wires) */}
      {layout.edges.map((edge) => (
        <WirePath key={edge.id} edge={edge} layout={layout} />
      ))}

      {/* Distributed power/ground rail flags */}
      <RailFlags layout={layout} />

      {/* Junctions */}
      {junctions.map((j, i) => (
        <WireJunction key={`junc-${i}`} x={j.x} y={j.y} />
      ))}

      {/* Nodes (symbols) */}
      {layout.nodes.map((node) => {
        const compState = node.componentId != null
          ? analysis?.componentStates.get(node.componentId)
          : undefined

        const isSelected = node.componentId != null && node.componentId === selectedComponentId
        const clickable = node.componentId != null && onSelectComponent != null

        // For buttons, use physical press state passed from parent (via
        // useSyncExternalStore) — guarantees tear-free synchronous updates.
        const isButtonPressed =
          node.type === "button" && node.componentId != null
            ? pressedButtons.has(node.componentId)
            : undefined

        const symbolProps: SymbolProps = {
          x: node.x,
          y: node.y,
          label: node.label,
          value: node.value,
          voltage: compState?.voltage,
          current: compState?.current,
          isActive: isButtonPressed ?? compState?.isActive,
          isPwm: node.isPwm,
          icSide: node.icSide,
        }

        return (
          <g
            key={node.id}
            onClick={clickable ? (e) => { e.stopPropagation(); onSelectComponent(node.componentId!) } : undefined}
            style={clickable ? { cursor: "pointer" } : undefined}
          >
            {/* Selection highlight */}
            {isSelected && (
              <rect
                x={node.x - 8}
                y={node.y - 28}
                width={76}
                height={56}
                rx={6}
                fill="#3b82f6"
                fillOpacity={0.08}
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.7}
              />
            )}
            {renderSymbol(node.type, symbolProps)}
          </g>
        )
      })}
    </g>
  )
}
