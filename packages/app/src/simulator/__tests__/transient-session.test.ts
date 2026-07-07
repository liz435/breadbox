// ── TransientSession physics tests (ROADMAP Phase A) ───────────────────────
//
// These are the "regression tests, not vibes" the roadmap's risk register
// calls for: RC charge curves must match the analytical exponential, PWM
// must behave as a real square wave (not a duty-averaged DC level), and
// inductors must reach their analytical steady-state current.

import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"
import { TransientSession } from "../transient-session"
import { analyzeCircuitTransient } from "../circuit-solver"

// ── Helpers ────────────────────────────────────────────────────────────────

function makePinStates(
  overrides: Array<{ pin: number } & Partial<PinState>> = [],
): PinState[] {
  const states = createDefaultPinStates()
  for (const o of overrides) states[o.pin] = { ...states[o.pin], ...o }
  return states
}

function makeWire(
  id: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): Wire {
  return { id, fromRow, fromCol, toRow, toCol, color: "#22c55e" }
}

function makeResistor(id: string, row: number, resistance: number): BoardComponent {
  return {
    id,
    type: "resistor",
    name: id,
    x: 0,
    y: row,
    rotation: 0,
    pins: { a: null, b: null },
    properties: { resistance },
  }
}

function makeCapacitor(id: string, row: number, col: number, microfarads: number): BoardComponent {
  return {
    id,
    type: "capacitor",
    name: id,
    x: col,
    y: row,
    rotation: 0,
    pins: { positive: null, negative: null },
    properties: { capacitance: microfarads },
  }
}

function makeInductor(id: string, row: number, col: number, millihenries: number): BoardComponent {
  return {
    id,
    type: "inductor",
    name: id,
    x: col,
    y: row,
    rotation: 0,
    pins: { a: null, b: null },
    properties: { inductance: millihenries },
  }
}

function makeLed(id: string, row: number, col: number): BoardComponent {
  return {
    id,
    type: "led",
    name: id,
    x: col,
    y: row,
    rotation: 0,
    pins: { anode: null, cathode: null },
    properties: { color: "#ef4444" },
  }
}

/**
 * RC board: pin 13 → R (1 kΩ) → C (100 µF) → GND.
 * Resistor footprint is fixed at cols 3/6 on its row; capacitor pins sit at
 * (row, col) and (row+2, col).
 */
function rcBoard(): { components: Record<string, BoardComponent>; wires: Record<string, Wire> } {
  const components = {
    r1: makeResistor("r1", 5, 1000),
    c1: makeCapacitor("c1", 6, 6, 100),
  }
  const wires = {
    wPin: makeWire("wPin", -999, 13, 5, 3), // D13 → resistor a
    wRC: makeWire("wRC", 5, 6, 6, 6), // resistor b → cap positive
    wGnd: makeWire("wGnd", -999, -3, 8, 6), // cap negative → GND
  }
  return { components, wires }
}

