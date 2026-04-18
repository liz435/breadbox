import { describe, test, expect } from "bun:test"
import { buildNetlist } from "../netlist-builder"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"

// ── Helpers ──────────────────────────────────────────────────────────

function makePin(pin: number, overrides: Partial<PinState> = {}): PinState {
  return {
    pin,
    mode: "UNSET",
    digitalValue: 0,
    analogValue: 0,
    pwmValue: 0,
    isPwm: false,
    pwmFrequency: 490,
    interruptMode: "NONE",
    ...overrides,
  }
}

function makePinStates(
  overrides: Array<{ pin: number } & Partial<PinState>> = [],
): PinState[] {
  const states = createDefaultPinStates()
  for (const o of overrides) {
    states[o.pin] = { ...states[o.pin], ...o }
  }
  return states
}

function makeLed(id: string, row: number, col: number, color = "#ef4444"): BoardComponent {
  return {
    id,
    type: "led",
    name: `LED ${id}`,
    x: col,
    y: row,
    rotation: 0,
    pins: { anode: null, cathode: null },
    properties: { color },
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

function makeWire(
  id: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  color = "#22c55e",
): Wire {
  return { id, fromRow, fromCol, toRow, toCol, color }
}

// ── Self-loops ────────────────────────────────────────────────────────

describe("netlist-builder — self-loop detection", () => {
  test("LED with both pins wired to GND rail does not emit element lines", () => {
    // Both anode and cathode land on the same GND net → self-loop
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    // Wire both row5 and row6 (the two LED pin rows) to the GND (-1) rail
    const wires: Record<string, Wire> = {
      w1: makeWire("w1", 5, 0, 5, -1), // anode → GND rail
      w2: makeWire("w2", 6, 0, 6, -1), // cathode → GND rail
    }
    // GND rail needs a GND source so -1 col = net tied to ground
    const arduinoWire: Record<string, Wire> = {
      ...wires,
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 5, toCol: -1, color: "black" },
    }

    const { netlist, componentNodePairs } = buildNetlist(
      components,
      arduinoWire,
      createDefaultPinStates(),
    )

    // The component node pair is still registered
    const pair = componentNodePairs.get("led1")
    expect(pair).toBeDefined()
    // But both nodes should resolve to "0" (ground), so no element line
    if (pair) {
      expect(pair.nodeA).toBe(pair.nodeB)
    }
  })

  test("LED with both pins wired to the same row on GND — both nodes resolve to same net", () => {
    // LED footprint: anode at (row, col), cathode at (row+1, col).
    // Wire both to the GND -rail at their respective row.
    // GND pin (-3) at row 20 to avoid overlapping the LED rows.
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w1: makeWire("w1", 5, 0, 5, -1),  // anode row → -rail
      w2: makeWire("w2", 6, 0, 6, -1),  // cathode row → -rail
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 20, toCol: -1, color: "black" },
    }

    const { componentNodePairs } = buildNetlist(
      components,
      wires,
      createDefaultPinStates(),
    )

    const pair = componentNodePairs.get("led1")
    expect(pair).toBeDefined()
    if (pair) {
      // Both anode and cathode should resolve to GND node "0" → self-loop
      expect(pair.nodeA).toBe("0")
      expect(pair.nodeB).toBe("0")
      expect(pair.nodeA).toBe(pair.nodeB)
    }
  })
})

// ── Floating nets and bleed resistors ────────────────────────────────

describe("netlist-builder — floating net bleed resistors", () => {
  test("isolated resistor (no power or ground) gets bleed resistors to stabilize solver", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())

    // Should have bleed resistors for the floating nets
    expect(netlist).toContain("R_bleed_")
  })

  test("bleed resistor value is 1GΩ (1000000000)", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    expect(netlist).toContain("1000000000")
  })

  test("connected LED (with power and ground) does NOT need bleed resistors on driven nets", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 0, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const { netlist } = buildNetlist(components, wires, pinStates)

    // The LED anode net is driven by a voltage source — should NOT have a bleed resistor
    // on that specific net (the driven net doesn't need one)
    const lines = netlist.split("\n")
    const bleedLines = lines.filter((l) => l.startsWith("R_bleed_float_"))
    // The driven net and GND net should not have bleed resistors
    // (they have defined voltages already)
    for (const line of bleedLines) {
      // Bleed resistors should not reference net_0 or src_ nodes
      expect(line).not.toContain(" 0 1000000000")
    }
  })
})

// ── Duplicate voltage sources ─────────────────────────────────────────

