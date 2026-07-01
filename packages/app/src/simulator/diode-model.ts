// ── LED Diode Models ───────────────────────────────────────────────────────
//
// Shared helpers for selecting LED diode models and emitting the SPICE lines
// that model an LED as a real junction in series with its bulk resistance Rs.

export type DiodeModelSpec = {
  name: string
  is: number
  n: number
  /** Bulk series resistance in ohms (contacts, bond wire, semiconductor bulk). */
  rs: number
}

// A real LED = an ideal (Shockley) junction in series with a few ohms of bulk
// resistance Rs. The junction sets the turn-on knee; Rs makes the forward
// voltage keep climbing with current (and limits current when overdriven),
// which a bare exponential can't reproduce.
//
// Is is anchored so the *terminal* forward voltage at 20mA matches datasheets:
//   Vf(20mA) = N·Vt·ln(0.02/Is) + 0.02·Rs,  with N·Vt = 2.0 × 0.02585 = 0.0517 V.
//   red ≈ 2.0V (Rs 12Ω), green ≈ 2.2V (Rs 15Ω), blue ≈ 3.2V (Rs 18Ω).
const DIODE_MODELS = {
  RED: { name: "DLED_RED", is: 3.3e-17, n: 2.0, rs: 12 },
  GREEN: { name: "DLED_GREEN", is: 2.2e-18, n: 2.0, rs: 15 },
  BLUE: { name: "DLED_BLUE", is: 2.8e-26, n: 2.0, rs: 18 },
  RGB: { name: "DLED_RGB", is: 1.5e-17, n: 2.0, rs: 15 },
  DEFAULT: { name: "DLED_DEFAULT", is: 3.3e-17, n: 2.0, rs: 12 },
} as const satisfies Record<string, DiodeModelSpec>

export function diodeModelLine(model: DiodeModelSpec): string {
  return `.model ${model.name} D(Is=${model.is} N=${model.n})`
}

/**
 * SPICE lines for an LED: an ideal diode `anode → junction` in series with the
 * bulk resistance `junction → cathode`. This is the same internal-node
 * decomposition SPICE uses for a diode's RS parameter — spicey has no native
 * RS, so we stamp it explicitly. `elementId` must already be sanitized; the
 * diode keeps the `D_<id>` name so the solver's element current reads back as
 * the LED's through-current.
 */
export function ledNetlistLines(
  elementId: string,
  anode: string,
  cathode: string,
  model: DiodeModelSpec,
): { lines: string[]; modelLine: string } {
  const junction = `${elementId}_jx`
  return {
    lines: [
      `D_${elementId} ${anode} ${junction} ${model.name}`,
      `Rs_${elementId} ${junction} ${cathode} ${model.rs}`,
    ],
    modelLine: diodeModelLine(model),
  }
}

function normalizeHexColor(color?: string): string | null {
  if (!color) return null
  const value = color.trim().toLowerCase()
  const short = /^#([0-9a-f]{3})$/.exec(value)
  if (short) {
    const [r, g, b] = short[1].split("")
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  return null
}

function parseHexRgb(color?: string): { r: number; g: number; b: number } | null {
  const hex = normalizeHexColor(color)
  if (!hex) return null
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

export function getLedDiodeModel(color?: string): DiodeModelSpec {
  const rgb = parseHexRgb(color)
  if (!rgb) return DIODE_MODELS.DEFAULT
  if (rgb.b >= rgb.r && rgb.b >= rgb.g) return DIODE_MODELS.BLUE
  if (rgb.g > rgb.r) return DIODE_MODELS.GREEN
  return DIODE_MODELS.RED
}

export function getRgbLedDiodeModel(): DiodeModelSpec {
  return DIODE_MODELS.RGB
}
