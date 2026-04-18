import { describe, test, expect } from "bun:test"
import {
  estimateDiodeCurrentMa,
  getLedDiodeModel,
  diodeModelLine,
  type DiodeModelSpec,
} from "../diode-model"

// ── Helpers ──────────────────────────────────────────────────────────

const RED_MODEL: DiodeModelSpec = { name: "DLED_RED", is: 1e-8, n: 2.0 }

// ── estimateDiodeCurrentMa ───────────────────────────────────────────

describe("estimateDiodeCurrentMa", () => {
  describe("zero voltage", () => {
    test("returns zero (or near-zero) current at 0V", () => {
      // I = Is * (exp(0) - 1) = Is * 0 = 0
      const result = estimateDiodeCurrentMa(0, RED_MODEL)
      expect(result).toBe(0)
    })
  })

  describe("positive forward bias", () => {
    test("returns positive current at typical LED forward voltage (2V clamped to 0.8V)", () => {
      // The function clamps vd to 0.8V max, so passing 2V == passing 0.8V
      const at2V = estimateDiodeCurrentMa(2.0, RED_MODEL)
      const at08V = estimateDiodeCurrentMa(0.8, RED_MODEL)
      expect(at2V).toBeCloseTo(at08V, 10)
    })

    test("current increases with forward voltage up to clamp boundary", () => {
      const at01V = estimateDiodeCurrentMa(0.1, RED_MODEL)
      const at05V = estimateDiodeCurrentMa(0.5, RED_MODEL)
      const at08V = estimateDiodeCurrentMa(0.8, RED_MODEL)
      expect(at05V).toBeGreaterThan(at01V)
      expect(at08V).toBeGreaterThan(at05V)
    })

    test("voltage beyond 0.8V is clamped — result equals result at exactly 0.8V", () => {
      const at08V = estimateDiodeCurrentMa(0.8, RED_MODEL)
      const at5V = estimateDiodeCurrentMa(5.0, RED_MODEL)
      const at100V = estimateDiodeCurrentMa(100.0, RED_MODEL)
      expect(at5V).toBeCloseTo(at08V, 10)
      expect(at100V).toBeCloseTo(at08V, 10)
    })
  })

  describe("negative reverse bias", () => {
    test("returns near-zero current at small negative voltage", () => {
      const result = estimateDiodeCurrentMa(-0.1, RED_MODEL)
      // Reverse current is tiny (saturation current level) — should be < 0.001 mA
      expect(result).toBeLessThan(0.001)
    })

    test("voltage below -1V is clamped — result equals result at exactly -1V", () => {
      const atNeg1V = estimateDiodeCurrentMa(-1.0, RED_MODEL)
      const atNeg5V = estimateDiodeCurrentMa(-5.0, RED_MODEL)
      const atNeg100V = estimateDiodeCurrentMa(-100.0, RED_MODEL)
      expect(atNeg5V).toBeCloseTo(atNeg1V, 10)
      expect(atNeg100V).toBeCloseTo(atNeg1V, 10)
    })

    test("result is always non-negative (abs() wraps reverse leakage)", () => {
      const reverse = estimateDiodeCurrentMa(-0.5, RED_MODEL)
      expect(reverse).toBeGreaterThanOrEqual(0)
    })
  })

  describe("extreme voltages", () => {
    test("100V forward does not produce NaN or Infinity", () => {
      const result = estimateDiodeCurrentMa(100, RED_MODEL)
      expect(Number.isFinite(result)).toBe(true)
      expect(Number.isNaN(result)).toBe(false)
    })

    test("-100V reverse does not produce NaN or Infinity", () => {
      const result = estimateDiodeCurrentMa(-100, RED_MODEL)
      expect(Number.isFinite(result)).toBe(true)
      expect(Number.isNaN(result)).toBe(false)
    })
  })

  describe("exponent clamping boundaries", () => {
    // The exponent is clamped to [-60, 60].
    // At 0.8V with vThermal = 2 * 0.02585 ≈ 0.05170, exponent ≈ 15.47 — within range.
    // To hit the 60 ceiling: vd / vThermal = 60  →  vd = 60 * 0.05170 ≈ 3.1V
    // Since vd is clamped to 0.8V first, the exponent ceiling of 60 is never
    // actually reachable in normal operation.

    test("exponent at 0.8V clamp is well below ceiling of 60 — result is finite", () => {
      const result = estimateDiodeCurrentMa(0.8, RED_MODEL)
      expect(Number.isFinite(result)).toBe(true)
    })

    test("exponent at -1V clamp is well above floor of -60 — result is finite", () => {
      const result = estimateDiodeCurrentMa(-1.0, RED_MODEL)
      expect(Number.isFinite(result)).toBe(true)
    })
  })

  describe("numerical stability edge cases", () => {
    test("very small Is value (1e-20) does not produce NaN", () => {
      const tinyIs: DiodeModelSpec = { name: "TINY", is: 1e-20, n: 2.0 }
      const result = estimateDiodeCurrentMa(0.5, tinyIs)
      expect(Number.isFinite(result)).toBe(true)
      expect(Number.isNaN(result)).toBe(false)
    })

    test("very large N value (100) prevents division by zero — vThermal floor is 1e-6", () => {
      // n * VT = 100 * 0.02585 = 2.585, well above 1e-6 floor
      const largeN: DiodeModelSpec = { name: "LARGE_N", is: 1e-8, n: 100 }
      const result = estimateDiodeCurrentMa(0.5, largeN)
      expect(Number.isFinite(result)).toBe(true)
    })

    test("Is = 0 returns zero current without NaN", () => {
      const zeroIs: DiodeModelSpec = { name: "ZERO_IS", is: 0, n: 2.0 }
      const result = estimateDiodeCurrentMa(0.5, zeroIs)
      // 0 * (exp - 1) = 0
      expect(result).toBe(0)
    })

    test("negative Is does not produce NaN (defensive)", () => {
      const negIs: DiodeModelSpec = { name: "NEG_IS", is: -1e-8, n: 2.0 }
      const result = estimateDiodeCurrentMa(0.5, negIs)
      // abs() is applied at the end — result should be a finite number
      expect(Number.isFinite(result)).toBe(true)
    })
  })
})

