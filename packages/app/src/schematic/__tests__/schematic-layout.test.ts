import { describe, test, expect } from "bun:test"
import { generateSchematicLayout } from "../schematic-layout"
import type { BoardComponent, Wire } from "@dreamer/schemas"

// ── Helpers ────────────────────────────────────────────────────────────

function makeLed(id: string, row: number, col: number): BoardComponent {
  return {
    id,
    type: "led",
    name: `LED ${id}`,
    x: col,
    y: row,
    rotation: 0,
    pins: { anode: null, cathode: null },
    properties: { color: "#ef4444" },
  }
}

function makeResistor(id: string, row: number, col: number, resistance = 220): BoardComponent {
  return {
    id,
    type: "resistor",
    name: `R ${id}`,
    x: col,
    y: row,
    rotation: 0,
    pins: { a: null, b: null },
    properties: { resistance },
  }
}

function makeRelay(id: string, row: number, col: number): BoardComponent {
  return {
    id,
    type: "relay",
    name: `Relay ${id}`,
    x: col,
    y: row,
    rotation: 0,
    pins: { signal: null },
    properties: {},
  }
}

function makeArduino(id = "arduino"): BoardComponent {
  return {
    id,
    type: "arduino_uno",
    name: "Arduino Uno",
    x: 0,
    y: 0,
    rotation: 0,
    pins: {},
    properties: {},
  }
}

function makeArduinoNano(id = "arduino"): BoardComponent {
  return {
    id,
    type: "arduino_nano",
    name: "Arduino Nano",
    x: 0,
    y: 0,
    rotation: 0,
    pins: {},
    properties: {},
  }
}

function makeArduinoMega(id = "arduino"): BoardComponent {
  return {
    id,
    type: "arduino_mega_2560",
    name: "Arduino Mega",
    x: 0,
    y: 0,
    rotation: 0,
    pins: {},
    properties: {},
  }
}

// fromRow: -999 sentinel means Arduino pin wire; fromCol is the pin number
function makeArduinoWire(id: string, arduinoPin: number, toRow: number, toCol: number): Wire {
  return { id, fromRow: -999, fromCol: arduinoPin, toRow, toCol, color: "#22c55e" }
}

function makeWire(id: string, fromRow: number, fromCol: number, toRow: number, toCol: number): Wire {
  return { id, fromRow, fromCol, toRow, toCol, color: "#22c55e" }
}

// ── Empty board ────────────────────────────────────────────────────────

describe("generateSchematicLayout — empty board", () => {
  test("returns empty layout when no components", () => {
    const layout = generateSchematicLayout({}, {})
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })

  test("returns empty layout when only arduino board component (no circuit components)", () => {
    const layout = generateSchematicLayout(
      { arduino: makeArduino() },
      {},
    )
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })
})

// ── Components without schematic symbols ──────────────────────────────

describe("generateSchematicLayout — components without schematic symbols", () => {
  test("relay component is skipped — no node created", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      relay1: makeRelay("relay1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const relayNode = layout.nodes.find((n) => n.id === "comp-relay1")
    expect(relayNode).toBeUndefined()
  })

  test("board with only unsupported components produces empty layout", () => {
    const components: Record<string, BoardComponent> = {
      relay1: makeRelay("relay1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
  })
})

// ── Single component ──────────────────────────────────────────────────

describe("generateSchematicLayout — single component", () => {
  test("single LED with no wires creates one comp node, no signal/power nodes", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    expect(layout.nodes).toHaveLength(1)
    expect(layout.nodes[0]!.id).toBe("comp-led1")
    expect(layout.nodes[0]!.type).toBe("led")
    expect(layout.edges).toHaveLength(0)
  })

  test("single LED node is placed at PADDING (80) x PADDING (80)", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    const ledNode = layout.nodes.find((n) => n.id === "comp-led1")
    expect(ledNode).toBeDefined()
    // No power or signal columns, so component column = 0
    // x = PADDING + 0 * HORIZONTAL_SPACING = 80
    expect(ledNode!.x).toBe(80)
    expect(ledNode!.y).toBe(80)
  })

  test("single LED label matches component name", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    expect(layout.nodes[0]!.label).toBe("LED led1")
  })

  test("single LED has componentId set", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    expect(layout.nodes[0]!.componentId).toBe("led1")
  })

  test("width and height are non-zero for single node", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
  })
})

