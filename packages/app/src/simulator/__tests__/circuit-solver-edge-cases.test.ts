import { describe, test, expect, mock, spyOn, beforeEach } from "bun:test"
import { analyzeCircuit } from "../circuit-solver"
import { getCapVoltage, resetAllCapVoltages } from "../capacitor-state"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"
import * as spicey from "spicey"

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

// ── Simulation crash recovery ─────────────────────────────────────────

describe("analyzeCircuit — simulation crash recovery", () => {
  test("when the transient solve throws, all components are marked inactive with isActive=false", () => {
    // Force a crash by mocking the transient solver to throw
    const simulateSpy = spyOn(spicey, "simulateTRAN").mockImplementation(() => {
      throw new Error("Singular matrix (real)")
    })

    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 5, 5),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 0, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)

    expect(result.isValid).toBe(false)
    expect(result.componentStates.size).toBe(2)

    for (const [, state] of result.componentStates) {
      expect(state.isActive).toBe(false)
      expect(state.current).toBe(0)
      expect(state.voltage).toBe(0)
      expect(state.brightness).toBe(0)
    }

    simulateSpy.mockRestore()
  })

  test("crash recovery still includes all component IDs in componentStates map", () => {
    const simulateSpy = spyOn(spicey, "simulateTRAN").mockImplementation(() => {
      throw new Error("Solver diverged")
    })

    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      led2: makeLed("led2", 8, 0, "#22c55e"),
      r1: makeResistor("r1", 3, 0),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())

    expect(result.componentStates.has("led1")).toBe(true)
    expect(result.componentStates.has("led2")).toBe(true)
    expect(result.componentStates.has("r1")).toBe(true)

    simulateSpy.mockRestore()
  })

  test("crash recovery returns the generated netlist (for debugging)", () => {
    const simulateSpy = spyOn(spicey, "simulateTRAN").mockImplementation(() => {
      throw new Error("Parse error")
    })

    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)

    // Netlist should be populated even after crash — useful for diagnostics
    expect(result.netlist.length).toBeGreaterThan(0)

    simulateSpy.mockRestore()
  })
})

// ── PWM voltage scaling ────────────────────────────────────────────────

describe("analyzeCircuit — PWM voltage scaling", () => {
  test("PWM via direct pin assignment on component.pins does NOT generate voltage source (vulnerability: wire required)", () => {
    // VULNERABILITY: When a component has `pins: { anode: 9 }` (direct pin assignment),
    // this does NOT create an Arduino net in the net resolver. The voltage source only
    // appears when the pin is connected via a physical wire (fromRow: -999, fromCol: 9).
    // This means components with pre-assigned pins won't respond to pin state changes.
    const components: Record<string, BoardComponent> = {
      led1: {
        id: "led1",
        type: "led",
        name: "LED",
        x: 0,
        y: 5,
        rotation: 0,
        pins: { anode: 9, cathode: null },
        properties: { color: "#ef4444" },
      },
    }

    const pinStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 128 },
    ])

    const result = analyzeCircuit(components, {}, pinStates)
    // BUG: No V_D9_ source is generated — the component.pins assignment is ignored
    // by the net resolver. A wire (fromRow: -999) is needed to inject the pin into a net.
    expect(result.netlist).not.toContain("V_D9_")
    // The LED sees only bleed resistors, not the Arduino pin voltage
    expect(result.netlist).toContain("R_bleed_float_")
  })

  test("PWM value 255 via wire results in 5V source in the netlist", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    // Wire from pin 9 to resistor left pin; GND to a different row
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 9, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 4, color: "black" },
    }
    const pinStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 255 },
    ])

    const result = analyzeCircuit(components, wires, pinStates)
    expect(result.netlist).toContain("V_D9_")
    // Voltage (255/255)*5 = 5 should appear
    const vLine = result.netlist.split("\n").find((l) => l.includes("V_D9_"))
    if (vLine) {
      expect(vLine).toContain("5")
    }
  })

  test("PWM value 128 via wire maps to ~2.51V (not 2.5V)", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }
    // Wire from pin 9 to resistor left pin; GND to a different row
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 9, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 4, color: "black" },
    }
    const pinStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 128 },
    ])

    const result = analyzeCircuit(components, wires, pinStates)
    const vLine = result.netlist.split("\n").find((l) => l.includes("V_D9_"))
    expect(vLine).toBeDefined()
    if (vLine) {
      const parts = vLine.trim().split(/\s+/)
      const voltageStr = parts[parts.length - 1]
      const voltage = parseFloat(voltageStr)
      // (128 / 255) * 5 = 2.5098039...
      expect(voltage).toBeCloseTo(2.5098, 3)
      // Importantly: it is NOT exactly 2.5
      expect(voltage).not.toBe(2.5)
    }
  })
})

