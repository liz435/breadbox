// ── LED Diode Models ───────────────────────────────────────────────────────
//
// Shared helpers for selecting LED diode models, emitting SPICE `.model` lines,
// and estimating diode current from solved node voltages.

export type DiodeModelSpec = {
  name: string
  is: number
  n: number
}

const DIODE_MODELS = {
  RED: { name: "DLED_RED", is: 1e-8, n: 2.0 },
  GREEN: { name: "DLED_GREEN", is: 8e-9, n: 2.0 },
  BLUE: { name: "DLED_BLUE", is: 6e-9, n: 2.0 },
  RGB: { name: "DLED_RGB", is: 8e-9, n: 2.0 },
  DEFAULT: { name: "DLED_DEFAULT", is: 9e-9, n: 2.0 },
} as const satisfies Record<string, DiodeModelSpec>

const VT_300K = 0.02585

export function diodeModelLine(model: DiodeModelSpec): string {
  return `.model ${model.name} D(Is=${model.is} N=${model.n})`
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

/**
 * Match spicey's diode linearization bounds so UI current estimates stay in
 * sync with the solver's nonlinear stamping behavior.
 */
export function estimateDiodeCurrentMa(
  voltageDrop: number,
  model: DiodeModelSpec,
): number {
  const vThermal = Math.max(model.n * VT_300K, 1e-6)
  const vdLimited = Math.max(-1, Math.min(0.8, voltageDrop))
  const exponent = Math.max(-60, Math.min(60, vdLimited / vThermal))
  const currentA = model.is * (Math.exp(exponent) - 1)
  return Math.abs(currentA * 1000)
}
