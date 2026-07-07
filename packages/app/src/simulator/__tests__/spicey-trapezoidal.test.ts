// ── Trapezoidal integration tests (ROADMAP follow-up, risk-1 mitigation) ───
//
// Backward Euler numerically dissipates energy: LC ringing decays even in a
// lossless circuit, which falsifies exactly the flyback/motor-coil physics
// the inductor exists to teach. Trapezoidal is 2nd-order and conserves the
// oscillation. Acceptance (from ROADMAP verification strategy):
//   - LC ringing frequency within 1% of 1/(2π√LC)
//   - amplitude decay governed by real resistance, not the integrator
//   - RC step response still matches the analytical exponential

import { describe, test, expect } from "bun:test"
import { parseNetlist, simulateTRAN } from "spicey"

describe("trapezoidal LC ringing", () => {
  // Series RLC, lightly damped: 5 V step into R 2Ω → L 10 mH → C 10 µF.
  // f0 = 1/(2π√(LC)) ≈ 503.29 Hz; Q = (1/R)·√(L/C) ≈ 15.8 — many visible
  // cycles. dt = 10 µs ≈ 1/199 of the period.
  const netlist = `
Underdamped series RLC step response
V1 vin 0 5
R1 vin a 2
L1 a b 10m
C1 b 0 10u
.tran 10u 10m
.end
`

  function capVoltageSeries(): { times: number[]; v: number[] } {
    const ckt = parseNetlist(netlist)
    const tran = simulateTRAN(ckt)
    if (!tran) throw new Error("no transient result")
    return { times: tran.times, v: tran.nodeVoltages["b"] }
  }

  /** Local maxima of the waveform (ringing peaks above the 5 V final value). */
  function peaks(times: number[], v: number[]): Array<{ t: number; v: number }> {
    const out: Array<{ t: number; v: number }> = []
    for (let i = 1; i < v.length - 1; i++) {
      if (v[i] > v[i - 1] && v[i] >= v[i + 1] && v[i] > 5.05) {
        out.push({ t: times[i], v: v[i] })
      }
    }
    return out
  }

  test("ringing frequency within 1% of 1/(2π·√LC)", () => {
    const { times, v } = capVoltageSeries()
    const p = peaks(times, v)
    expect(p.length).toBeGreaterThan(3)
    // Average peak-to-peak spacing = damped period. With Q ≈ 15.8 the
    // damped frequency deviates from f0 by only ~0.05% — inside the 1% gate.
    const spacings: number[] = []
    for (let i = 1; i < p.length; i++) spacings.push(p[i].t - p[i - 1].t)
    const avgPeriod = spacings.reduce((a, b) => a + b, 0) / spacings.length
    const f = 1 / avgPeriod
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 10e-6))
    expect(Math.abs(f - f0) / f0).toBeLessThan(0.01)
  })

  test("amplitude decay matches the circuit's real damping, not the integrator", () => {
    const { times, v } = capVoltageSeries()
    const p = peaks(times, v)
    expect(p.length).toBeGreaterThan(3)
    // Analytical envelope: successive peaks shrink by exp(-α·T) with
    // α = R/(2L) = 100 s⁻¹, T ≈ 1.987 ms → ratio ≈ 0.8199. Backward Euler
    // at this dt collapsed the ringing several times faster.
    const alpha = 2 / (2 * 10e-3)
    const measured: number[] = []
    for (let i = 1; i < p.length; i++) {
      const expected = Math.exp(-alpha * (p[i].t - p[i - 1].t))
      measured.push((p[i].v - 5) / (p[i - 1].v - 5) / expected)
    }
    // Each successive ratio must sit within 5% of the analytical envelope.
    for (const ratio of measured) {
      expect(Math.abs(ratio - 1)).toBeLessThan(0.05)
    }
  })

  test("first peak overshoots close to the ideal 2× step (lossless limit)", () => {
    const { times, v } = capVoltageSeries()
    const p = peaks(times, v)
    // With Q ≈ 15.8 the first peak reaches 5·(1+e^(-α·T/2)) ≈ 9.5 V.
    // Backward Euler damped this visibly below 9 V at practical dt.
    expect(p[0].v).toBeGreaterThan(9.2)
    expect(p[0].v).toBeLessThan(10.01)
  })
})

describe("trapezoidal RC accuracy (regression)", () => {
  test("RC step response stays on the analytical exponential", () => {
    // 5 V step → 1 kΩ → 100 µF. τ = 0.1 s; simulate exactly one τ.
    // Title must not start with an element letter (r/c/l/v/g/s/m/i/q/d).
    const ckt = parseNetlist(`
Exponential charge check
V1 vin 0 5
R1 vin a 1k
C1 a 0 100u
.tran 1m 100m
.end
`)
    const tran = simulateTRAN(ckt)
    if (!tran) throw new Error("no transient result")
    const v = tran.nodeVoltages["a"]
    const analytic = 5 * (1 - Math.exp(-1))
    expect(Math.abs(v[v.length - 1] - analytic) / analytic).toBeLessThan(0.02)
  })
})