// ── Empty board / no circuit components ──────────────────────────────

describe("analyzeCircuit — empty or board-only circuits", () => {
  test("empty components returns isValid=false and empty componentStates", () => {
    const result = analyzeCircuit({}, {}, createDefaultPinStates())
    expect(result.isValid).toBe(false)
    expect(result.componentStates.size).toBe(0)
    expect(result.netlist).toBe("")
  })

  test("only board-type components (arduino_uno) returns isValid=false", () => {
    const components: Record<string, BoardComponent> = {
      arduino: {
        id: "arduino",
        type: "arduino_uno",
        name: "Arduino",
        x: 0,
        y: 0,
        rotation: 0,
        pins: {},
        properties: {},
      },
    }
    const result = analyzeCircuit(components, {}, createDefaultPinStates())
    expect(result.isValid).toBe(false)
    expect(result.componentStates.size).toBe(0)
  })
})

// ── Open circuit detection ────────────────────────────────────────────

describe("analyzeCircuit — open circuit detection", () => {
  test("LED with voltage source but no ground path gets open_circuit warning", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    // Wire to pin 13 HIGH, but no GND connection
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)

    const openCircuitWarnings = result.warnings.filter(
      (w) => w.type === "open_circuit" && w.componentId === "led1",
    )
    expect(openCircuitWarnings.length).toBeGreaterThan(0)
  })

  test("LED with no connections at all gets no warnings (no voltage source present)", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())

    // With no voltage source at all, no open_circuit warning should fire
    const openCircuitWarnings = result.warnings.filter(
      (w) => w.type === "open_circuit",
    )
    expect(openCircuitWarnings.length).toBe(0)
  })
})

// ── no_resistor warning ────────────────────────────────────────────────

describe("analyzeCircuit — no_resistor warnings", () => {
  test("LED directly connected to pin 13 HIGH and GND gets no_resistor warning", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 0, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)
    const noResWarnings = result.warnings.filter(
      (w) => w.componentId === "led1" && w.type === "no_resistor",
    )
    expect(noResWarnings.length).toBeGreaterThan(0)
  })

  test("LED with series resistor does not get no_resistor warning", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0, 220),
      led1: makeLed("led1", 5, 7),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 3, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 7, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)
    const noResWarnings = result.warnings.filter(
      (w) => w.componentId === "led1" && w.type === "no_resistor",
    )
    expect(noResWarnings.length).toBe(0)
  })
})

// ── isValid reflects current flow ─────────────────────────────────────

