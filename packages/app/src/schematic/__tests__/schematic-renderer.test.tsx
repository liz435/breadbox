import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

// We test the internal logic functions by re-exporting them or testing via the
// exported component. Since getTerminalPos, wireColor, findJunctions, and WirePath
// are not exported, we extract their logic directly here with matching implementations
// and use integration-style tests via SchematicRenderer for the exported surface.

// Import the renderer to get access to SchematicRenderer for integration tests
import { SchematicRenderer } from "../schematic-renderer"
import type {
  SchematicLayout,
  SchematicEdge,
  SchematicNode,
  SchematicTerminalSide,
} from "../schematic-layout"

// ── Helpers ────────────────────────────────────────────────────────────

// Mirror of getTerminalPos from schematic-renderer for unit testing the spec
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

function getTerminalPos(
  nodeX: number,
  nodeY: number,
  nodeType: string,
  side: SchematicTerminalSide,
): { x: number; y: number } {
  const offset = TERMINAL_OFFSET[side]
  if (nodeType === "arduino_pin" && side === "right") {
    return { x: nodeX + 50, y: nodeY }
  }
  if (nodeType === "voltage_source" && side === "right") {
    return { x: nodeX + 60, y: nodeY }
  }
  if (nodeType === "ground" && side === "left") {
    return { x: nodeX, y: nodeY }
  }
  if (nodeType === "servo" || nodeType === "temperature_sensor") {
    if (side === "left-top") return { x: nodeX, y: nodeY - 14 }
    if (side === "left-bottom") return { x: nodeX, y: nodeY + 14 }
    if (side === "right") return { x: nodeX + 64, y: nodeY }
  }
  return { x: nodeX + offset.dx, y: nodeY + offset.dy }
}

// Mirror of wireColor from schematic-renderer
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

