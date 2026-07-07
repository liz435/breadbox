// ── spicey BJT + MOSFET engine tests (ROADMAP Phase A′) ────────────────────
//
// Golden-value tests for the transistor support added to the spicey patch.
// Expected values are the analytical operating points of each circuit (the
// same numbers ngspice's Ebers-Moll / level-1 models settle to within the
// stated tolerances). Netlists are hand-written — these exercise the ENGINE,
// not the app's netlist builder.

import { describe, test, expect } from "bun:test"
import { parseNetlist, simulateTRAN } from "spicey"

function solve(netlist: string) {
  const ckt = parseNetlist(netlist)
  const tran = simulateTRAN(ckt)
  if (!tran) throw new Error("no transient result")
  const last = (series: number[] | undefined) =>
    series && series.length > 0 ? series[series.length - 1] : 0
  return {
    v: (node: string) => last(tran.nodeVoltages[node]),
    i: (element: string) => last(tran.elementCurrents[element]),
  }
}

describe("spicey BJT — Ebers-Moll NPN", () => {
  test("saturated switch: base driven hard, VCE collapses", () => {
    // 5V → Rc 220Ω → collector; 5V → Rb 10kΩ → base; emitter grounded.
    // IB ≈ (5 − 0.75)/10k ≈ 0.43 mA; βIB >> (5/220) → deep saturation:
    // VCE < 0.3 V and IC ≈ (5 − VCE)/220 ≈ 21–23 mA.
    const r = solve(`
BJT saturation switch
V1 vin 0 5
RC vin c 220
RB vin b 10k
Q1 c b 0 QN
.model QN NPN(IS=1e-14 BF=200)
.tran 0.001 0.01
.end
`)
    expect(r.v("c")).toBeLessThan(0.3)
    const icMa = r.i("Q1") * 1000
    expect(icMa).toBeGreaterThan(20)
    expect(icMa).toBeLessThan(23.5)
  })

  test("active region: emitter degeneration sets IC ≈ (VB − VBE)/RE", () => {
    // Base held at 2 V, emitter resistor 1 kΩ, collector via 1 kΩ from 5 V.
    // VE ≈ 2 − 0.72 ≈ 1.28 V → IC ≈ IE ≈ 1.28 mA → VC ≈ 5 − 1.28 ≈ 3.7 V.
    const r = solve(`
BJT common emitter, degenerated
V1 vin 0 5
VB b 0 2
RC vin c 1k
RE e 0 1k
Q1 c b e QN
.model QN NPN(IS=1e-14 BF=200)
.tran 0.001 0.01
.end
`)
    const icMa = r.i("Q1") * 1000
    expect(icMa).toBeGreaterThan(1.1)
    expect(icMa).toBeLessThan(1.45)
    expect(r.v("c")).toBeGreaterThan(3.4)
    expect(r.v("c")).toBeLessThan(4.0)
    // Sanity: firmly in the active region, not saturated.
    expect(r.v("c") - r.v("e")).toBeGreaterThan(1)
  })

  test("cutoff: grounded base leaves the collector at the rail", () => {
    const r = solve(`
BJT cutoff
V1 vin 0 5
RC vin c 220
RB b 0 10k
Q1 c b 0 QN
.model QN NPN(IS=1e-14 BF=200)
.tran 0.001 0.01
.end
`)
    expect(r.v("c")).toBeGreaterThan(4.95)
    expect(Math.abs(r.i("Q1") * 1000)).toBeLessThan(0.01)
  })

  test("PNP mirror: emitter at rail, base pulled low → saturated", () => {
    // PNP high-side switch: emitter 5V, base via 10k to GND, collector
    // through 220Ω to GND. Same magnitudes as the NPN case, mirrored.
    const r = solve(`
PNP high-side switch
V1 vin 0 5
RB b 0 10k
RC c 0 220
Q1 c b vin QP
.model QP PNP(IS=1e-14 BF=200)
.tran 0.001 0.01
.end
`)
    // Collector pulled up near the rail (VEC small).
    expect(r.v("c")).toBeGreaterThan(4.7)
    expect(Math.abs(r.i("Q1") * 1000)).toBeGreaterThan(20)
  })

  test("beta relationship holds in the active region", () => {
    // Fixed base current: 5V → 1MΩ → base gives IB ≈ 4.3 µA. With BF=100
    // and a light collector load the transistor stays active:
    // IC ≈ 100 × 4.3 µA ≈ 0.43 mA.
    const r = solve(`
BJT beta check
V1 vin 0 5
RB vin b 1meg
RC vin c 1k
Q1 c b 0 QN
.model QN NPN(IS=1e-14 BF=100)
.tran 0.001 0.01
.end
`)
    const icMa = r.i("Q1") * 1000
    expect(icMa).toBeGreaterThan(0.36)
    expect(icMa).toBeLessThan(0.5)
  })
})