// pin drive: 25 Ω output resistance in series with the 1 kΩ resistor.
const RC_TAU_SECONDS = (1000 + 25) * 100e-6 // ≈ 0.1025 s

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TransientSession — RC physics", () => {
  test("capacitor charge follows the analytical exponential within 5%", () => {
    const session = new TransientSession()
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    // Advance to exactly one time constant in 10 ms sim chunks.
    const chunk = 0.01
    const steps = Math.round(RC_TAU_SECONDS / chunk)
    let last: ReturnType<TransientSession["step"]> | null = null
    for (let i = 0; i < steps; i++) {
      last = session.step({ components, wires, pinStates, dtSimSeconds: chunk })
      expect(last.advancedSeconds).toBeCloseTo(chunk, 6)
    }
    if (!last) throw new Error("no step ran")

    const capV = capVoltage(last)
    const analytic = 5 * (1 - Math.exp(-(steps * chunk) / RC_TAU_SECONDS))
    expect(Math.abs(capV - analytic) / analytic).toBeLessThan(0.05)
  })

  test("after 5τ the capacitor is fully charged to the rail", () => {
    const session = new TransientSession()
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    for (let t = 0; t < 5 * RC_TAU_SECONDS; t += 0.02) {
      session.step({ components, wires, pinStates, dtSimSeconds: 0.02 })
    }
    const last = session.step({ components, wires, pinStates, dtSimSeconds: 0.01 })
    expect(capVoltage(last)).toBeGreaterThan(4.9)
  })

  test("discharge: charged cap decays toward 0 when the pin goes LOW", () => {
    const session = new TransientSession()
    const { components, wires } = rcBoard()
    const high = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])
    const low = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 0 }])

    for (let t = 0; t < 5 * RC_TAU_SECONDS; t += 0.02) {
      session.step({ components, wires, pinStates: high, dtSimSeconds: 0.02 })
    }
    // Pin flips LOW — same topology, so the session must NOT re-parse (and
    // must keep the cap's charge), then discharge through the same R.
    let last = session.step({ components, wires, pinStates: low, dtSimSeconds: 0.001 })
    const startV = capVoltage(last)
    expect(startV).toBeGreaterThan(4.5)

    for (let t = 0; t < RC_TAU_SECONDS; t += 0.01) {
      last = session.step({ components, wires, pinStates: low, dtSimSeconds: 0.01 })
    }
    const analytic = startV * Math.exp(-1)
    const capNow = capVoltage(last)
    expect(Math.abs(capNow - analytic) / analytic).toBeLessThan(0.08)
  })

  test("topology change mid-run preserves capacitor state", () => {
    const session = new TransientSession()
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    for (let t = 0; t < RC_TAU_SECONDS; t += 0.01) {
      session.step({ components, wires, pinStates, dtSimSeconds: 0.01 })
    }
    const before = capVoltage(
      session.step({ components, wires, pinStates, dtSimSeconds: 0.001 }),
    )

    // Drop an unrelated resistor on a far-away row → netlist topology changes
    // → re-parse + state migration.
    const withExtra = { ...components, r2: makeResistor("r2", 20, 470) }
    const after = capVoltage(
      session.step({ components: withExtra, wires, pinStates, dtSimSeconds: 0.001 }),
    )
    expect(Math.abs(after - before)).toBeLessThan(0.1)
  })

  test("reset clears charge", () => {
    const session = new TransientSession()
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])
    for (let t = 0; t < RC_TAU_SECONDS; t += 0.01) {
      session.step({ components, wires, pinStates, dtSimSeconds: 0.01 })
    }
    session.reset()
    const fresh = session.step({ components, wires, pinStates, dtSimSeconds: 0.0001 })
    expect(capVoltage(fresh)).toBeLessThan(0.5)
  })
})

describe("TransientSession — PWM square wave", () => {
  test("LED under 50% PWM carries ~half its full-on current (not the duty-averaged-DC current)", () => {
    // Pin 9 → R 220 Ω → LED → GND. Full-on current at 5 V is ~12 mA; the
    // duty-averaged-DC fallback at 2.5 V would push far less than half that
    // through the exponential diode. A real square wave gives ≈ duty × I_on.
    const components = {
      r1: makeResistor("r1", 5, 220),
      led1: makeLed("led1", 6, 6),
    }
    const wires = {
      wPin: makeWire("wPin", -999, 9, 5, 3),
      wRL: makeWire("wRL", 5, 6, 6, 6),
      wGnd: makeWire("wGnd", -999, -3, 7, 6),
    }

    // Reference: solid HIGH.
    const highSession = new TransientSession()
    const highStates = makePinStates([{ pin: 9, mode: "OUTPUT", digitalValue: 1 }])
    const solid = highSession.step({
      components,
      wires,
      pinStates: highStates,
      dtSimSeconds: 0.01,
    })
    const iOn = Math.abs(solid.getElementCurrent("D_led1")) * 1000
    expect(iOn).toBeGreaterThan(5) // sanity: LED is truly on

    // PWM 50%: average current over the last full period.
    const pwmSession = new TransientSession()
    const pwmStates = makePinStates([
      { pin: 9, mode: "OUTPUT", isPwm: true, pwmValue: 128 },
    ])
    // Advance a few PWM periods (490 Hz → ~2 ms each).
    let last: ReturnType<TransientSession["step"]> | null = null
    for (let i = 0; i < 5; i++) {
      last = pwmSession.step({ components, wires, pinStates: pwmStates, dtSimSeconds: 0.004 })
    }
    if (!last) throw new Error("no step ran")
    const iPwm = Math.abs(last.getElementCurrent("D_led1")) * 1000

    const duty = 128 / 255
    // Physically correct: iPwm ≈ duty × iOn. The duty-averaged-DC failure
    // mode gives a tiny fraction of iOn — well below the 0.35 floor.
    expect(iPwm / iOn).toBeGreaterThan(duty * 0.75)
    expect(iPwm / iOn).toBeLessThan(duty * 1.25)
  })
})

