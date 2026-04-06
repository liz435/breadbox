// ── Schematic Renderer ─────────────────────────────────────────────────
//
// Renders a SchematicLayout as SVG: nodes as schematic symbols,
// edges as orthogonal wires, with optional circuit analysis annotations.

import type { CircuitAnalysis } from "@/simulator/circuit-solver"
import type { SchematicLayout, SchematicEdge } from "./schematic-layout"
import { renderSymbol, WireJunction, type SymbolProps } from "./schematic-symbols"

type SchematicRendererProps = {
  layout: SchematicLayout
  analysis: CircuitAnalysis | null
}

// ── Wire Routing ───────────────────────────────────────────────────────

/** Terminal offset: how far from the node center to the wire connection point */
const TERMINAL_OFFSET: Record<string, { dx: number; dy: number }> = {
  left: { dx: 0, dy: 0 },
  right: { dx: 60, dy: 0 },
  top: { dx: 30, dy: -20 },
  bottom: { dx: 30, dy: 20 },
}

/** Special terminal offsets per node type */
function getTerminalPos(
  nodeX: number,
  nodeY: number,
  nodeType: string,
  side: "left" | "right" | "top" | "bottom",
): { x: number; y: number } {
  const offset = TERMINAL_OFFSET[side]

  // Arduino pin has terminal at right edge (width 36 + 14 lead)
  if (nodeType === "arduino_pin" && side === "right") {
    return { x: nodeX + 50, y: nodeY }
  }

  // Voltage source has terminal at right (x + 60)
  if (nodeType === "voltage_source" && side === "right") {
    return { x: nodeX + 60, y: nodeY }
  }

  // Ground has terminal at left (x)
  if (nodeType === "ground" && side === "left") {
    return { x: nodeX, y: nodeY }
  }

  return { x: nodeX + offset.dx, y: nodeY + offset.dy }
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

export function SchematicRenderer({ layout, analysis }: SchematicRendererProps) {
  const junctions = findJunctions(layout)

  return (
    <g>
      {/* Edges (wires) */}
      {layout.edges.map((edge) => (
        <WirePath key={edge.id} edge={edge} layout={layout} />
      ))}

      {/* Junctions */}
      {junctions.map((j, i) => (
        <WireJunction key={`junc-${i}`} x={j.x} y={j.y} />
      ))}

      {/* Nodes (symbols) */}
      {layout.nodes.map((node) => {
        const compState = node.componentId != null
          ? analysis?.componentStates.get(node.componentId)
          : undefined

        const symbolProps: SymbolProps = {
          x: node.x,
          y: node.y,
          label: node.label,
          value: node.value,
          voltage: compState?.voltage,
          current: compState?.current,
          isActive: compState?.isActive,
        }

        return (
          <g key={node.id}>
            {renderSymbol(node.type, symbolProps)}
          </g>
        )
      })}
    </g>
  )
}
