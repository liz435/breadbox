// ── spicey ↔ ngspice cross-checks (ROADMAP follow-up) ──────────────────────
//
// Runs the same netlists through spicey (our patched engine) and ngspice
// (the 40-year reference simulator) and asserts the operating points and
// transient waveforms agree. This replaces hand-derived analytical goldens
// as the oracle: every future engine change (integration method, new
// device, convergence tweak) is automatically checked against reference
// behavior.
//
// Skips cleanly when ngspice isn't installed (local dev machines); CI
// installs it so the checks always run there. Calibration at authoring
// time: spicey's BJT saturation point matched ngspice to 4 decimal places
// (VCE 0.1110 vs 0.111039, IC 22.223 mA vs 22.2226 mA), so tolerances are
// deliberately tight — loosen only with justification.

import { describe, test, expect } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseNetlist, simulateTRAN } from "spicey"

// ── ngspice availability ───────────────────────────────────────────────────

function ngspiceAvailable(): boolean {
  try {
    const proc = Bun.spawnSync(["ngspice", "--version"], { stdout: "pipe", stderr: "pipe" })
    return proc.exitCode === 0
  } catch {
    return false
  }
}

const HAS_NGSPICE = ngspiceAvailable()
if (!HAS_NGSPICE) {
  console.warn(
    "[crosscheck] ngspice not found on PATH — reference cross-checks skipped. " +
      "Install it (brew install ngspice / apt-get install ngspice) to run them.",
  )
}

// ── Harness ────────────────────────────────────────────────────────────────

const workDir = HAS_NGSPICE ? mkdtempSync(join(tmpdir(), "ngspice-xcheck-")) : ""

/**
 * Run a deck through ngspice batch mode and parse `name = 1.23e-4` print
 * lines. `prints` are ngspice print expressions (v(node), @q1[ic], …).
 */
function runNgspiceOp(elements: string, prints: string[]): Map<string, number> {
  const deck = [
    "xcheck deck",
    elements.trim(),
    ".op",
    ".control",
    "run",
    `print ${prints.join(" ")}`,
    ".endc",
    ".end",
    "",
  ].join("\n")
  const file = join(workDir, `op-${Bun.hash(deck).toString(16)}.cir`)
  writeFileSync(file, deck)
  const proc = Bun.spawnSync(["ngspice", "-b", file], { stdout: "pipe", stderr: "pipe" })
  const out = proc.stdout.toString()
  const values = new Map<string, number>()
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\S+)\s*=\s*([-+0-9.eE]+)/)
    if (m) values.set(m[1].toLowerCase(), Number(m[2]))
  }
  for (const p of prints) {
    if (!values.has(p.toLowerCase())) {
      throw new Error(`ngspice did not print ${p}. Output:\n${out.slice(0, 800)}`)
    }
  }
  return values
}

/** Solve the same elements in spicey; read final-point node V / element I. */
function runSpiceyOp(elements: string): {
  v: (node: string) => number
  i: (element: string) => number
} {
  const netlist = `xcheck deck\n${elements.trim()}\n.tran 0.001 0.01\n.end`
  const ckt = parseNetlist(netlist)
  const tran = simulateTRAN(ckt)
  if (!tran) throw new Error("spicey returned no transient result")
  const last = (s: number[] | undefined) => (s && s.length > 0 ? s[s.length - 1] : NaN)
  return {
    v: (node) => last(tran.nodeVoltages[node]),
    i: (element) => last(tran.elementCurrents[element]),
  }
}

/** Relative-with-floor comparison: |a−b| ≤ max(rel·|b|, abs). */
function expectClose(actual: number, reference: number, rel: number, abs: number): void {
  const tolerance = Math.max(rel * Math.abs(reference), abs)
  expect(Math.abs(actual - reference)).toBeLessThanOrEqual(tolerance)
}

// ── DC operating-point cross-checks ────────────────────────────────────────

type OpCase = {
  name: string
  elements: string
  /**
   * ngspice-side deck when the element syntax differs. MOSFETs: spicey's
   * M lines take 3 nodes (bulk implicitly tied to source); real SPICE
   * requires the bulk node explicitly.
   */
  ngspiceElements?: string
  /** node → ngspice print expression is v(node) */
  nodes: string[]
  /** [spicey element name, ngspice print expression] */
  currents: Array<[string, string]>
}