describe("TransientSession — inductor", () => {
  test("RL circuit reaches analytical steady-state current", () => {
    // 5V rail → R 100 Ω → L 10 mH → GND. Steady state: I = 5 / (100 + 0.5).
    const components = {
      r1: makeResistor("r1", 5, 100),
      l1: makeInductor("l1", 6, 6, 10),
    }
    const wires = {
      w5v: makeWire("w5v", -999, -1, 5, 3), // 5V rail → resistor a
      wRL: makeWire("wRL", 5, 6, 6, 6), // resistor b → inductor a
      wGnd: makeWire("wGnd", -999, -3, 7, 6), // inductor b → GND
    }
    const pinStates = makePinStates()

    const session = new TransientSession()
    // τ = L/R = 0.1 ms → 10 ms is 100τ, decidedly steady.
    let last: ReturnType<TransientSession["step"]> | null = null
    for (let i = 0; i < 5; i++) {
      last = session.step({ components, wires, pinStates, dtSimSeconds: 0.002 })
    }
    if (!last) throw new Error("no step ran")
    const iSteady = Math.abs(last.getElementCurrent("L_l1")) * 1000
    const analytic = (5 / (100 + 0.5)) * 1000 // mA
    expect(Math.abs(iSteady - analytic) / analytic).toBeLessThan(0.05)
  })
})

describe("analyzeCircuitTransient — full path", () => {
  test("reports capacitor state and stays valid across steps", () => {
    const session = new TransientSession()
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    let analysis = analyzeCircuitTransient(components, wires, pinStates, undefined, {
      dtSimSeconds: 0.05,
      session,
    })
    expect(analysis.netlist).toContain("C_c1")
    expect(analysis.advancedSeconds).toBeGreaterThan(0)

    for (let i = 0; i < 10; i++) {
      analysis = analyzeCircuitTransient(components, wires, pinStates, undefined, {
        dtSimSeconds: 0.05,
        session,
      })
    }
    const cap = analysis.componentStates.get("c1")
    expect(cap).toBeDefined()
    // 0.55 s ≈ 5.4τ — fully charged, and reported through componentStates.
    expect(Math.abs(cap!.voltage)).toBeGreaterThan(4.5)
  })

  test("empty board returns invalid analysis", () => {
    const result = analyzeCircuitTransient({}, {}, createDefaultPinStates(), undefined, {
      dtSimSeconds: 0.01,
      session: new TransientSession(),
    })
    expect(result.isValid).toBe(false)
  })
})

// ── Readout helper ─────────────────────────────────────────────────────────

function capVoltage(step: ReturnType<TransientSession["step"]>): number {
  const pair = step.build.componentNodePairs.get("c1")
  if (!pair) throw new Error("capacitor not in netlist")
  return Math.abs(step.getNodeVoltage(pair.nodeA) - step.getNodeVoltage(pair.nodeB))
}
