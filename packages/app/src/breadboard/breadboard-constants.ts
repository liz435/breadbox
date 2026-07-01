// ── Breadboard Layout Constants ───────────────────────────────────────────
//
// Extracted into a separate file so both breadboard-grid.ts and the
// component registry can import them without circular dependencies.

export const ROWS = 30
export const COLS = 10
export const HOLE_SPACING = 14
export const HOLE_RADIUS = 2.5
export const GAP_WIDTH = 28
export const RAIL_OFFSET = 38

/**
 * Spacing between the two dot columns of a side power rail.
 * Tighter than HOLE_SPACING so the inner column sits back from the terminal
 * block (more breathing room) and the pair reads as a grouped rail.
 */
export const RAIL_PAIR_SPACING = 10
export const ARDUINO_BOARD_WIDTH = 340
export const ARDUINO_BOARD_HEIGHT = 220
export const ARDUINO_BOARD_MARGIN = 20
export const BOARD_PADDING = 40

// ── Derived sizing constants ────────────────────────────────────────────
// All component dimensions should derive from HOLE_SPACING so visuals
// stay proportional at any zoom level.

/** Standard dome radius for LEDs — half of HOLE_SPACING */
export const LED_DOME_RADIUS = HOLE_SPACING / 2

/** Buzzer/potentiometer radius — slightly less than HOLE_SPACING */
export const KNOB_RADIUS = Math.round(HOLE_SPACING * 0.72)

/** Generic fallback component dimensions */
export const GENERIC_BODY_WIDTH = HOLE_SPACING * 2
export const GENERIC_BODY_HEIGHT = HOLE_SPACING * 1.15

/** Standard leg/wire width for component leads */
export const LEG_WIDTH = 1.2

/** Standard font size for component name labels */
export const LABEL_FONT_SIZE = Math.max(4, Math.round(HOLE_SPACING * 0.43))

/** Standard font size for small annotations (pin labels, electrical readouts) */
export const ANNOTATION_FONT_SIZE = Math.max(3.5, Math.round(HOLE_SPACING * 0.32))
