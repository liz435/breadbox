import { describe, test, expect, beforeEach } from "bun:test"
import {
  getCapVoltage,
  stepCapVoltage,
  resetCapVoltage,
  resetAllCapVoltages,
} from "../capacitor-state"

// ── Setup ────────────────────────────────────────────────────────────
// The module-level store persists between tests within a file.
// Always reset all capacitors before each test for isolation.

beforeEach(() => {
  resetAllCapVoltages()
})

// ── getCapVoltage ────────────────────────────────────────────────────

describe("getCapVoltage", () => {
  test("returns 0 for an unseen component ID", () => {
    expect(getCapVoltage("cap_new")).toBe(0)
  })

  test("returns the stored voltage after a step", () => {
    stepCapVoltage("cap1", 0.01, 100e-6, 0.05)
    const v = getCapVoltage("cap1")
    expect(v).toBeGreaterThan(0)
  })
})

// ── stepCapVoltage — basic charging ──────────────────────────────────

describe("stepCapVoltage — charging", () => {
  test("positive current increases voltage from 0", () => {
    const next = stepCapVoltage("cap1", 0.001, 100e-6, 0.05)
    expect(next).toBeGreaterThan(0)
  })

  test("repeated charging steps accumulate voltage", () => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      v = stepCapVoltage("cap1", 0.001, 100e-6, 0.05)
    }
    // After 5 steps, voltage must be higher than after 1 step
    const after1 = stepCapVoltage("cap2", 0.001, 100e-6, 0.05)
    expect(v).toBeGreaterThan(after1)
  })

  test("voltage increases by at most 1V per frame regardless of current magnitude", () => {
    // Extreme current: 1000A through 1µF would normally give dV = 1000 * 0.05 / 1e-6 = huge
    const next = stepCapVoltage("cap1", 1000, 1e-6, 0.05)
    // Starting at 0, max jump is 1V
    expect(next).toBeLessThanOrEqual(1.0)
  })

  test("very large capacitance slows charging (dV = I*dt/C is small)", () => {
    // 1F capacitor, 1mA, 50ms: ideal dV = 0.001 * 0.05 / 1 = 0.00005V
    const next = stepCapVoltage("cap1", 0.001, 1.0, 0.05)
    expect(next).toBeCloseTo(0.00005, 5)
  })
})

// ── stepCapVoltage — discharging ──────────────────────────────────────

describe("stepCapVoltage — discharging", () => {
  test("negative current decreases voltage", () => {
    // First charge up to some level
    stepCapVoltage("cap1", 0.001, 100e-6, 0.05) // ~0.5V
    stepCapVoltage("cap1", 0.001, 100e-6, 0.05)
    const charged = getCapVoltage("cap1")

    // Now discharge
    const discharged = stepCapVoltage("cap1", -0.001, 100e-6, 0.05)
    expect(discharged).toBeLessThan(charged)
  })

  test("voltage cannot go below 0 — clamp floor", () => {
    // Starting at 0, discharging should not go negative
    const next = stepCapVoltage("cap1", -1.0, 100e-6, 0.05)
    expect(next).toBeGreaterThanOrEqual(0)
  })

  test("extreme negative current discharges at most 1V per frame", () => {
    // First charge up to at least 2V
    for (let i = 0; i < 10; i++) {
      stepCapVoltage("cap1", 10, 1, 0.05)
    }
    const before = getCapVoltage("cap1")

    // Now try to discharge with extreme current
    const after = stepCapVoltage("cap1", -10000, 1e-6, 0.05)
    expect(before - after).toBeLessThanOrEqual(1.0 + 1e-9) // allow floating point
  })
})

// ── stepCapVoltage — near-zero current (dead zone) ────────────────────

describe("stepCapVoltage — near-zero current threshold", () => {
  test("current below 1e-9 A does not change voltage (dead zone)", () => {
    stepCapVoltage("cap1", 0.001, 100e-6, 0.05) // charge to some level
    const before = getCapVoltage("cap1")

    // Sub-threshold current: should not change
    const after = stepCapVoltage("cap1", 5e-10, 100e-6, 0.05)
    expect(after).toBe(before)
  })

  test("current exactly at threshold (1e-9) does not change voltage", () => {
    stepCapVoltage("cap1", 0.005, 100e-6, 0.05)
    const before = getCapVoltage("cap1")
    const after = stepCapVoltage("cap1", 1e-9, 100e-6, 0.05)
    expect(after).toBe(before)
  })

  test("current just above threshold (1.1e-9) DOES change voltage", () => {
    stepCapVoltage("cap1", 0.001, 100e-6, 0.05)
    const before = getCapVoltage("cap1")
    const after = stepCapVoltage("cap1", 1.1e-9, 100e-6, 0.05)
    // dV = 1.1e-9 * 0.05 / 100e-6 = 5.5e-10 V — tiny but nonzero
    expect(after).not.toBe(before)
  })
})

// ── 25V hard ceiling ──────────────────────────────────────────────────

describe("stepCapVoltage — 25V ceiling", () => {
  test("voltage is clamped to 25V maximum", () => {
    // Manually push cap close to ceiling with repeated charges
    let v = 0
    for (let i = 0; i < 30; i++) {
      v = stepCapVoltage("cap1", 10, 1, 0.05)
    }
    expect(v).toBeLessThanOrEqual(25)
  })

  test("once at 25V ceiling, further charging stays at 25V", () => {
    // Push to ceiling
    for (let i = 0; i < 30; i++) {
      stepCapVoltage("cap1", 10, 1, 0.05)
    }
    const atCeiling = getCapVoltage("cap1")
    expect(atCeiling).toBe(25)

    // More charging attempts
    for (let i = 0; i < 5; i++) {
      stepCapVoltage("cap1", 10, 1, 0.05)
    }
    expect(getCapVoltage("cap1")).toBe(25)
  })
})

