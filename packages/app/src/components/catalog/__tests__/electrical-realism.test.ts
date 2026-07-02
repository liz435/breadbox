// ── Catalog electrical-realism tests ─────────────────────────────────────────
//
// Definition-level netlist checks for the fixes that made visual-only or
// idealized parts behave physically: the relay's switched contacts, the
// photoresistor's light-dependent resistance, the RGB LED's three diode
// branches, and the seven-segment's common-anode return path.

import { describe, expect, test } from "bun:test"
import type { BoardComponent, PinState, Wire } from "@dreamer/schemas"
import { createDefaultPinStates } from "@dreamer/schemas"
import type { NetlistContext } from "@/components/component-definition"
import { relay } from "@/components/catalog/relay"
import { photoresistor } from "@/components/catalog/photoresistor"
import { rgbLed } from "@/components/catalog/rgb-led"
import { sevenSegment } from "@/components/catalog/seven-segment"

function makeCtx(
  def: { footprint: (row: number, col: number, props?: Record<string, unknown>) => NetlistContext["footprint"] },
  comp: BoardComponent,
  overrides: Partial<Pick<NetlistContext, "pinStates" | "wires">> = {},
): NetlistContext {
  return {
    footprint: def.footprint(comp.y, comp.x, comp.properties),
    resolveNode: (p) => `n_${p.row}_${p.col}`,
    pinStates: overrides.pinStates ?? createDefaultPinStates(),
    wires: overrides.wires ?? {},
  }
}

function pinStatesWith(overrides: Array<{ pin: number } & Partial<PinState>>): PinState[] {
  const states = createDefaultPinStates()
  for (const o of overrides) states[o.pin] = { ...states[o.pin], ...o }
  return states
}

describe("relay — switched contacts in the netlist", () => {
  function makeRelay(): BoardComponent {
    return {
      id: "relay-1",
      type: "relay",
      name: "Relay",
      x: 3,
      y: 5,
      rotation: 0,
      pins: { out: 7, com: null, no: null, nc: null },
      properties: {},
    }
  }

  // The COM hole (row y+3) must be wired for the contacts to switch — the
  // backward-compat gate keeps un-wired (pre-contact-pin) boards inert.
  const COM_WIRE: Record<string, Wire> = {
    wcom: { id: "wcom", fromRow: 8, fromCol: 0, toRow: 8, toCol: 3, color: "#000" },
  }

  test("coil HIGH closes COM→NO and opens COM→NC", () => {
    const comp = makeRelay()
    const ctx = makeCtx(relay, comp, {
      wires: COM_WIRE,
      pinStates: pinStatesWith([{ pin: 7, mode: "OUTPUT", digitalValue: 1 }]),
    })
    const out = relay.buildNetlist?.(comp, ctx)
    expect(out).not.toBeNull()
    const lines = out?.lines ?? []
    expect(lines.find((l) => l.includes("_no"))).toContain("0.01")
    expect(lines.find((l) => l.includes("_nc"))).toContain("10000000")
  })

  test("coil LOW opens COM→NO and closes COM→NC", () => {
    const comp = makeRelay()
    const ctx = makeCtx(relay, comp, {
      wires: COM_WIRE,
      pinStates: pinStatesWith([{ pin: 7, mode: "OUTPUT", digitalValue: 0 }]),
    })
    const lines = relay.buildNetlist?.(comp, ctx)?.lines ?? []
    expect(lines.find((l) => l.includes("_no"))).toContain("10000000")
    expect(lines.find((l) => l.includes("_nc"))).toContain("0.01")
  })

  test("un-wired contacts stay inert (pre-contact-pin boards)", () => {
    const comp = makeRelay()
    const ctx = makeCtx(relay, comp, {
      pinStates: pinStatesWith([{ pin: 7, mode: "OUTPUT", digitalValue: 1 }]),
    })
    expect(relay.buildNetlist?.(comp, ctx)).toBeNull()
  })

  test("coil resolved from wire topology when comp.pins.out is unset", () => {
    const comp = { ...makeRelay(), pins: { out: null, com: null, no: null, nc: null } }
    // D7 wired to the signal hole (row y+1, same left-cluster row).
    const wires: Record<string, Wire> = {
      ...COM_WIRE,
      w1: { id: "w1", fromRow: -999, fromCol: 7, toRow: 6, toCol: 3, color: "#000" },
    }
    const ctx = makeCtx(relay, comp, {
      wires,
      pinStates: pinStatesWith([{ pin: 7, mode: "OUTPUT", digitalValue: 1 }]),
    })
    const lines = relay.buildNetlist?.(comp, ctx)?.lines ?? []
    expect(lines.find((l) => l.includes("_no"))).toContain("0.01")
  })
})