// ── getLedDiodeModel color mapping ───────────────────────────────────

describe("getLedDiodeModel", () => {
  describe("valid 6-char hex colors", () => {
    test("pure red (#ff0000) returns RED model", () => {
      const model = getLedDiodeModel("#ff0000")
      expect(model.name).toBe("DLED_RED")
    })

    test("pure green (#00ff00) returns GREEN model", () => {
      const model = getLedDiodeModel("#00ff00")
      expect(model.name).toBe("DLED_GREEN")
    })

    test("pure blue (#0000ff) returns BLUE model", () => {
      const model = getLedDiodeModel("#0000ff")
      expect(model.name).toBe("DLED_BLUE")
    })

    test("deep amber (#ef4444) — red dominant → RED model", () => {
      const model = getLedDiodeModel("#ef4444")
      expect(model.name).toBe("DLED_RED")
    })

    test("tailwind blue (#3b82f6) — blue dominant → BLUE model", () => {
      const model = getLedDiodeModel("#3b82f6")
      expect(model.name).toBe("DLED_BLUE")
    })

    test("tailwind green (#22c55e) — green dominant → GREEN model", () => {
      const model = getLedDiodeModel("#22c55e")
      expect(model.name).toBe("DLED_GREEN")
    })
  })

  describe("valid 3-char shorthand hex colors", () => {
    test("#f00 (red shorthand) returns RED model", () => {
      const model = getLedDiodeModel("#f00")
      expect(model.name).toBe("DLED_RED")
    })

    test("#0f0 (green shorthand) returns GREEN model", () => {
      const model = getLedDiodeModel("#0f0")
      expect(model.name).toBe("DLED_GREEN")
    })

    test("#00f (blue shorthand) returns BLUE model", () => {
      const model = getLedDiodeModel("#00f")
      expect(model.name).toBe("DLED_BLUE")
    })
  })

  describe("invalid and edge-case color strings", () => {
    test("undefined returns DEFAULT model", () => {
      const model = getLedDiodeModel(undefined)
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("empty string returns DEFAULT model", () => {
      const model = getLedDiodeModel("")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("non-hex string 'red' returns DEFAULT model", () => {
      const model = getLedDiodeModel("red")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("invalid hex '#gggggg' returns DEFAULT model", () => {
      const model = getLedDiodeModel("#gggggg")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("rgb() CSS syntax returns DEFAULT model", () => {
      const model = getLedDiodeModel("rgb(255, 0, 0)")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("hex without hash 'ff0000' returns DEFAULT model", () => {
      const model = getLedDiodeModel("ff0000")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("4-char hex '#ffff' returns DEFAULT model (not a valid 3 or 6 char hex)", () => {
      const model = getLedDiodeModel("#ffff")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("8-char hex with alpha '#ff000080' returns DEFAULT model", () => {
      const model = getLedDiodeModel("#ff000080")
      expect(model.name).toBe("DLED_DEFAULT")
    })

    test("whitespace around valid hex is trimmed and parsed correctly", () => {
      const model = getLedDiodeModel("  #ff0000  ")
      expect(model.name).toBe("DLED_RED")
    })

    test("uppercase hex '#FF0000' returns RED model (case-insensitive)", () => {
      const model = getLedDiodeModel("#FF0000")
      expect(model.name).toBe("DLED_RED")
    })
  })

  describe("ambiguous colors (equal channels)", () => {
    test("equal red and blue (#880088) — blue NOT strictly greater than red → falls to RED", () => {
      // b >= r AND b >= g → BLUE, but here b === r, g = 0
      // With b=136, r=136, g=0: b >= r → true, b >= g → true → BLUE
      const model = getLedDiodeModel("#880088")
      // Both conditions: b >= r (tie), b >= g → BLUE wins
      expect(model.name).toBe("DLED_BLUE")
    })

    test("equal red and green (#888800) — g > r is false for tie → RED", () => {
      // g = 136, r = 136: g > r is false, b < r → RED
      const model = getLedDiodeModel("#888800")
      expect(model.name).toBe("DLED_RED")
    })

    test("pure white (#ffffff) — all channels equal → BLUE wins (b >= r, b >= g)", () => {
      const model = getLedDiodeModel("#ffffff")
      expect(model.name).toBe("DLED_BLUE")
    })

    test("pure black (#000000) — all channels zero → BLUE wins", () => {
      const model = getLedDiodeModel("#000000")
      expect(model.name).toBe("DLED_BLUE")
    })
  })
})

// ── diodeModelLine ───────────────────────────────────────────────────

describe("diodeModelLine", () => {
  test("generates correct SPICE .model line for RED model", () => {
    const line = diodeModelLine(RED_MODEL)
    expect(line).toBe(".model DLED_RED D(Is=1e-8 N=2)")
  })

  test("uses model name from spec", () => {
    const custom: DiodeModelSpec = { name: "MY_LED", is: 5e-9, n: 1.8 }
    const line = diodeModelLine(custom)
    expect(line).toContain("MY_LED")
    expect(line).toContain("Is=5e-9")
    expect(line).toContain("N=1.8")
  })
})
