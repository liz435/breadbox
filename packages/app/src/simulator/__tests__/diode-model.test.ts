import { describe, test, expect } from "bun:test"
import {
  getLedDiodeModel,
  diodeModelLine,
  ledNetlistLines,
  type DiodeModelSpec,
} from "../diode-model"

// ── Helpers ──────────────────────────────────────────────────────────

const RED_MODEL: DiodeModelSpec = { name: "DLED_RED", is: 3.3e-17, n: 2.0, rs: 12 }

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
    // Rs is stamped as an explicit resistor, not in the .model line.
    expect(line).toBe(".model DLED_RED D(Is=3.3e-17 N=2)")
  })

  test("uses model name from spec", () => {
    const custom: DiodeModelSpec = { name: "MY_LED", is: 5e-9, n: 1.8, rs: 10 }
    const line = diodeModelLine(custom)
    expect(line).toContain("MY_LED")
    expect(line).toContain("Is=5e-9")
    expect(line).toContain("N=1.8")
  })
})

// ── ledNetlistLines (diode + series Rs) ───────────────────────────────

describe("ledNetlistLines", () => {
  test("emits a diode and a series Rs resistor joined by an internal node", () => {
    const { lines } = ledNetlistLines("led1", "net_a", "net_b", RED_MODEL)
    // Diode: anode → internal junction; Rs: junction → cathode.
    expect(lines[0]).toBe("D_led1 net_a led1_jx DLED_RED")
    expect(lines[1]).toBe("Rs_led1 led1_jx net_b 12")
  })

  test("keeps the diode named D_<id> so the solver reads its branch current", () => {
    const { lines } = ledNetlistLines("led1", "a", "b", RED_MODEL)
    expect(lines[0].startsWith("D_led1 ")).toBe(true)
  })

  test("returns the model line for the diode", () => {
    const { modelLine } = ledNetlistLines("led1", "a", "b", RED_MODEL)
    expect(modelLine).toBe(diodeModelLine(RED_MODEL))
  })
})