// ── Multiple components vertical stacking ─────────────────────────────

describe("generateSchematicLayout — multiple components", () => {
  test("two components are stacked vertically in same column", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      led2: makeLed("led2", 10, 0),
    }
    const layout = generateSchematicLayout(components, {})
    const n1 = layout.nodes.find((n) => n.id === "comp-led1")
    const n2 = layout.nodes.find((n) => n.id === "comp-led2")
    expect(n1).toBeDefined()
    expect(n2).toBeDefined()
    // Same column → same x
    expect(n1!.x).toBe(n2!.x)
    // Stacked → second node is lower (higher y)
    expect(n2!.y).toBeGreaterThan(n1!.y)
    // Separation equals VERTICAL_SPACING (100)
    expect(n2!.y - n1!.y).toBe(100)
  })

  test("three components produce three nodes", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 7, 0),
      led2: makeLed("led2", 10, 0),
    }
    const layout = generateSchematicLayout(components, {})
    const compNodes = layout.nodes.filter((n) => n.id.startsWith("comp-"))
    expect(compNodes).toHaveLength(3)
  })

  test("mixed led and resistor both get correct symbol types", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 7, 0),
    }
    const layout = generateSchematicLayout(components, {})
    const ledNode = layout.nodes.find((n) => n.id === "comp-led1")
    const resistorNode = layout.nodes.find((n) => n.id === "comp-r1")
    expect(ledNode!.type).toBe("led")
    expect(resistorNode!.type).toBe("resistor")
  })
})

// ── Signal pin column ─────────────────────────────────────────────────

describe("generateSchematicLayout — signal pin nodes", () => {
  test("Arduino digital pin wire creates an arduino_pin node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pinNode = layout.nodes.find((n) => n.id === "pin-13")
    expect(pinNode).toBeDefined()
    expect(pinNode!.type).toBe("arduino_pin")
    expect(pinNode!.arduinoPin).toBe(13)
  })

  test("signal pin node is placed to left of component node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pinNode = layout.nodes.find((n) => n.id === "pin-13")
    const compNode = layout.nodes.find((n) => n.id === "comp-led1")
    expect(pinNode!.x).toBeLessThan(compNode!.x)
  })

  test("multiple signal pins are stacked vertically", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
      led2: makeLed("led2", 10, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 12, 5, 0),
      w2: makeArduinoWire("w2", 13, 10, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pin12 = layout.nodes.find((n) => n.id === "pin-12")
    const pin13 = layout.nodes.find((n) => n.id === "pin-13")
    expect(pin12).toBeDefined()
    expect(pin13).toBeDefined()
    expect(pin12!.x).toBe(pin13!.x)
    expect(pin13!.y).toBeGreaterThan(pin12!.y)
  })

  test("signal pin label is formatted as D13 for digital pin 13 on uno", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pinNode = layout.nodes.find((n) => n.id === "pin-13")
    expect(pinNode!.label).toBe("D13")
  })
})

// ── Power pin nodes ────────────────────────────────────────────────────

describe("generateSchematicLayout — power nodes", () => {
  test("5V pin (-1) creates a voltage_source node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -1, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const powerNode = layout.nodes.find((n) => n.id === "power--1")
    expect(powerNode).toBeDefined()
    expect(powerNode!.type).toBe("voltage_source")
    expect(powerNode!.label).toBe("5V")
    expect(powerNode!.arduinoPin).toBe(-1)
  })

  test("3.3V pin (-2) creates a voltage_source node with label 3.3V", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -2, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const powerNode = layout.nodes.find((n) => n.id === "power--2")
    expect(powerNode).toBeDefined()
    expect(powerNode!.label).toBe("3.3V")
  })

  test("power node is placed to the left of signal pin column", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w5v: makeArduinoWire("w5v", -1, 5, 0),
      w13: makeArduinoWire("w13", 13, 7, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const powerNode = layout.nodes.find((n) => n.id === "power--1")
    const pinNode = layout.nodes.find((n) => n.id === "pin-13")
    expect(powerNode!.x).toBeLessThan(pinNode!.x)
  })
})

