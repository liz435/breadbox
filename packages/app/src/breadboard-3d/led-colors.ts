// ── LED dome colours ─────────────────────────────────────────────────────────
//
// Shared by the 3D LED models (procedural + GLB). `properties.color` names map
// to a hex; an unrecognised string is used verbatim so custom hexes still work.

export const LED_COLORS: Record<string, string> = {
  red: "#e53935",
  green: "#43a047",
  blue: "#1e88e5",
  yellow: "#fdd835",
  orange: "#fb8c00",
  white: "#f5f5f5",
}

/** Resolve an LED's dome colour from its `color` property (default red). */
export function resolveLedColor(color: unknown): string {
  if (typeof color === "string") return LED_COLORS[color] ?? color
  return LED_COLORS.red
}