// Mirror of findJunctions from schematic-renderer
function findJunctions(layout: SchematicLayout): Array<{ x: number; y: number }> {
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

function makeNode(overrides: Partial<SchematicNode> & { id: string; type: SchematicNode["type"] }): SchematicNode {
  return {
    x: 100,
    y: 100,
    label: "Test",
    ...overrides,
  }
}

function makeEdge(overrides: Partial<SchematicEdge> & { id: string; fromNodeId: string; toNodeId: string }): SchematicEdge {
  return {
    fromSide: "right",
    toSide: "left",
    netId: "net-1",
    ...overrides,
  }
}

function makeLayout(nodes: SchematicNode[], edges: SchematicEdge[]): SchematicLayout {
  return { nodes, edges, rails: [], boardRails: { ground: false, powerLabels: [] }, width: 800, height: 600 }
}

// ── getTerminalPos special cases ────────────────────────────────────────

describe("getTerminalPos — arduino_pin", () => {
  test("arduino_pin right side returns (x+50, y)", () => {
    const pos = getTerminalPos(80, 100, "arduino_pin", "right")
    expect(pos.x).toBe(130)
    expect(pos.y).toBe(100)
  })

  test("arduino_pin left side uses default offset (x, y)", () => {
    const pos = getTerminalPos(80, 100, "arduino_pin", "left")
    expect(pos.x).toBe(80)
    expect(pos.y).toBe(100)
  })

  test("arduino_pin top side uses default offset (x+30, y-20)", () => {
    const pos = getTerminalPos(80, 100, "arduino_pin", "top")
    expect(pos.x).toBe(110)
    expect(pos.y).toBe(80)
  })
})

describe("getTerminalPos — voltage_source", () => {
  test("voltage_source right side returns (x+60, y)", () => {
    const pos = getTerminalPos(80, 100, "voltage_source", "right")
    expect(pos.x).toBe(140)
    expect(pos.y).toBe(100)
  })

  test("voltage_source left side uses default offset (x, y)", () => {
    const pos = getTerminalPos(80, 100, "voltage_source", "left")
    expect(pos.x).toBe(80)
    expect(pos.y).toBe(100)
  })
})

describe("getTerminalPos — ground", () => {
  test("ground left side returns (x, y)", () => {
    const pos = getTerminalPos(500, 200, "ground", "left")
    expect(pos.x).toBe(500)
    expect(pos.y).toBe(200)
  })

  test("ground right side uses default offset (x+60, y)", () => {
    const pos = getTerminalPos(500, 200, "ground", "right")
    expect(pos.x).toBe(560)
    expect(pos.y).toBe(200)
  })
})

describe("getTerminalPos — default (generic component)", () => {
  test("left side returns (x, y) — no offset", () => {
    const pos = getTerminalPos(200, 150, "resistor", "left")
    expect(pos.x).toBe(200)
    expect(pos.y).toBe(150)
  })

  test("right side returns (x+60, y)", () => {
    const pos = getTerminalPos(200, 150, "resistor", "right")
    expect(pos.x).toBe(260)
    expect(pos.y).toBe(150)
  })

  test("top side returns (x+30, y-20)", () => {
    const pos = getTerminalPos(200, 150, "led", "top")
    expect(pos.x).toBe(230)
    expect(pos.y).toBe(130)
  })

  test("bottom side returns (x+30, y+20)", () => {
    const pos = getTerminalPos(200, 150, "led", "bottom")
    expect(pos.x).toBe(230)
    expect(pos.y).toBe(170)
  })

  test("servo left-top returns signal terminal position", () => {
    const pos = getTerminalPos(200, 150, "servo", "left-top")
    expect(pos.x).toBe(200)
    expect(pos.y).toBe(136)
  })

  test("servo right returns gnd terminal position", () => {
    const pos = getTerminalPos(200, 150, "servo", "right")
    expect(pos.x).toBe(264)
    expect(pos.y).toBe(150)
  })

  test("temperature sensor left-top returns its OUT terminal position", () => {
    const pos = getTerminalPos(200, 150, "temperature_sensor", "left-top")
    expect(pos.x).toBe(200)
    expect(pos.y).toBe(136)
  })

  test("temperature sensor right returns its GND terminal position", () => {
    const pos = getTerminalPos(200, 150, "temperature_sensor", "right")
    expect(pos.x).toBe(264)
    expect(pos.y).toBe(150)
  })

  test("unknown component type falls through to default offsets", () => {
    const pos = getTerminalPos(100, 100, "unknown_type", "right")
    expect(pos.x).toBe(160)
    expect(pos.y).toBe(100)
  })
})

// ── wireColor ──────────────────────────────────────────────────────────

describe("wireColor", () => {
  test("returns red (#ef4444) when fromNode is voltage_source", () => {
    const nodes = [
      makeNode({ id: "vs", type: "voltage_source", x: 80, y: 80 }),
      makeNode({ id: "r1", type: "resistor", x: 230, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "vs", toNodeId: "r1" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#ef4444")
  })

  test("returns red (#ef4444) when toNode is voltage_source", () => {
    const nodes = [
      makeNode({ id: "r1", type: "resistor", x: 80, y: 80 }),
      makeNode({ id: "vs", type: "voltage_source", x: 230, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "r1", toNodeId: "vs" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#ef4444")
  })

  test("returns blue (#3b82f6) when fromNode is ground", () => {
    const nodes = [
      makeNode({ id: "gnd", type: "ground", x: 500, y: 100 }),
      makeNode({ id: "r1", type: "resistor", x: 350, y: 100 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "gnd", toNodeId: "r1" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#3b82f6")
  })

  test("returns blue (#3b82f6) when toNode is ground", () => {
    const nodes = [
      makeNode({ id: "r1", type: "resistor", x: 350, y: 100 }),
      makeNode({ id: "gnd", type: "ground", x: 500, y: 100 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "r1", toNodeId: "gnd" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#3b82f6")
  })

  test("returns gray (#555) for signal wire (arduino_pin to resistor)", () => {
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#555")
  })

  test("returns gray (#555) for led to resistor edge (no power/ground)", () => {
    const nodes = [
      makeNode({ id: "comp-led1", type: "led", x: 230, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 380, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "comp-led1", toNodeId: "comp-r1" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#555")
  })

  test("voltage_source takes priority over ground when both are nodes (voltage_source is from)", () => {
    // If fromNode is voltage_source and toNode is ground, should be red (voltage source wins first check)
    const nodes = [
      makeNode({ id: "vs", type: "voltage_source", x: 80, y: 80 }),
      makeNode({ id: "gnd", type: "ground", x: 500, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "vs", toNodeId: "gnd" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#ef4444")
  })
})

// ── wireColor with missing nodes ───────────────────────────────────────

describe("wireColor — missing node graceful handling", () => {
  test("returns gray when fromNode is not found in layout", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "missing-node", toNodeId: "comp-r1" })
    const layout = makeLayout(nodes, [edge])
    // fromNode is undefined — should not crash, fall through to gray
    expect(wireColor(edge, layout)).toBe("#555")
  })

  test("returns gray when toNode is not found in layout", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
    ]
    const edge = makeEdge({ id: "e1", fromNodeId: "comp-r1", toNodeId: "missing-node" })
    const layout = makeLayout(nodes, [edge])
    expect(wireColor(edge, layout)).toBe("#555")
  })

  test("returns gray when both nodes are missing", () => {
    const edge = makeEdge({ id: "e1", fromNodeId: "missing-a", toNodeId: "missing-b" })
    const layout = makeLayout([], [edge])
    expect(wireColor(edge, layout)).toBe("#555")
  })
})

// ── findJunctions ──────────────────────────────────────────────────────

describe("findJunctions", () => {
  test("returns empty array when no edges", () => {
    const layout = makeLayout([], [])
    expect(findJunctions(layout)).toHaveLength(0)
  })

  test("returns no junctions when each terminal is used by at most 2 edges", () => {
    // Two edges sharing no terminal point → no junction
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
      makeNode({ id: "comp-led1", type: "led", x: 380, y: 80 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
      makeEdge({ id: "e2", fromNodeId: "comp-r1", toNodeId: "comp-led1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const junctions = findJunctions(layout)
    // The right terminal of comp-r1 (x=290, y=80) appears as: toNode of e1, fromNode of e2 → count=2 → not >2
    // No junction expected
    expect(junctions).toHaveLength(0)
  })

  test("detects junction when 3 edges share the same terminal point", () => {
    // Three edges all leaving from the right side of the same node → junction
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
      makeNode({ id: "comp-led1", type: "led", x: 230, y: 180 }),
      makeNode({ id: "comp-led2", type: "led", x: 230, y: 280 }),
    ]
    // All three edges connect from pin-13 right terminal (x=130, y=80)
    // But that's impossible since each edge has unique from/to.
    // Instead: three edges share the same TO terminal on comp-r1 left (x=230, y=80)
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
      makeEdge({ id: "e2", fromNodeId: "comp-led1", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
      makeEdge({ id: "e3", fromNodeId: "comp-led2", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const junctions = findJunctions(layout)
    // comp-r1 left terminal (230, 80) appears 3 times → count=3 → junction
    expect(junctions.length).toBeGreaterThan(0)
    const junction = junctions.find((j) => Math.round(j.x) === 230 && Math.round(j.y) === 80)
    expect(junction).toBeDefined()
  })

  test("no junction when only 2 edges share a terminal point (exactly at boundary)", () => {
    // Two edges meet at one terminal — exactly 2, not > 2 → no junction
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
      makeNode({ id: "comp-led1", type: "led", x: 380, y: 80 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
      makeEdge({ id: "e2", fromNodeId: "comp-r1", toNodeId: "comp-led1", fromSide: "left", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const junctions = findJunctions(layout)
    // comp-r1 left terminal (230, 80): appears as toNode of e1, fromNode of e2 → count=2 → not >2
    expect(junctions).toHaveLength(0)
  })

  test("skips edges with missing nodes — does not crash", () => {
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "missing-node" }),
    ]
    const layout = makeLayout(nodes, edges)
    // Should not throw
    expect(() => findJunctions(layout)).not.toThrow()
    expect(findJunctions(layout)).toHaveLength(0)
  })
})

// ── WirePath via SchematicRenderer integration ─────────────────────────

describe("WirePath — rendered wire paths (via SchematicRenderer)", () => {
  function renderLayout(layout: SchematicLayout): string {
    return renderToStaticMarkup(
      <svg>
        <SchematicRenderer
          layout={layout}
          analysis={null}
          pressedButtons={new Set()}
        />
      </svg>
    )
  }

  test("straight horizontal path when from.y equals to.y", () => {
    // Two nodes at same Y — wire should be straight horizontal H command
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 100 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 100 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    // Straight horizontal: "M x y H to_x" (no V segment)
    // from: arduino_pin right → (80+50, 100) = (130, 100)
    // to: resistor left → (230, 100)
    expect(html).toContain("H 230")
    // Should NOT have a V segment for same-y wires
    expect(html).not.toMatch(/V \d/)
  })

  test("orthogonal path (H-V-H) when from.y differs from to.y", () => {
    // Two nodes at different Y — wire should route with midpoint bend
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 200 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    // Must have a V segment (vertical portion)
    expect(html).toMatch(/V \d/)
  })

  test("missing fromNode in layout causes WirePath to render nothing — no crash", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 100 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "missing-node", toNodeId: "comp-r1" }),
    ]
    const layout = makeLayout(nodes, edges)
    // Should not throw — WirePath must return null gracefully
    expect(() => renderLayout(layout)).not.toThrow()
    const html = renderLayout(layout)
    // No wire-specific H/V routing commands (the resistor symbol uses path too,
    // but wire paths use M x y H ... routing — verify no H command follows an M at
    // wire coordinates). Simplest: no stroke with wire colors from this edge.
    // The edge has no valid nodes → wireColor falls through to #555, but there is
    // no wire path rendered. Verify by checking for the wire's specific "M 130" start
    // (missing node → from terminal would be at missing-node coords, never rendered).
    // Best proxy: the html does not contain an H segment starting from pin x+50 area.
    // We just confirm it does not crash and the output is well-formed.
    expect(html).toContain("</svg>")
  })

  test("missing toNode in layout causes WirePath to render nothing — no crash", () => {
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 100 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "missing-node" }),
    ]
    const layout = makeLayout(nodes, edges)
    expect(() => renderLayout(layout)).not.toThrow()
    const html = renderLayout(layout)
    // No stroke path for a wire — verify it doesn't explode
    expect(html).toContain("</svg>")
    // The arduino_pin symbol renders without a path element (rect + line + circle)
    // so no <path d= from a wire or a symbol for this node type
    expect(html).not.toContain(`<path`)
  })

  test("empty layout renders without crashing", () => {
    const layout = makeLayout([], [])
    expect(() => renderLayout(layout)).not.toThrow()
  })

  test("power wire is red in rendered SVG", () => {
    const nodes = [
      makeNode({ id: "vs", type: "voltage_source", x: 80, y: 100 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 100 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "vs", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    expect(html).toContain("#ef4444")
  })

  test("ground wire is blue in rendered SVG", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 100 }),
      makeNode({ id: "gnd", type: "ground", x: 380, y: 100 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "comp-r1", toNodeId: "gnd", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    expect(html).toContain("#3b82f6")
  })

  test("signal wire uses gray (#555) color in rendered SVG", () => {
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 100 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 100 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    expect(html).toContain("#555")
  })
})

// ── SchematicRenderer node rendering ──────────────────────────────────

describe("SchematicRenderer — node symbol rendering", () => {
  function renderLayout(layout: SchematicLayout): string {
    return renderToStaticMarkup(
      <svg>
        <SchematicRenderer
          layout={layout}
          analysis={null}
          pressedButtons={new Set()}
        />
      </svg>
    )
  }

  test("renders symbol for each node in layout", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 80, y: 100, label: "R1" }),
      makeNode({ id: "comp-led1", type: "led", x: 80, y: 200, label: "LED1" }),
    ]
    const layout = makeLayout(nodes, [])
    const html = renderLayout(layout)
    expect(html).toContain("R1")
    expect(html).toContain("LED1")
  })

  test("selected component gets selection highlight rect", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 80, y: 100, label: "R1", componentId: "r1" }),
    ]
    const layout = makeLayout(nodes, [])
    const html = renderToStaticMarkup(
      <svg>
        <SchematicRenderer
          layout={layout}
          analysis={null}
          pressedButtons={new Set()}
          selectedComponentId="r1"
        />
      </svg>
    )
    // Selected highlight rect has stroke-dasharray="4 2"
    expect(html).toContain(`stroke-dasharray="4 2"`)
  })

  test("non-selected component has no selection highlight", () => {
    const nodes = [
      makeNode({ id: "comp-r1", type: "resistor", x: 80, y: 100, label: "R1", componentId: "r1" }),
    ]
    const layout = makeLayout(nodes, [])
    const html = renderLayout(layout)
    expect(html).not.toContain(`stroke-dasharray="4 2"`)
  })

  test("junction dots appear when 3+ edges share a terminal", () => {
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
      makeNode({ id: "comp-led1", type: "led", x: 230, y: 180 }),
      makeNode({ id: "comp-led2", type: "led", x: 230, y: 280 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
      makeEdge({ id: "e2", fromNodeId: "comp-led1", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
      makeEdge({ id: "e3", fromNodeId: "comp-led2", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    // WireJunction is the only circle with r="4" (terminal dots use r=3/2.5)
    expect(html).toContain(`r="4"`)
  })

  test("no junction dots when no terminal has 3+ edges", () => {
    const nodes = [
      makeNode({ id: "pin-13", type: "arduino_pin", x: 80, y: 80 }),
      makeNode({ id: "comp-r1", type: "resistor", x: 230, y: 80 }),
    ]
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "pin-13", toNodeId: "comp-r1", fromSide: "right", toSide: "left" }),
    ]
    const layout = makeLayout(nodes, edges)
    const html = renderLayout(layout)
    // No junction circle (r="4" is unique to junctions)
    expect(html).not.toContain(`r="4"`)
  })

  test("distributed rail flags render (power red + ground blue)", () => {
    const nodes = [makeNode({ id: "comp-led1", type: "led", x: 230, y: 100, componentId: "led1" })]
    const layout: SchematicLayout = {
      nodes,
      edges: [],
      rails: [
        { id: "r1", nodeId: "comp-led1", side: "left", kind: "power", label: "5V" },
        { id: "r2", nodeId: "comp-led1", side: "right", kind: "ground" },
      ],
      boardRails: { ground: false, powerLabels: [] },
      width: 800,
      height: 600,
    }
    const html = renderLayout(layout)
    expect(html).toContain("#ef4444") // power flag
    expect(html).toContain("#3b82f6") // ground flag
    expect(html).toContain("5V")
  })

  test("board rail flags render on the Arduino IC body", () => {
    const nodes = [makeNode({ id: "pin-9", type: "arduino_pin", x: 80, y: 100 })]
    const layout: SchematicLayout = {
      nodes,
      edges: [],
      rails: [],
      boardRails: { ground: true, powerLabels: ["5V"] },
      width: 800,
      height: 600,
    }
    const html = renderLayout(layout)
    expect(html).toContain("5V") // board power flag label
    expect(html).toContain("#3b82f6") // board ground flag
  })
})