// ── Ground nodes ──────────────────────────────────────────────────────

describe("generateSchematicLayout — ground nodes", () => {
  test("GND pin -3 creates a single ground node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -3, 6, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const groundNode = layout.nodes.find((n) => n.id === "ground")
    expect(groundNode).toBeDefined()
    expect(groundNode!.type).toBe("ground")
    expect(groundNode!.label).toBe("GND")
  })

  test("GND pin -4 creates a single ground node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -4, 6, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const groundNode = layout.nodes.find((n) => n.id === "ground")
    expect(groundNode).toBeDefined()
    expect(groundNode!.type).toBe("ground")
  })

  test("GND pin -6 creates a single ground node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -6, 6, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const groundNode = layout.nodes.find((n) => n.id === "ground")
    expect(groundNode).toBeDefined()
  })

  test("multiple GND pins create only one ground node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
      led2: makeLed("led2", 10, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -3, 6, 0),
      w2: makeArduinoWire("w2", -4, 11, 0),
      w3: makeArduinoWire("w3", -6, 12, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const groundNodes = layout.nodes.filter((n) => n.type === "ground")
    expect(groundNodes).toHaveLength(1)
  })

  test("ground node is placed to the right of component column", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -3, 6, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const groundNode = layout.nodes.find((n) => n.id === "ground")
    const compNode = layout.nodes.find((n) => n.id === "comp-led1")
    expect(groundNode!.x).toBeGreaterThan(compNode!.x)
  })
})

// ── Board target detection ─────────────────────────────────────────────

describe("generateSchematicLayout — board target detection", () => {
  test("arduino_nano board uses nano-specific pin labels", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduinoNano(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pinNode = layout.nodes.find((n) => n.id === "pin-13")
    expect(pinNode).toBeDefined()
    // D13 is the same label for nano, but important that it resolves without throwing
    expect(pinNode!.label).toContain("13")
  })

  test("arduino_mega_2560 board is detected from components", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduinoMega(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pinNode = layout.nodes.find((n) => n.id === "pin-13")
    expect(pinNode).toBeDefined()
    expect(pinNode!.label).toContain("13")
  })

  test("no arduino board component falls back to DEFAULT_BOARD_TARGET without crashing", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    // Just verifying it doesn't throw
    expect(layout.nodes.length).toBeGreaterThan(0)
  })
})

// ── Edge generation ────────────────────────────────────────────────────

describe("generateSchematicLayout — edge generation", () => {
  test("no edges when component has no Arduino pin wire connections", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const layout = generateSchematicLayout(components, {})
    expect(layout.edges).toHaveLength(0)
  })

  test("Arduino pin connected to LED generates at least one edge", () => {
    // pin 13 → row 5 col 0 (LED anode)
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    expect(layout.edges.length).toBeGreaterThan(0)
  })

  test("edges have unique IDs", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 7, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
      w2: makeArduinoWire("w2", 12, 7, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const ids = layout.edges.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test("edge netId matches a net from the resolved topology", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    for (const edge of layout.edges) {
      expect(edge.netId).toBeTruthy()
      expect(typeof edge.netId).toBe("string")
    }
  })

  test("edge fromSide and toSide are valid directions", () => {
    const validSides = new Set(["left", "right", "top", "bottom"])
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    for (const edge of layout.edges) {
      expect(validSides.has(edge.fromSide)).toBe(true)
      expect(validSides.has(edge.toSide)).toBe(true)
    }
  })

  test("no self-referencing edges (fromNodeId !== toNodeId)", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 5, 2),
    }
    // Wire both pins to the same net
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
      w2: makeArduinoWire("w2", 13, 5, 2), // same arduino pin
    }
    const layout = generateSchematicLayout(components, wires)
    for (const edge of layout.edges) {
      expect(edge.fromNodeId).not.toBe(edge.toNodeId)
    }
  })

  test("ground connection edge has fromSide or toSide of left for ground node", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", -3, 6, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const groundEdges = layout.edges.filter(
      (e) => e.fromNodeId === "ground" || e.toNodeId === "ground"
    )
    for (const edge of groundEdges) {
      if (edge.fromNodeId === "ground") {
        expect(edge.fromSide).toBe("left")
      }
      if (edge.toNodeId === "ground") {
        expect(edge.toSide).toBe("left")
      }
    }
  })
})