describe("analyzeCircuit — isValid flag", () => {
  test("isValid is false when no component is active", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())
    expect(result.isValid).toBe(false)
  })

  test("isValid is true when an LED is active in a complete circuit", () => {
    // Use an LED (which has computeElectricalState and can report isActive=true).
    // Note: a bare resistor CANNOT set isValid=true — resistors fall back to the
    // generic state (isActive=false) because they have no computeElectricalState.
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0, 220),
      led1: makeLed("led1", 5, 7),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 3, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 7, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)
    expect(result.isValid).toBe(true)
  })

  test("isValid stays false for a resistor-only circuit even when powered (vulnerability: no computeElectricalState)", () => {
    // VULNERABILITY: Resistors fall back to the generic inactive state because
    // they have no computeElectricalState defined in the registry. This means
    // a valid powered resistor circuit reports isValid=false, and no current
    // paths are emitted even when current is flowing.
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0, 220),
    }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 4, color: "black" },
    }
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const result = analyzeCircuit(components, wires, pinStates)
    // BUG: A powered resistor circuit should be valid, but isValid reports false
    // because the generic fallback never sets isActive=true
    expect(result.isValid).toBe(false)
  })
})

// ── Multiple LEDs parallel ────────────────────────────────────────────

describe("analyzeCircuit — multiple components", () => {
  test("multiple isolated LEDs all receive component states", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      led2: makeLed("led2", 10, 0, "#22c55e"),
      led3: makeLed("led3", 15, 0, "#3b82f6"),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())

    expect(result.componentStates.has("led1")).toBe(true)
    expect(result.componentStates.has("led2")).toBe(true)
    expect(result.componentStates.has("led3")).toBe(true)
  })

  test("componentStates has componentId set correctly for each component", () => {
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      r1: makeResistor("r1", 10, 0),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())

    const ledState = result.componentStates.get("led1")
    const rState = result.componentStates.get("r1")

    expect(ledState?.componentId).toBe("led1")
    expect(rState?.componentId).toBe("r1")
  })
})

// ── Capacitor — real SPICE C element ─────────────────────────────────

function makeCapacitor(id: string, row: number, col: number, uF = 100): BoardComponent {
  return {
    id,
    type: "capacitor",
    name: `CAP ${id}`,
    x: col,
    y: row,
    rotation: 0,
    pins: { a: null, b: null },
    properties: { capacitance: uF },
  }
}

describe("analyzeCircuit — capacitor netlist element", () => {
  test("capacitor component has its state tracked in componentStates", () => {
    const result = analyzeCircuit(
      { cap1: makeCapacitor("cap1", 5, 0) },
      {},
      createDefaultPinStates(),
    )
    expect(result.componentStates.has("cap1")).toBe(true)
  })

  test("emits a real C element (not a voltage source) sized in microfarads", () => {
    const result = analyzeCircuit(
      { cap1: makeCapacitor("cap1", 5, 0, 100) },
      {},
      createDefaultPinStates(),
    )
    // A genuine capacitor element — `C_<id> nA nB 100u` — so spicey integrates
    // it as a real RC. The old implementation faked it as a `V_<id>` source.
    expect(result.netlist).toMatch(/\bC_cap1\b/)
    expect(result.netlist).toContain("100u")
    expect(result.netlist).not.toMatch(/\bV_cap1\b/)
  })
})

// ── Capacitor — RC charge / discharge physics ─────────────────────────
//
// Circuit: Arduino pin 13 ── cap+ (5,0) ; cap− (7,0) ── GND.
// The pin drives 5V through its 25Ω output resistance, so the cap charges
// with τ = 25Ω × 100µF = 2.5ms. We advance the solver in 1ms windows
// (capAdvanceSeconds) so charging spans several frames and the curve shape
// is observable. cap+ and cap− sit on different breadboard rows → different
// nets, so the element is a true two-node capacitor.