const OP_CASES: OpCase[] = [
  {
    name: "diode forward drop (red LED model + series Rs)",
    elements: `
V1 vin 0 5
R1 vin a 220
D1 a jx DLED
RS jx 0 12
.model DLED D(Is=3.3e-17 N=2.0)`,
    nodes: ["a", "jx"],
    currents: [["D1", "@d1[id]"]],
  },
  {
    name: "BJT saturated switch",
    elements: `
V1 vin 0 5
RC vin c 220
RB vin b 10k
Q1 c b 0 QN
.model QN NPN(IS=1e-14 BF=200)`,
    nodes: ["c", "b"],
    currents: [["Q1", "@q1[ic]"]],
  },
  {
    name: "BJT active region (emitter degeneration)",
    elements: `
V1 vin 0 5
VB b 0 2
RC vin c 1k
RE e 0 1k
Q1 c b e QN
.model QN NPN(IS=1e-14 BF=200)`,
    nodes: ["c", "e"],
    currents: [["Q1", "@q1[ic]"]],
  },
  {
    name: "BJT cutoff",
    elements: `
V1 vin 0 5
RC vin c 220
RB b 0 10k
Q1 c b 0 QN
.model QN NPN(IS=1e-14 BF=200)`,
    nodes: ["c"],
    currents: [],
  },
  {
    name: "NMOS triode switch",
    elements: `
V1 vin 0 5
VG g 0 5
RD vin d 100
M1 d g 0 MN
.model MN NMOS(VTO=2 KP=0.5)`,
    ngspiceElements: `
V1 vin 0 5
VG g 0 5
RD vin d 100
M1 d g 0 0 MN
.model MN NMOS(VTO=2 KP=0.5)`,
    nodes: ["d"],
    currents: [["M1", "@m1[id]"]],
  },
  {
    name: "NMOS saturation",
    elements: `
V1 vin 0 5
VG g 0 3
RD vin d 1k
M1 d g 0 MN
.model MN NMOS(VTO=2 KP=1m)`,
    ngspiceElements: `
V1 vin 0 5
VG g 0 3
RD vin d 1k
M1 d g 0 0 MN
.model MN NMOS(VTO=2 KP=1m)`,
    nodes: ["d"],
    currents: [["M1", "@m1[id]"]],
  },
]

describe.skipIf(!HAS_NGSPICE)("spicey ↔ ngspice — DC operating points", () => {
  for (const c of OP_CASES) {
    test(c.name, () => {
      const prints = [
        ...c.nodes.map((n) => `v(${n})`),
        ...c.currents.map(([, ng]) => ng),
      ]
      const reference = runNgspiceOp(c.ngspiceElements ?? c.elements, prints)
      const spicey = runSpiceyOp(c.elements)

      for (const node of c.nodes) {
        const ref = reference.get(`v(${node})`)
        if (ref === undefined) throw new Error(`missing v(${node})`)
        // 1% relative or 5 mV absolute, whichever is looser.
        expectClose(spicey.v(node), ref, 0.01, 0.005)
      }
      for (const [el, ng] of c.currents) {
        const ref = reference.get(ng.toLowerCase())
        if (ref === undefined) throw new Error(`missing ${ng}`)
        // 1% relative or 10 µA absolute.
        expectClose(Math.abs(spicey.i(el)), Math.abs(ref), 0.01, 1e-5)
      }
    })
  }
})

// ── Transient waveform cross-check ─────────────────────────────────────────

describe.skipIf(!HAS_NGSPICE)("spicey ↔ ngspice — RLC transient waveform", () => {
  test("underdamped RLC step response tracks the reference waveform", () => {
    const elements = `
V1 vin 0 5
R1 vin a 2
L1 a b 10m
C1 b 0 10u`

    // ngspice: uic starts reactive state at zero (matching spicey's fresh
    // parse); linearize resamples onto the uniform 10 µs grid; wrdata
    // writes "time value" rows.
    const outFile = join(workDir, "rlc-wave")
    const deck = [
      "xcheck rlc",
      elements.trim(),
      ".tran 10u 10m uic",
      ".control",
      "run",
      "linearize",
      `wrdata ${outFile} v(b)`,
      ".endc",
      ".end",
      "",
    ].join("\n")
    const file = join(workDir, "rlc.cir")
    writeFileSync(file, deck)
    const proc = Bun.spawnSync(["ngspice", "-b", file], { stdout: "pipe", stderr: "pipe" })
    expect(proc.exitCode).toBe(0)
    const rows = readFileSync(outFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter((r) => r.length >= 2 && r.every(Number.isFinite))
    expect(rows.length).toBeGreaterThan(900)

    // spicey: same dt/tstop. times[k] = (k+1)·dt (no t=0 sample).
    const ckt = parseNetlist(
      `xcheck rlc\n${elements.trim()}\n.tran 10u 10m\n.end`,
    )
    const tran = simulateTRAN(ckt)
    if (!tran) throw new Error("spicey returned no transient result")
    const vb = tran.nodeVoltages["b"]

    // Compare every 10th sample (~100 points across 5 ring cycles). The
    // waveform swings 0 → 9.5 V; 150 mV absolute agreement means both
    // amplitude AND phase line up throughout.
    let worst = 0
    for (let k = 10; k < rows.length; k += 10) {
      const [tRef, vRef] = rows[k]
      const idx = Math.round(tRef / 10e-6) - 1
      if (idx < 0 || idx >= vb.length) continue
      worst = Math.max(worst, Math.abs(vb[idx] - vRef))
    }
    expect(worst).toBeLessThan(0.15)
  })
})