// ── Dimension calculation ─────────────────────────────────────────────

describe("generateSchematicLayout — dimensions", () => {
  test("width and height encompass all node positions", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 7, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeArduinoWire("w1", 13, 5, 0),
      w2: makeArduinoWire("w2", -3, 8, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const maxNodeX = Math.max(...layout.nodes.map((n) => n.x))
    const maxNodeY = Math.max(...layout.nodes.map((n) => n.y))
    // width = maxNodeX + HORIZONTAL_SPACING (150) + PADDING (80)
    expect(layout.width).toBeGreaterThanOrEqual(maxNodeX)
    expect(layout.height).toBeGreaterThanOrEqual(maxNodeY)
  })

  test("width grows when more columns are added", () => {
    // Board with just a component
    const comp = generateSchematicLayout(
      { led1: makeLed("led1", 5, 0) },
      {},
    )
    // Board with signal pin + component
    const compWithPin = generateSchematicLayout(
      { arduino: makeArduino(), led1: makeLed("led1", 5, 0) },
      { w1: makeArduinoWire("w1", 13, 5, 0) },
    )
    expect(compWithPin.width).toBeGreaterThan(comp.width)
  })

  test("height grows when more component rows are stacked", () => {
    const one = generateSchematicLayout(
      { led1: makeLed("led1", 5, 0) },
      {},
    )
    const two = generateSchematicLayout(
      { led1: makeLed("led1", 5, 0), led2: makeLed("led2", 10, 0) },
      {},
    )
    expect(two.height).toBeGreaterThan(one.height)
  })
})

// ── Column layout structure ────────────────────────────────────────────

describe("generateSchematicLayout — column ordering", () => {
  test("power column is leftmost when power pin is connected", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w5v: makeArduinoWire("w5v", -1, 5, 0),
      w13: makeArduinoWire("w13", 13, 7, 0),
      wgnd: makeArduinoWire("wgnd", -3, 6, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const powerNode = layout.nodes.find((n) => n.type === "voltage_source")
    const pinNode = layout.nodes.find((n) => n.type === "arduino_pin")
    const compNode = layout.nodes.find((n) => n.id === "comp-led1")
    const groundNode = layout.nodes.find((n) => n.type === "ground")
    expect(powerNode).toBeDefined()
    expect(pinNode).toBeDefined()
    expect(compNode).toBeDefined()
    expect(groundNode).toBeDefined()
    // Left to right: power < signal < component < ground
    expect(powerNode!.x).toBeLessThan(pinNode!.x)
    expect(pinNode!.x).toBeLessThan(compNode!.x)
    expect(compNode!.x).toBeLessThan(groundNode!.x)
  })

  test("signal column is at PADDING when no power column present", () => {
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w13: makeArduinoWire("w13", 13, 5, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const pinNode = layout.nodes.find((n) => n.type === "arduino_pin")
    // col=0 when no power column → x = PADDING (80)
    expect(pinNode!.x).toBe(80)
  })

  test("component column x = PADDING + col * 150 matching number of columns before it", () => {
    // With power + signal before component
    const components: Record<string, BoardComponent> = {
      arduino: makeArduino(),
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w5v: makeArduinoWire("w5v", -1, 5, 0),
      w13: makeArduinoWire("w13", 13, 7, 0),
    }
    const layout = generateSchematicLayout(components, wires)
    const compNode = layout.nodes.find((n) => n.id === "comp-led1")
    // col 0 = power, col 1 = signal, col 2 = component
    // x = 80 + 2 * 150 = 380
    expect(compNode!.x).toBe(380)
  })
})
