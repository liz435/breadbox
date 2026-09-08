import { describe, expect, test } from "bun:test"
import {
  findSchematicJunctions,
  getSchematicTerminalPos,
  routeSchematicEdge,
  validateSchematicRouting,
} from "../schematic-routing"
import type { SchematicEdge, SchematicLayout, SchematicNode } from "../schematic-layout"

function node(id: string, x: number, y: number): SchematicNode {
  return { id, type: "ic_pin", x, y, label: id }
}

function edge(id: string, fromNodeId: string, toNodeId: string, netId: string): SchematicEdge {
  return { id, fromNodeId, toNodeId, fromSide: "right", toSide: "left", netId }
}

function layout(nodes: SchematicNode[], edges: SchematicEdge[]): SchematicLayout {
  return { nodes, edges, rails: [], boardRails: { ground: false, powerLabels: [] }, width: 800, height: 600 }
}

describe("schematic routing seam", () => {
  test("route metadata has the same terminal endpoints consumed by SVG", () => {
    const nodes = [node("a", 80, 100), node("b", 300, 220)]
    const current = routeSchematicEdge(edge("e1", "a", "b", "net-a"), layout(nodes, []))
    expect(current?.from).toEqual(getSchematicTerminalPos(nodes[0]!, "right"))
    expect(current?.to).toEqual(getSchematicTerminalPos(nodes[1]!, "left"))
    expect(current?.segments.every((segment) => segment.from.x === segment.to.x || segment.from.y === segment.to.y)).toBe(true)
  })

  test("different nets crossing in rendered geometry are rejected", () => {
    const nodes = [
      node("left", 80, 100),
      node("bottom", 300, 300),
      node("cross-left", 120, 200),
      node("cross-right", 420, 200),
    ]
    const current = layout(nodes, [
      edge("vertical", "left", "bottom", "net-a"),
      edge("horizontal", "cross-left", "cross-right", "net-b"),
    ])
    const issues = validateSchematicRouting(current)
    expect(issues.map((issue) => issue.code)).toContain("net_crossing_without_junction")
  })

  test("same-net branch intersection gets a visible junction", () => {
    const nodes = [
      node("left", 80, 100),
      node("bottom", 300, 300),
      node("cross-left", 120, 200),
      node("cross-right", 420, 200),
    ]
    const current = layout(nodes, [
      edge("vertical", "left", "bottom", "net-a"),
      edge("horizontal", "cross-left", "cross-right", "net-a"),
    ])
    expect(findSchematicJunctions(current)).toContainEqual({ x: 190, y: 200 })
  })
})