describe("spicey MOSFET — level 1", () => {
  test("triode switch: logic-level gate gives a milliohm-class channel", () => {
    // Gate 5 V, VTO 2, KP 0.5 → Rds(on) ≈ 1/(KP·(VGS−VTO)) ≈ 0.67 Ω.
    // Drain load 100 Ω from 5 V: Id ≈ 5/100.67 ≈ 49.7 mA, VDS ≈ 33 mV.
    const r = solve(`
NMOS low-side switch
V1 vin 0 5
VG g 0 5
RD vin d 100
M1 d g 0 MN
.model MN NMOS(VTO=2 KP=0.5)
.tran 0.001 0.01
.end
`)
    expect(r.v("d")).toBeLessThan(0.1)
    const idMa = r.i("M1") * 1000
    expect(idMa).toBeGreaterThan(48.5)
    expect(idMa).toBeLessThan(50.5)
  })

  test("cutoff: gate at 0 V blocks the channel", () => {
    const r = solve(`
NMOS cutoff
V1 vin 0 5
VG g 0 0
RD vin d 100
M1 d g 0 MN
.model MN NMOS(VTO=2 KP=0.5)
.tran 0.001 0.01
.end
`)
    expect(r.v("d")).toBeGreaterThan(4.95)
    expect(Math.abs(r.i("M1") * 1000)).toBeLessThan(0.01)
  })

  test("saturation: Id = (KP/2)·(VGS−VTO)² independent of the drain load", () => {
    // VGS 3 V, VTO 2, KP 1m → Id = 0.5 mA; drain 5V via 1k → VD = 4.5 V,
    // VDS (4.5) > VOV (1) confirms saturation self-consistently.
    const r = solve(`
NMOS saturation
V1 vin 0 5
VG g 0 3
RD vin d 1k
M1 d g 0 MN
.model MN NMOS(VTO=2 KP=1m)
.tran 0.001 0.01
.end
`)
    const idMa = r.i("M1") * 1000
    expect(idMa).toBeGreaterThan(0.475)
    expect(idMa).toBeLessThan(0.525)
    expect(r.v("d")).toBeGreaterThan(4.4)
    expect(r.v("d")).toBeLessThan(4.6)
  })

  test("PMOS high-side switch conducts when the gate is pulled low", () => {
    // Source at 5 V, gate 0 V → VSG = 5 > |VTO|. Load 100 Ω to GND.
    const r = solve(`
PMOS high-side switch
V1 vin 0 5
VG g 0 0
RL d 0 100
M1 d g vin MP
.model MP PMOS(VTO=2 KP=0.5)
.tran 0.001 0.01
.end
`)
    // Drain pulled up to ~5 V through the on channel.
    expect(r.v("d")).toBeGreaterThan(4.9)
  })

  test("existing diode behavior is untouched by the patch", () => {
    // Regression canary: red-LED forward drop stays realistic (pnjlim fix).
    // NB: netlist titles must not start with an element letter (r/c/l/v/g/
    // s/m/i/q/d) — spicey's title heuristic would parse the line instead.
    // Model card = the app's red LED (diode-model.ts): junction anchored to
    // Vf(20 mA) ≈ 1.76 V with Rs stamped separately.
    const r = solve(`
Forward drop of a red LED
V1 vin 0 5
R1 vin a 220
D1 a jx DLED
RS jx 0 12
.model DLED D(Is=3.3e-17 N=2.0)
.tran 0.001 0.01
.end
`)
    const va = r.v("a")
    expect(va).toBeGreaterThan(1.7)
    expect(va).toBeLessThan(2.2)
  })
})
