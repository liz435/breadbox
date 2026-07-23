/**
 * Strip ids for surface boards.
 *
 * A "strip" is the electrical net for a contiguous run of holes that share a
 * single conductor underneath. On a breadboard, each row has two terminal
 * strips (5 holes each) plus four power-rail strips on each side. A wire
 * endpoint references a strip id; the net resolver groups endpoints by
 * (boardId, stripId).
 *
 * Strip ids are stable string constants — they survive component moves and
 * rotations. They never overlap with Arduino pin ids like "d2" or "a0",
 * which appear in the same `fromStrip`/`toStrip` slot when the endpoint's
 * `fromBoardId`/`toBoardId` is an MCU board.
 */

// ── breadboard_full (830-tie, split rails) ───────────────────────

/**
 * Number of terminal rows on the main grid (0-indexed). Full-size "830
 * tie-point" board: 63 rows × 10 terminal holes (630) + 4 rails × 50 (200) =
 * 830. Kept in sync with the app renderer's ROWS (see breadboard-constants).
 */
export const BREADBOARD_FULL_ROWS = 63;

/** Cols 0–4 = left terminal strip; cols 5–9 = right terminal strip. */
export const BREADBOARD_TERMINAL_HALF_WIDTH = 5;

/**
 * Strip id for a terminal hole on `breadboard_full`. Each row has two
 * strips: left (cols 0-4) and right (cols 5-9), separated by the centre
 * channel.
 */
export function breadboardTerminalStripId(row: number, col: number): string {
  const side = col < BREADBOARD_TERMINAL_HALF_WIDTH ? "left" : "right";
  return `term_${row}_${side}`;
}

/**
 * Power-rail strips. Full-size breadboards split each rail in the middle
 * into two electrically isolated halves. Side = "top" | "bot" (top or
 * bottom rail group). Polarity = "pos" | "neg". Half = "l" | "r" (left or
 * right half of the rail group).
 */
export type RailSide = "top" | "bot";
export type RailPolarity = "pos" | "neg";
export type RailHalf = "l" | "r";

export function breadboardRailStripId(
  side: RailSide,
  polarity: RailPolarity,
  half: RailHalf,
): string {
  return `pwr_${side}_${polarity}_${half}`;
}

/** All terminal-strip ids on a `breadboard_full`. */
export function breadboardTerminalStripIds(): string[] {
  const ids: string[] = [];
  for (let row = 0; row < BREADBOARD_FULL_ROWS; row++) {
    ids.push(`term_${row}_left`, `term_${row}_right`);
  }
  return ids;
}

/** All power-rail strip ids on a `breadboard_full`. */
export function breadboardRailStripIds(): string[] {
  const ids: string[] = [];
  for (const side of ["top", "bot"] as const) {
    for (const pol of ["pos", "neg"] as const) {
      for (const half of ["l", "r"] as const) {
        ids.push(`pwr_${side}_${pol}_${half}`);
      }
    }
  }
  return ids;
}

/** All strip ids on a `breadboard_full` (terminals + rails). */
export function breadboardFullStripIds(): string[] {
  return [...breadboardTerminalStripIds(), ...breadboardRailStripIds()];
}

// ── perfboard_generic (24×18, all holes isolated) ─────────────────

export const PERFBOARD_GENERIC_COLS = 24;
export const PERFBOARD_GENERIC_ROWS = 18;

/** Each hole on a perfboard is its own electrically isolated strip. */
export function perfboardStripId(row: number, col: number): string {
  return `hole_${row}_${col}`;
}

export function perfboardGenericStripIds(): string[] {
  const ids: string[] = [];
  for (let row = 0; row < PERFBOARD_GENERIC_ROWS; row++) {
    for (let col = 0; col < PERFBOARD_GENERIC_COLS; col++) {
      ids.push(`hole_${row}_${col}`);
    }
  }
  return ids;
}

// ── Lookup helpers ────────────────────────────────────────────────

/**
 * Resolve a (row, col) on the implicit legacy single-breadboard to its
 * strip id. Mirrors the bus-equivalence rules used by the legacy
 * `diagram-validator.ts`. Used by the migration script to convert legacy
 * wire endpoints `{fromRow, fromCol}` to `fromStrip`.
 *
 * Legacy col conventions (from the boardComponent schema doc):
 * - Cols 0–9: main terminal grid (left half 0-4, right half 5-9)
 * - Cols -2, -1: top power rail (negative=-2, positive=-1) — split half: row mod
 * - Cols 10, 11: bottom power rail (negative=10, positive=11) — split half: row mod
 *
 * Rail polarity follows the board silkscreen: every pair reads − then +
 * left to right, so -2/10 are negative and -1/11 positive (the same
 * convention as isPositiveRailCol in the app's breadboard-grid).
 *
 * For rail half selection: rows below the board's midpoint are the left
 * half, the rest the right half.
 */
export function legacyRowColToStripId(row: number, col: number): string | null {
  if (row >= 0 && row < BREADBOARD_FULL_ROWS && col >= 0 && col <= 9) {
    return breadboardTerminalStripId(row, col);
  }
  // Power rails: cols -2, -1, 10, 11 (legacy convention).
  if (col === -2 || col === -1 || col === 10 || col === 11) {
    const polarity: RailPolarity = col === -1 || col === 11 ? "pos" : "neg";
    const side: RailSide = col < 0 ? "top" : "bot";
    const half: RailHalf = row < BREADBOARD_FULL_ROWS / 2 ? "l" : "r";
    return breadboardRailStripId(side, polarity, half);
  }
  return null;
}