// ── Zero capacitance — division by zero ──────────────────────────────

describe("stepCapVoltage — zero capacitance", () => {
  test("zero capacitance does not produce NaN or Infinity", () => {
    // dV = I * dt / C → division by zero when C = 0
    const next = stepCapVoltage("cap1", 0.001, 0, 0.05)
    expect(Number.isFinite(next) || next === 0).toBe(true)
    expect(Number.isNaN(next)).toBe(false)
  })

  test("negative capacitance does not crash", () => {
    const next = stepCapVoltage("cap1", 0.001, -100e-6, 0.05)
    // The result may be surprising but should not throw or NaN
    expect(Number.isNaN(next)).toBe(false)
  })
})

// ── resetCapVoltage ────────────────────────────────────────────────────

describe("resetCapVoltage", () => {
  test("deletes the stored voltage — getCapVoltage returns 0 afterwards", () => {
    stepCapVoltage("cap1", 0.01, 100e-6, 0.05)
    expect(getCapVoltage("cap1")).toBeGreaterThan(0)

    resetCapVoltage("cap1")
    expect(getCapVoltage("cap1")).toBe(0)
  })

  test("resetting a non-existent key is a no-op (no throw)", () => {
    expect(() => resetCapVoltage("never_existed")).not.toThrow()
  })

  test("resetting cap1 does not affect cap2", () => {
    stepCapVoltage("cap1", 0.01, 100e-6, 0.05)
    stepCapVoltage("cap2", 0.01, 100e-6, 0.05)

    resetCapVoltage("cap1")
    expect(getCapVoltage("cap1")).toBe(0)
    expect(getCapVoltage("cap2")).toBeGreaterThan(0)
  })
})

// ── resetAllCapVoltages ───────────────────────────────────────────────

describe("resetAllCapVoltages", () => {
  test("clears all stored capacitor voltages", () => {
    stepCapVoltage("cap1", 0.01, 100e-6, 0.05)
    stepCapVoltage("cap2", 0.01, 100e-6, 0.05)
    stepCapVoltage("cap3", 0.01, 100e-6, 0.05)

    resetAllCapVoltages()

    expect(getCapVoltage("cap1")).toBe(0)
    expect(getCapVoltage("cap2")).toBe(0)
    expect(getCapVoltage("cap3")).toBe(0)
  })

  test("calling resetAllCapVoltages on empty store is a no-op", () => {
    expect(() => resetAllCapVoltages()).not.toThrow()
  })
})

// ── Module-level store isolation ──────────────────────────────────────

describe("module-level store isolation", () => {
  test("different component IDs are independent", () => {
    stepCapVoltage("capA", 0.01, 100e-6, 0.05)  // fast charge
    stepCapVoltage("capB", 0.001, 100e-6, 0.05) // slow charge

    const vA = getCapVoltage("capA")
    const vB = getCapVoltage("capB")

    expect(vA).toBeGreaterThan(vB)
  })

  test("same ID accumulates voltage across calls", () => {
    const v1 = stepCapVoltage("cap1", 0.001, 100e-6, 0.05)
    const v2 = stepCapVoltage("cap1", 0.001, 100e-6, 0.05)
    expect(v2).toBeGreaterThan(v1)
  })

  test("ID with special characters is stored independently", () => {
    stepCapVoltage("cap/with/slashes", 0.01, 100e-6, 0.05)
    stepCapVoltage("cap with spaces", 0.01, 100e-6, 0.05)

    expect(getCapVoltage("cap/with/slashes")).toBeGreaterThan(0)
    expect(getCapVoltage("cap with spaces")).toBeGreaterThan(0)
    // They are separate entries
    resetCapVoltage("cap/with/slashes")
    expect(getCapVoltage("cap/with/slashes")).toBe(0)
    expect(getCapVoltage("cap with spaces")).toBeGreaterThan(0)
  })
})

// ── 1V/frame damping — boundary verification ──────────────────────────

describe("1V/frame damping limit", () => {
  test("from 0V, even with extreme current, next voltage is exactly 1V", () => {
    // dV_ideal = 1e6 * 0.05 / 1e-6 = 50,000,000,000 V — should be clamped to 1V
    const next = stepCapVoltage("cap1", 1e6, 1e-6, 0.05)
    expect(next).toBeCloseTo(1.0, 10)
  })

  test("from 10V, extreme current adds at most 1V → 11V", () => {
    // Charge to 10V first
    for (let i = 0; i < 10; i++) {
      stepCapVoltage("cap1", 10, 1, 0.05)
    }
    const before = getCapVoltage("cap1")
    const after = stepCapVoltage("cap1", 1e10, 1e-9, 0.05)
    expect(after - before).toBeLessThanOrEqual(1.0 + 1e-9)
  })

  test("from 5V, extreme negative current decreases by at most 1V → 4V", () => {
    // Charge to 5V
    for (let i = 0; i < 5; i++) {
      stepCapVoltage("cap1", 10, 1, 0.05)
    }
    const before = getCapVoltage("cap1")
    const after = stepCapVoltage("cap1", -1e10, 1e-9, 0.05)
    expect(before - after).toBeLessThanOrEqual(1.0 + 1e-9)
  })
})