describe("analyzeCircuit — capacitor RC physics", () => {
  beforeEach(() => {
    resetAllCapVoltages()
  })

  const chargingCircuit = () => ({
    components: { cap1: makeCapacitor("cap1", 5, 0, 100) },
    wires: {
      wPwr: { id: "wPwr", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 7, toCol: 0, color: "black" },
    } as Record<string, Wire>,
  })

  const HIGH = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])
  const WINDOW = { capAdvanceSeconds: 0.001 }

  test("charges toward the supply over successive frames", () => {
    const { components, wires } = chargingCircuit()
    const v1 = analyzeCircuit(components, wires, HIGH, undefined, WINDOW)
      .componentStates.get("cap1")?.voltage ?? 0
    const v2 = analyzeCircuit(components, wires, HIGH, undefined, WINDOW)
      .componentStates.get("cap1")?.voltage ?? 0
    const v3 = analyzeCircuit(components, wires, HIGH, undefined, WINDOW)
      .componentStates.get("cap1")?.voltage ?? 0

    expect(v1).toBeGreaterThan(0)
    expect(v2).toBeGreaterThan(v1)
    expect(v3).toBeGreaterThan(v2)
    expect(v3).toBeLessThanOrEqual(5.01) // never overshoots the rail
  })

  test("charging curve is concave (exponential), NOT linear", () => {
    // The old linear-clamp model rose by a fixed step each frame. A real RC
    // charge rises fast then slows: each increment is smaller than the last.
    const { components, wires } = chargingCircuit()
    let prev = 0
    const increments: number[] = []
    for (let i = 0; i < 4; i++) {
      const v = analyzeCircuit(components, wires, HIGH, undefined, WINDOW)
        .componentStates.get("cap1")?.voltage ?? 0
      increments.push(v - prev)
      prev = v
    }
    expect(increments[0]).toBeGreaterThan(increments[1])
    expect(increments[1]).toBeGreaterThan(increments[2])
    expect(increments[2]).toBeGreaterThan(increments[3])
  })

  test("holds its charge when the supply is removed", () => {
    const { components, wires } = chargingCircuit()
    // Charge up with the pin HIGH.
    for (let i = 0; i < 8; i++) {
      analyzeCircuit(components, wires, HIGH, undefined, WINDOW)
    }
    const charged = getCapVoltage("cap1")
    expect(charged).toBeGreaterThan(3)

    // Pin goes high-impedance (UNSET): no source, no discharge path. The cap
    // should retain essentially all of its charge across a full 0.2s frame.
    const floating = makePinStates([{ pin: 13, mode: "UNSET" }])
    analyzeCircuit(components, wires, floating)
    expect(getCapVoltage("cap1")).toBeGreaterThan(charged * 0.95)
  })

  test("discharges through a path when the pin is pulled LOW", () => {
    const { components, wires } = chargingCircuit()
    for (let i = 0; i < 8; i++) {
      analyzeCircuit(components, wires, HIGH, undefined, WINDOW)
    }
    const charged = getCapVoltage("cap1")
    expect(charged).toBeGreaterThan(3)

    // Pin LOW drives cap+ to 0V through 25Ω → the cap discharges.
    const low = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 0 }])
    const d1 = analyzeCircuit(components, wires, low, undefined, WINDOW)
      .componentStates.get("cap1")?.voltage ?? 0
    const d2 = analyzeCircuit(components, wires, low, undefined, WINDOW)
      .componentStates.get("cap1")?.voltage ?? 0

    expect(d1).toBeLessThan(charged)
    expect(d2).toBeLessThan(d1)
  })
})

// ── Netlist structural properties ─────────────────────────────────────

describe("analyzeCircuit — netlist structure", () => {
  test("netlist is returned even for an unconnected single resistor", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())
    expect(result.netlist.length).toBeGreaterThan(0)
  })

  test("netlist contains .tran directive for transient analysis", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())
    expect(result.netlist).toContain(".tran")
  })

  test("component colors map to different DLED model names in netlist", () => {
    const components: Record<string, BoardComponent> = {
      ledRed: makeLed("ledRed", 5, 0, "#ff0000"),
      ledBlue: makeLed("ledBlue", 8, 0, "#0000ff"),
    }

    const result = analyzeCircuit(components, {}, createDefaultPinStates())
    expect(result.netlist).toContain("DLED_RED")
    expect(result.netlist).toContain("DLED_BLUE")
  })
})