describe("photoresistor — light-dependent resistance", () => {
  function makeLdr(light: number): BoardComponent {
    return {
      id: "ldr-1",
      type: "photoresistor",
      name: "LDR",
      x: 0,
      y: 5,
      rotation: 0,
      pins: { a: null, b: null },
      properties: { light },
    }
  }

  function resistanceAt(light: number): number {
    const comp = makeLdr(light)
    const line = photoresistor.buildNetlist?.(comp, makeCtx(photoresistor, comp))?.lines[0] ?? ""
    return Number.parseFloat(line.split(" ").at(-1) ?? "0")
  }

  test("resistance falls by orders of magnitude from dark to bright", () => {
    const dark = resistanceAt(0)
    const mid = resistanceAt(50)
    const bright = resistanceAt(100)
    expect(dark).toBeGreaterThan(100_000) // ~250kΩ
    expect(mid).toBeGreaterThan(9_000)
    expect(mid).toBeLessThan(11_000) // 10kΩ at 10 lux
    expect(bright).toBeLessThan(1_000) // ~400Ω
    expect(dark / bright).toBeGreaterThan(100)
  })
})

describe("rgb led — three diode branches", () => {
  test("red, green and blue channels each emit a diode + series R", () => {
    const comp: BoardComponent = {
      id: "rgb-1",
      type: "rgb_led",
      name: "RGB",
      x: 0,
      y: 5,
      rotation: 0,
      pins: { red: null, green: null, blue: null, common: null },
      properties: {},
    }
    const out = rgbLed.buildNetlist?.(comp, makeCtx(rgbLed, comp))
    const lines = out?.lines ?? []
    expect(lines.filter((l) => l.startsWith("D_")).length).toBe(3)
    expect(lines.filter((l) => l.startsWith("Rs_")).length).toBe(3)
    // Red keeps the bare id so the solver's D_<id> current lookup resolves.
    expect(lines.some((l) => l.startsWith("D_rgb_1 "))).toBe(true)
    expect(lines.some((l) => l.startsWith("D_rgb_1_g "))).toBe(true)
    expect(lines.some((l) => l.startsWith("D_rgb_1_b "))).toBe(true)
  })
})

describe("seven segment — common-anode mode", () => {
  function makeSevenSeg(commonType?: string): BoardComponent {
    return {
      id: "seg-1",
      type: "seven_segment",
      name: "7seg",
      x: 0,
      y: 5,
      rotation: 0,
      pins: { a: null, b: null, c: null, d: null, e: null, f: null, g: null, dp: null, gnd: null },
      properties: commonType ? { commonType } : {},
    }
  }

  test("cathode (default): segments return to ground node 0", () => {
    const comp = makeSevenSeg()
    const lines = sevenSegment.buildNetlist?.(comp, makeCtx(sevenSegment, comp))?.lines ?? []
    expect(lines.length).toBe(7)
    expect(lines.every((l) => l.split(" ")[2] === "0")).toBe(true)
  })

  test("anode: segments return through the common pin's node", () => {
    const comp = makeSevenSeg("anode")
    const out = sevenSegment.buildNetlist?.(comp, makeCtx(sevenSegment, comp))
    const lines = out?.lines ?? []
    expect(lines.length).toBe(7)
    // Common pin is the last footprint hole: row y+8.
    expect(lines.every((l) => l.split(" ")[2] === "n_13_0")).toBe(true)
    expect(out?.nodeB).toBe("n_13_0")
  })
})
