import { describe, test, expect } from "bun:test"
import { analyzeCircuit } from "../circuit-solver"
import { createDefaultPinStates } from "@dreamer/schemas"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"

// Series circuit: Arduino pin 13 (HIGH, 5V through 25Ω) → resistor → LED → GND.
// Mirrors the topology used by the "LED is active" edge-case test so we know
// current actually flows, then asserts the LED sits at a *physically real*
// forward voltage instead of the old ~0.74V (below any LED's turn-on knee).

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

function pinHigh(): PinState[] {
  const states = createDefaultPinStates()
  states[13] = { ...states[13], mode: "OUTPUT", digitalValue: 1 }
  return states
}

/** pin13 → R(5,0) → LED(5,7) → GND, returns the solved LED state. */
function solveLed(color: string) {
  const components: Record<string, BoardComponent> = {
    r1: makeResistor("r1", 5, 0, 220),
    led1: makeLed("led1", 5, 7, color),
  }
  const wires: Record<string, Wire> = {
    wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 3, color: "red" },
    wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 7, color: "black" },
  }
  const result = analyzeCircuit(components, wires, pinHigh())
  const led = result.componentStates.get("led1")
  if (!led) throw new Error("LED state missing")
  return led
}

/** pin13 → LED(5,0) → GND, no series resistor (overdriven). */
function solveLedNoResistor(color: string) {
  const components: Record<string, BoardComponent> = {
    led1: makeLed("led1", 5, 0, color),
  }
  const wires: Record<string, Wire> = {
    wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
    wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 0, color: "black" },
  }
  const result = analyzeCircuit(components, wires, pinHigh())
  const led = result.componentStates.get("led1")
  if (!led) throw new Error("LED state missing")
  return led
}

describe("LED forward voltage — real diode physics", () => {
  test("a red LED drops a realistic forward voltage (~1.6–2.2V), never the old ~0.74V", () => {
    const led = solveLed("#ef4444")
    // The bug reported a 0.74V drop at 17mA — impossible for a real LED.
    expect(led.voltage).toBeGreaterThan(1.5)
    expect(led.voltage).toBeLessThan(2.3)
  })

  test("the red LED conducts a sane current and lights up", () => {
    const led = solveLed("#ef4444")
    expect(led.isActive).toBe(true)
    expect(led.brightness).toBeGreaterThan(0)
    // With a 5V rail (−25Ω source) and 220Ω series R at ~1.8V drop → ~13mA.
    expect(led.current).toBeGreaterThan(3)
    expect(led.current).toBeLessThan(30)
  })

  test("blue drops more forward voltage than red (colors are distinguishable)", () => {
    // Previously every color collapsed to ~0.75V. Real blue LEDs (~3V) must sit
    // well above red (~1.8V).
    const red = solveLed("#ef4444")
    const blue = solveLed("#3b82f6")
    expect(blue.voltage).toBeGreaterThan(red.voltage + 0.5)
    expect(blue.voltage).toBeLessThan(3.4)
  })

  test("current is finite and bounded (no exp overflow)", () => {
    for (const color of ["#ef4444", "#22c55e", "#3b82f6"]) {
      const led = solveLed(color)
      expect(Number.isFinite(led.voltage)).toBe(true)
      expect(Number.isFinite(led.current)).toBe(true)
      expect(led.current).toBeLessThan(200)
    }
  })

  test("series resistance pushes forward voltage up when overdriven (Rs realism)", () => {
    // A real LED's Vf climbs with current because of its bulk resistance Rs.
    // Overdriving the same LED (no series R → much higher current) must show a
    // higher terminal voltage than the resistor-limited case — a bare
    // exponential diode would barely move.
    const limited = solveLed("#ef4444")
    const overdriven = solveLedNoResistor("#ef4444")
    expect(overdriven.current).toBeGreaterThan(limited.current + 20)
    expect(overdriven.voltage).toBeGreaterThan(limited.voltage + 0.3)
  })
})

describe("Arduino pin current limits (ATmega328P 20mA / 40mA)", () => {
  const seriesWires: Record<string, Wire> = {
    wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 3, color: "red" },
    wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 7, color: "black" },
  }
  const overcurrentFor = (warnings: ReturnType<typeof analyzeCircuit>["warnings"], id: string) =>
    warnings.filter((w) => w.componentId === id && w.type === "overcurrent")

  test("a properly resistored LED (~13mA) does not trip the pin limit", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0, 220),
      led1: makeLed("led1", 5, 7),
    }
    const result = analyzeCircuit(components, seriesWires, pinHigh())
    expect(result.warnings.filter((w) => w.type === "overcurrent").length).toBe(0)
  })

  test("a small 100Ω resistor (~24mA) trips the recommended limit, not absolute max", () => {
    const components: Record<string, BoardComponent> = {
      r1: makeResistor("r1", 5, 0, 100),
      led1: makeLed("led1", 5, 7),
    }
    const result = analyzeCircuit(components, seriesWires, pinHigh())
    // In a series circuit the pin warning lands on the component wired to the
    // pin node (here the resistor), so match by type, not a specific id.
    const oc = result.warnings.filter((w) => w.type === "overcurrent")
    expect(oc.length).toBeGreaterThan(0)
    expect(oc[0].message).toContain("recommended")
    expect(oc[0].message).not.toContain("absolute max")
  })

  test("a direct LED (>40mA) trips the absolute-max warning naming the pin", () => {
    const components: Record<string, BoardComponent> = { led1: makeLed("led1", 5, 0) }
    const wires: Record<string, Wire> = {
      wPin: { id: "wPin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wGnd: { id: "wGnd", fromRow: -999, fromCol: -3, toRow: 6, toCol: 0, color: "black" },
    }
    const result = analyzeCircuit(components, wires, pinHigh())
    const oc = overcurrentFor(result.warnings, "led1")
    expect(oc.length).toBeGreaterThan(0)
    expect(oc[0].message).toContain("D13")
    expect(oc[0].message).toContain("absolute max")
  })

  test("aggregates current across the pin: two direct LEDs are both flagged", () => {
    // Each LED alone might be borderline, but the pin carries their sum — the
    // per-pin (not per-component) check is what catches this.
    const components: Record<string, BoardComponent> = {
      led1: makeLed("led1", 5, 0),
      led2: makeLed("led2", 8, 0),
    }
    const wires: Record<string, Wire> = {
      wPin1: { id: "wPin1", fromRow: -999, fromCol: 13, toRow: 5, toCol: 0, color: "red" },
      wPin2: { id: "wPin2", fromRow: -999, fromCol: 13, toRow: 8, toCol: 0, color: "red" },
      wGnd1: { id: "wGnd1", fromRow: -999, fromCol: -3, toRow: 6, toCol: 0, color: "black" },
      wGnd2: { id: "wGnd2", fromRow: -999, fromCol: -3, toRow: 9, toCol: 0, color: "black" },
    }
    const result = analyzeCircuit(components, wires, pinHigh())
    const flagged = new Set(
      result.warnings.filter((w) => w.type === "overcurrent").map((w) => w.componentId),
    )
    expect(flagged.has("led1")).toBe(true)
    expect(flagged.has("led2")).toBe(true)
  })
})
