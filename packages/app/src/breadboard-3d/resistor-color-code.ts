// ── Resistor colour code ─────────────────────────────────────────────────────
//
// Pure value→band-colours mapping for the 3D resistor. Kept separate from
// part-models.tsx (which imports the GLB asset + r3f) so it can be unit-tested
// in isolation.

/** Standard resistor colour code, indexed by digit value 0–9. */
export const RESISTOR_BAND_CODE = [
  "#1a1a1a", // 0 black
  "#8b4513", // 1 brown
  "#e00000", // 2 red
  "#ff8c00", // 3 orange
  "#f4d000", // 4 yellow
  "#12a112", // 5 green
  "#1b4de0", // 6 blue
  "#8b00ff", // 7 violet
  "#9a9a9a", // 8 grey
  "#f5f5f5", // 9 white
] as const

/**
 * Three-band colour code (two significant figures + a power-of-ten multiplier)
 * for a resistance in ohms. 220 → [red, red, brown]; 4.7k → [yellow, violet, red].
 * The 3D body has only three grooves, so there is no fourth (tolerance) band.
 * Guards: values are rounded and floored to 1 Ω; the multiplier clamps to 0–9.
 */
export function resistorBands(ohms: number): [string, string, string] {
  const value = Math.max(1, Math.round(ohms))
  const digits = value.toString()
  const d1 = Number(digits[0])
  const d2 = Number(digits[1] ?? "0")
  const multiplier = Math.max(0, Math.min(9, digits.length - 2))
  return [RESISTOR_BAND_CODE[d1], RESISTOR_BAND_CODE[d2], RESISTOR_BAND_CODE[multiplier]]
}
