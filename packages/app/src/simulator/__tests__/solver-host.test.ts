// ── SolverHost tests (ROADMAP Phase B follow-up: worker isolation) ─────────

import { describe, test, expect } from "bun:test"
import type { BoardComponent, Wire, PinState } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"
import { SolverScheduler } from "../solver-scheduler"
import { TransientSession } from "../transient-session"
import {
  InlineSolverHost,
  WorkerSolverHost,
  toAnalysisDto,
  reviveAnalysis,
  type SolverHostTickInput,
} from "../solver-host"

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

/** RC board (D13 → 1 kΩ → 100 µF → GND), same fixture as the session tests. */
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

function tickInput(mcuTimeSeconds: number): SolverHostTickInput {
  const { components, wires } = rcBoard()
  return {
    components,
    wires,
    pinStates: makePinStates([{ pin: 13, mode: "OUTPUT", digitalValue: 1 }]),
    mcuTimeSeconds,
  }
}

describe("analysis DTO round-trip", () => {
  test("states, warnings, and node voltages survive serialization", () => {
    const scheduler = new SolverScheduler(new TransientSession())
    const tick = scheduler.tick(tickInput(0.05))

    const dto = toAnalysisDto(tick.analysis, tick.gridKeys)
    // Structured-clone safety: postMessage round-trip ≈ JSON round-trip here.
    const revived = reviveAnalysis(JSON.parse(JSON.stringify(dto)))

    expect(revived.isValid).toBe(tick.analysis.isValid)
    expect(revived.netlist).toBe(tick.analysis.netlist)
    expect(revived.componentStates.size).toBe(tick.analysis.componentStates.size)
    expect(revived.supplies).toEqual(tick.analysis.supplies)
    const capBefore = tick.analysis.componentStates.get("c1")
    const capAfter = revived.componentStates.get("c1")
    expect(capAfter?.voltage).toBe(capBefore?.voltage)

    // nodeVoltageAt reconstructs: the cap's positive hole (6,6) reads the
    // same voltage on both sides of the boundary.
    const before = tick.analysis.nodeVoltageAt?.({ row: 6, col: 6 })
    const after = revived.nodeVoltageAt?.({ row: 6, col: 6 })
    expect(after).toBe(before ?? null)
    // Unknown grid point stays null.
    expect(revived.nodeVoltageAt?.({ row: 29, col: 9 })).toBeNull()
  })
})

describe("InlineSolverHost", () => {
  test("is a transparent wrapper over the scheduler", () => {
    const host = new InlineSolverHost(new SolverScheduler(new TransientSession()))
    const reference = new SolverScheduler(new TransientSession())

    const a = host.tick(tickInput(0.02))
    const b = reference.tick(tickInput(0.02))
    expect(a).not.toBeNull()
    const capA = a.analysis.componentStates.get("c1")
    const capB = b.analysis.componentStates.get("c1")
    expect(Math.abs((capA?.voltage ?? 0) - (capB?.voltage ?? 0))).toBeLessThan(1e-9)
  })
})

describe.skipIf(typeof Worker === "undefined")("WorkerSolverHost", () => {
  test("solves through a real worker; results converge with inline", async () => {
    const worker = new Worker(new URL("../solver.worker.ts", import.meta.url).href)
    const host = new WorkerSolverHost(worker)
    const inline = new InlineSolverHost(new SolverScheduler(new TransientSession()))

    try {
      // Warm-up: first tick posts and returns null (no completed solve yet).
      expect(host.tick(tickInput(0.02))).toBeNull()

      // Wait for the reply, then tick again — now we get a result.
      let result = null
      for (let i = 0; i < 100 && !result; i++) {
        await Bun.sleep(10)
        result = host.tick(tickInput(0.02))
      }
      expect(result).not.toBeNull()
      if (!result) throw new Error("worker never replied")

      const inlineResult = inline.tick(tickInput(0.02))
      const capWorker = result.analysis.componentStates.get("c1")
      const capInline = inlineResult.analysis.componentStates.get("c1")
      expect(capWorker).toBeDefined()
      // Same physics on both sides (both advanced 0.02 s of the same board).
      expect(Math.abs((capWorker?.voltage ?? 0) - (capInline?.voltage ?? 0))).toBeLessThan(0.01)

      // nodeVoltageAt works across the boundary.
      const nodeV = result.analysis.nodeVoltageAt?.({ row: 6, col: 6 })
      expect(nodeV).not.toBeNull()
      expect(nodeV).not.toBeUndefined()
    } finally {
      host.dispose()
    }
  })

  test("coalesces inputs while a solve is in flight", async () => {
    const worker = new Worker(new URL("../solver.worker.ts", import.meta.url).href)
    const host = new WorkerSolverHost(worker)
    try {
      // Burst of ticks — only the newest pending input may be queued behind
      // the in-flight one; the host must never build an unbounded queue and
      // the final state must reflect the LAST mcu time.
      for (let i = 1; i <= 20; i++) {
        host.tick(tickInput(i * 0.005))
      }
      let result = null
      for (let i = 0; i < 200; i++) {
        await Bun.sleep(10)
        result = host.tick(tickInput(0.1))
        if (result && result.lagSeconds < 1e-6) break
      }
      expect(result).not.toBeNull()
      // Circuit caught up to the final clock without queue buildup.
      expect(result!.lagSeconds).toBeLessThan(1e-6)
    } finally {
      host.dispose()
    }
  })
})