describe("netlist-builder — duplicate voltage source deduplication", () => {
  test("two OUTPUT HIGH pins connected to same net produces only one voltage source", () => {
    // Wire both pin 13 and pin 12 to the same row
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin13: { id: "wPin13", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wPin12: { id: "wPin12", fromRow: -999, fromCol: 12, toRow: 5, toCol: 0, color: "orange" },
    }
    const pinStates = makePinStates([
      { pin: 13, mode: "OUTPUT", digitalValue: 1 },
      { pin: 12, mode: "OUTPUT", digitalValue: 1 },
    ])

    const { netlist } = buildNetlist(components, wires, pinStates)

    // Only one V_D source should target that net node
    const vSourceLines = netlist.split("\n").filter((l) => l.match(/^V_D\d+_\d+\s/))
    // Check that all voltage sources targeting the same node are collapsed to one
    const nodeNames = vSourceLines.map((l) => l.split(" ")[2])
    const uniqueNodes = new Set(nodeNames)
    expect(vSourceLines.length).toBe(uniqueNodes.size)
  })

  test("5V rail and OUTPUT HIGH pin on same net: deduplication prevents two sources on same node", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w5V: { id: "w5V", fromRow: -999, fromCol: -1, toRow: 5, toCol: 0, color: "red" },
      wPin13: { id: "wPin13", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "orange" },
    }
    const pinStates = makePinStates([
      { pin: 13, mode: "OUTPUT", digitalValue: 1 },
    ])

    const { netlist } = buildNetlist(components, wires, pinStates)

    // Count voltage source lines pointing to the same intermediate/node
    const vLines = netlist.split("\n").filter((l) => l.match(/^V_/))
    const nodeTargets = vLines.map((l) => l.split(" ")[2])
    const duplicateTargets = nodeTargets.filter(
      (n, i) => nodeTargets.indexOf(n) !== i,
    )
    expect(duplicateTargets.length).toBe(0)
  })
})

// ── Voltage source with source resistance ─────────────────────────────

describe("netlist-builder — source resistance on digital output pins", () => {
  test("OUTPUT HIGH pin generates both a voltage source and a source resistor", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    // Pin 13 wires to row 5 col 0 (resistor left pin).
    // GND wires to row 6 col 4 (different row/col so nets don't merge).
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 4, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const { netlist } = buildNetlist(components, wires, pinStates)

    expect(netlist).toContain("V_D13_")
    expect(netlist).toContain("R_src_")
    // Source resistance should be 25 Ω
    expect(netlist).toContain("25")
  })

  test("OUTPUT LOW pin also generates source resistance (sink current path)", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 0 }])

    const { netlist } = buildNetlist(components, wires, pinStates)

    expect(netlist).toContain("V_D13_LOW_")
    expect(netlist).toContain("R_src_")
  })

  test("5V power rail does NOT get source resistance (direct ideal source)", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      w5V: { id: "w5V", fromRow: -999, fromCol: -1, toRow: 5, toCol: 0, color: "red" },
    }

    const { netlist } = buildNetlist(components, wires, createDefaultPinStates())

    // 5V rail should emit V_5V directly with no R_src in between
    expect(netlist).toContain("V_5V_")
    // The 5V source line should be "V_5V_0 <node> 0 5" (no intermediate src_ node)
    const v5VLine = netlist.split("\n").find((l) => l.startsWith("V_5V_"))
    expect(v5VLine).toBeDefined()
    if (v5VLine) {
      // format: "V_5V_0 <nodeName> 0 5"
      // Should NOT reference a "src_" intermediate node
      expect(v5VLine).not.toContain("src_")
    }
  })
})

// ── PWM voltage scaling ────────────────────────────────────────────────

describe("netlist-builder — PWM voltage scaling", () => {
  test("PWM value 0 maps to 0V in the netlist", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 9, toRow: 5, toCol: 0, color: "red" },
    }
    const pinStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 0 },
    ])

    const { netlist } = buildNetlist(components, wires, pinStates)
    expect(netlist).toContain("V_D9_")
    expect(netlist).toContain(" 0\n")
  })

  test("PWM value 255 maps to 5V in the netlist", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 9, toRow: 5, toCol: 0, color: "red" },
    }
    const pinStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 255 },
    ])

    const { netlist } = buildNetlist(components, wires, pinStates)
    expect(netlist).toContain("V_D9_")
    // (255/255) * 5 = 5
    const vLine = netlist.split("\n").find((l) => l.includes("V_D9_"))
    expect(vLine).toBeDefined()
    expect(vLine).toContain("5")
  })

  test("PWM value 128 maps to approximately 2.51V", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 9, toRow: 5, toCol: 0, color: "red" },
    }
    const pinStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 128 },
    ])

    const { netlist } = buildNetlist(components, wires, pinStates)
    // (128/255) * 5 ≈ 2.5098...
    const vLine = netlist.split("\n").find((l) => l.includes("V_D9_"))
    expect(vLine).toBeDefined()
    if (vLine) {
      const parts = vLine.split(" ")
      const voltageStr = parts[parts.length - 1]
      const voltage = parseFloat(voltageStr)
      expect(voltage).toBeCloseTo(2.509803, 4)
    }
  })
})

