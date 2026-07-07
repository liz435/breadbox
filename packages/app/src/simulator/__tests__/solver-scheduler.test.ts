// ── SolverScheduler tests (ROADMAP Phase B) ────────────────────────────────
//
// The scheduler's contract: pay the MCU-clock deficit in bounded chunks
// inside a wall budget, never silently drop time, raise the lockstep
// throttle when behind, and report an honest realtime factor.

import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"
import { SolverScheduler } from "../solver-scheduler"
import { TransientSession } from "../transient-session"

function makePinStates(
  overrides: Array<{ pin: number } & Partial<PinState>> = [],
): PinState[] {
  const states = createDefaultPinStates()
  for (const o of overrides) states[o.pin] = { ...states[o.pin], ...o }
  return states
}

function makeWire(id: string, fromRow: number, fromCol: number, toRow: number, toCol: number): Wire {
  return { id, fromRow, fromCol, toRow, toCol, color: "#22c55e" }
}

/** RC board reused from the session tests: D13 → 1kΩ → 100 µF → GND. */
function rcBoard(): { components: Record<string, BoardComponent>; wires: Record<string, Wire> } {
  const components: Record<string, BoardComponent> = {
    r1: {
      id: "r1", type: "resistor", name: "r1", x: 0, y: 5, rotation: 0,
      pins: { a: null, b: null }, properties: { resistance: 1000 },
    },
    c1: {
      id: "c1", type: "capacitor", name: "c1", x: 6, y: 6, rotation: 0,
      pins: { positive: null, negative: null }, properties: { capacitance: 100 },
    },
  }
  const wires: Record<string, Wire> = {
    wPin: makeWire("wPin", -999, 13, 5, 3),
    wRC: makeWire("wRC", 5, 6, 6, 6),
    wGnd: makeWire("wGnd", -999, -3, 8, 6),
  }
  return { components, wires }
}

/** A controllable wall clock: each nowMs() call advances by `perCall` ms. */
function fakeClock(perCall: number): () => number {
  let t = 0
  return () => {
    t += perCall
    return t
  }
}

describe("SolverScheduler", () => {
  test("keeps up with a small deficit and reports factor ≈ 1", () => {
    const scheduler = new SolverScheduler(new TransientSession(), {
      budgetMs: 50,
      nowMs: fakeClock(0.01),
    })
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    let mcuTime = 0
    for (let i = 0; i < 10; i++) {
      mcuTime += 0.016
      const tick = scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: mcuTime })
      expect(tick.lagSeconds).toBeLessThan(0.001)
      expect(tick.throttleMcu).toBe(false)
    }
    expect(scheduler.realtimeFactor).toBeGreaterThan(0.95)
  })

  test("exhausted budget leaves a deficit and raises the throttle", () => {
    // A clock that burns 10 ms per query blows the 6 ms budget after the
    // mandatory first step, so a large MCU jump can't be paid in one tick.
    const scheduler = new SolverScheduler(new TransientSession(), {
      budgetMs: 6,
      chunkSeconds: 0.02,
      maxLagSeconds: 0.05,
      nowMs: fakeClock(10),
    })
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const tick = scheduler.tick({
      components,
      wires,
      pinStates,
      mcuTimeSeconds: 0.5, // half a second owed at once
    })
    expect(tick.lagSeconds).toBeGreaterThan(0.05)
    expect(tick.throttleMcu).toBe(true)
    // The EMA moves 30% per tick — after one starved tick it has dipped
    // below 1 and keeps falling while the deficit persists.
    expect(scheduler.realtimeFactor).toBeLessThan(0.8)
  })

  test("deficit is repaid across later ticks (time is never dropped)", () => {
    const scheduler = new SolverScheduler(new TransientSession(), {
      budgetMs: 6,
      chunkSeconds: 0.02,
      maxLagSeconds: 0.05,
      nowMs: fakeClock(10), // still slow: ~1 chunk per tick
    })
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    let tick = scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: 0.1 })
    const firstLag = tick.lagSeconds
    expect(firstLag).toBeGreaterThan(0)

    // MCU frozen (throttled) — the scheduler keeps paying down the deficit.
    for (let i = 0; i < 10 && tick.lagSeconds > 0; i++) {
      tick = scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: 0.1 })
    }
    expect(tick.lagSeconds).toBeLessThan(firstLag)
    expect(tick.lagSeconds).toBeLessThan(0.001)
    expect(tick.throttleMcu).toBe(false)
  })

  test("physics is identical through the scheduler (RC charge at τ)", () => {
    const scheduler = new SolverScheduler(new TransientSession(), {
      budgetMs: 100,
      nowMs: fakeClock(0.01),
    })
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    const tau = (1000 + 25) * 100e-6
    let mcuTime = 0
    let analysis = scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: 0 }).analysis
    while (mcuTime < tau) {
      mcuTime += 0.01
      analysis = scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: mcuTime }).analysis
    }
    const cap = analysis.componentStates.get("c1")
    expect(cap).toBeDefined()
    const analytic = 5 * (1 - Math.exp(-mcuTime / tau))
    expect(Math.abs(Math.abs(cap!.voltage) - analytic) / analytic).toBeLessThan(0.06)
  })

  test("reset drops circuit state and clock anchoring", () => {
    const scheduler = new SolverScheduler(new TransientSession(), {
      budgetMs: 100,
      nowMs: fakeClock(0.01),
    })
    const { components, wires } = rcBoard()
    const pinStates = makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }])

    scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: 0.5 })
    scheduler.reset()
    const tick = scheduler.tick({ components, wires, pinStates, mcuTimeSeconds: 0.0001 })
    const cap = tick.analysis.componentStates.get("c1")
    expect(Math.abs(cap!.voltage)).toBeLessThan(0.5)
  })
})
