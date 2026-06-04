import { describe, test, expect, beforeEach } from "bun:test"
import {
  getCapVoltage,
  setCapVoltage,
  resetCapVoltage,
  resetAllCapVoltages,
} from "../capacitor-state"

// The store is a module-level singleton — clear it between tests so state
// doesn't leak across cases.
beforeEach(() => {
  resetAllCapVoltages()
})

// ── getCapVoltage ────────────────────────────────────────────────────

describe("getCapVoltage", () => {
  test("returns 0 for a capacitor that has never been seen", () => {
    expect(getCapVoltage("cap_new")).toBe(0)
  })

  test("returns the last value written by setCapVoltage", () => {
    setCapVoltage("cap1", 3.3)
    expect(getCapVoltage("cap1")).toBe(3.3)
  })
})

// ── setCapVoltage ────────────────────────────────────────────────────

describe("setCapVoltage", () => {
  test("overwrites the stored voltage", () => {
    setCapVoltage("cap1", 1)
    setCapVoltage("cap1", 4.2)
    expect(getCapVoltage("cap1")).toBe(4.2)
  })

  test("keeps each capacitor's voltage independent", () => {
    setCapVoltage("capA", 2)
    setCapVoltage("capB", 4)
    expect(getCapVoltage("capA")).toBe(2)
    expect(getCapVoltage("capB")).toBe(4)
  })

  test("stores negative voltages (reverse polarity / AC swing)", () => {
    setCapVoltage("cap1", -1.5)
    expect(getCapVoltage("cap1")).toBe(-1.5)
  })

  test("ignores NaN — the cap holds its previous voltage", () => {
    setCapVoltage("cap1", 5)
    setCapVoltage("cap1", Number.NaN)
    expect(getCapVoltage("cap1")).toBe(5)
  })

  test("ignores Infinity — the cap holds its previous voltage", () => {
    setCapVoltage("cap1", 5)
    setCapVoltage("cap1", Number.POSITIVE_INFINITY)
    expect(getCapVoltage("cap1")).toBe(5)
  })

  test("handles ids with non-alphanumeric characters", () => {
    setCapVoltage("cap/with/slashes", 1.1)
    setCapVoltage("cap with spaces", 2.2)
    expect(getCapVoltage("cap/with/slashes")).toBe(1.1)
    expect(getCapVoltage("cap with spaces")).toBe(2.2)
  })
})

// ── resetCapVoltage ────────────────────────────────────────────────────

describe("resetCapVoltage", () => {
  test("deletes a single capacitor's stored voltage", () => {
    setCapVoltage("cap1", 3)
    resetCapVoltage("cap1")
    expect(getCapVoltage("cap1")).toBe(0)
  })

  test("does not throw for an unknown id", () => {
    expect(() => resetCapVoltage("never_existed")).not.toThrow()
  })

  test("only resets the targeted capacitor", () => {
    setCapVoltage("cap1", 3)
    setCapVoltage("cap2", 4)
    resetCapVoltage("cap1")
    expect(getCapVoltage("cap1")).toBe(0)
    expect(getCapVoltage("cap2")).toBe(4)
  })
})

// ── resetAllCapVoltages ───────────────────────────────────────────────

describe("resetAllCapVoltages", () => {
  test("clears every stored capacitor voltage", () => {
    setCapVoltage("cap1", 1)
    setCapVoltage("cap2", 2)
    setCapVoltage("cap3", 3)
    resetAllCapVoltages()
    expect(getCapVoltage("cap1")).toBe(0)
    expect(getCapVoltage("cap2")).toBe(0)
    expect(getCapVoltage("cap3")).toBe(0)
  })

  test("is a no-op on an empty store", () => {
    expect(() => resetAllCapVoltages()).not.toThrow()
  })
})