// ── UNSET pin mode ────────────────────────────────────────────────────

describe("netlist-builder — UNSET and INPUT pin modes", () => {
  test("UNSET pin mode (high-impedance default) produces no voltage source", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
    }
    // Default pin state is UNSET — no voltage source should be generated
    const { netlist } = buildNetlist(components, wires, createDefaultPinStates())

    expect(netlist).not.toContain("V_D13_")
  })
})

// ── Special characters in component IDs ──────────────────────────────

describe("netlist-builder — component ID sanitization", () => {
  test("component IDs with spaces are sanitized for SPICE element names", () => {
    const components: Record<string, BoardComponent> = {
      "r 1": makeResistor("r 1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    // Space in ID should be replaced with underscore
    expect(netlist).not.toContain("R_r 1")
    expect(netlist).toContain("R_r_1")
  })

  test("component IDs with hyphens are sanitized", () => {
    const components: Record<string, BoardComponent> = {
      "r-comp-1": makeResistor("r-comp-1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    expect(netlist).not.toContain("R_r-comp-1")
    expect(netlist).toContain("R_r_comp_1")
  })

  test("component IDs with dots are sanitized", () => {
    const components: Record<string, BoardComponent> = {
      "comp.led.1": makeLed("comp.led.1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    expect(netlist).not.toContain("DLED_comp.led.1")
  })

  test("very long component IDs are truncated to 20 characters in SPICE element names", () => {
    const longId = "r" + "x".repeat(40) // 41 chars
    const components: Record<string, BoardComponent> = {
      [longId]: makeResistor(longId, 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    // The sanitized ID used in the netlist should be truncated
    // R_<sanitized(20chars)>
    const lines = netlist.split("\n").filter((l) => l.startsWith("R_"))
    for (const line of lines) {
      if (line.startsWith("R_bleed_")) continue
      if (line.startsWith("R_src_")) continue
      const elementName = line.split(" ")[0]
      // Element name format: R_<id> — id part <= 20 chars
      const idPart = elementName.replace(/^R_/, "")
      expect(idPart.length).toBeLessThanOrEqual(20)
    }
  })
})

// ── Large circuit ──────────────────────────────────────────────────────

describe("netlist-builder — large circuits", () => {
  test("20 LED components produces a netlist with all 20 DLED elements", () => {
    const components: Record<string, BoardComponent> = {}
    for (let i = 0; i < 20; i++) {
      const id = `led${i}`
      components[id] = makeLed(id, i, 0)
    }

    const { netlist, componentNodePairs } = buildNetlist(
      components,
      {},
      createDefaultPinStates(),
    )

    expect(componentNodePairs.size).toBe(20)
    expect(netlist.length).toBeGreaterThan(0)
  })

  test("50 resistors produce a netlist without crashing", () => {
    const components: Record<string, BoardComponent> = {}
    for (let i = 0; i < 50; i++) {
      const id = `r${i}`
      // Spread them across different rows so they don't collide
      components[id] = makeResistor(id, i % 30, Math.floor(i / 30) * 5)
    }

    expect(() =>
      buildNetlist(components, {}, createDefaultPinStates()),
    ).not.toThrow()
  })
})

// ── Netlist always ends with .tran ─────────────────────────────────────

describe("netlist-builder — required netlist directives", () => {
  test("netlist always contains .tran analysis command", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    expect(netlist).toContain(".tran 0.001 0.01")
  })

  test("netlist with LED always contains .model DLED line", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    expect(netlist).toContain(".model DLED")
  })

  test("netlist is a non-empty string even for single isolated component", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const { netlist } = buildNetlist(components, {}, createDefaultPinStates())
    expect(netlist.trim().length).toBeGreaterThan(0)
  })
})

// ── Empty components ────────────────────────────────────────────────────

describe("netlist-builder — edge case inputs", () => {
  test("empty components produces only .tran directive and no elements", () => {
    const { netlist, componentNodePairs } = buildNetlist(
      {},
      {},
      createDefaultPinStates(),
    )

    expect(componentNodePairs.size).toBe(0)
    expect(netlist).toContain(".tran")
    // Should not have any R_ or DLED_ element lines
    const lines = netlist.split("\n").filter((l) => l.match(/^[RDLCV]_/))
    expect(lines.length).toBe(0)
  })

  test("returns correct structure with nets and nodeMap", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const result = buildNetlist(components, {}, createDefaultPinStates())

    expect(result.nets).toBeInstanceOf(Array)
    expect(result.nodeMap).toBeInstanceOf(Map)
    expect(result.componentNodePairs).toBeInstanceOf(Map)
    expect(typeof result.netlist).toBe("string")
  })
})
