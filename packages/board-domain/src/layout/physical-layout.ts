import { BREADBOARD_FULL_ROWS, resolveComponentPins } from "@dreamer/schemas";

export const AUTO_LAYOUT_ROW_GAP = 2;

const RAIL_END_SKIP = 2;
const RAIL_BLOCK_HOLES = 5;
const RAIL_BLOCK_PERIOD = RAIL_BLOCK_HOLES + 1;

export const SERVO_CASE_LENGTH_MM = 22.8;
export const SERVO_CASE_WIDTH_MM = 12.2;
export const SERVO_MOUNTING_EAR_LENGTH_MM = 4.7;
export const SERVO_SHAFT_FROM_TOP_MM = 6;
export const SERVO_HORN_REACH_MM = 15;
export const SERVO_CABLE_RUN_MM = 10;

export const PSU_BODY_OVERHANG_TOP_ROWS = 7.5;
export const PSU_BODY_OVERHANG_BOTTOM_ROWS = 1;

export type PhysicalLayoutComponent = {
  type: string;
  row: number;
  col: number;
};

export type VisualRowBounds = Readonly<{ top: number; bottom: number }>;

function railBlockStarts(): number[] {
  const starts: number[] = [];
  for (
    let start = RAIL_END_SKIP;
    start + RAIL_BLOCK_HOLES <= BREADBOARD_FULL_ROWS;
    start += RAIL_BLOCK_PERIOD
  ) {
    starts.push(start);
  }
  return starts;
}

/** Resolve an MB102 anchor to the two rail rows occupied by its pins. */
export function powerSupplyPinRows(anchorRow: number): [number, number] {
  const starts = railBlockStarts();
  const usable = starts.length > 1 ? starts.slice(1) : starts;
  const targetStart = anchorRow + PSU_BODY_OVERHANG_TOP_ROWS;
  let best = usable[0] ?? 0;
  for (const start of usable) {
    if (Math.abs(start - targetStart) <= Math.abs(best - targetStart)) best = start;
  }
  return [best, best + RAIL_BLOCK_HOLES - 1];
}

/** Pin-span height with explicit minimums for bodies larger than their pins. */
export function componentLayoutHeight(type: string): number {
  if (type === "power_supply") return 13;
  const minimumVisualHeight = type === "button" ? 2 : 1;
  try {
    const rows = Object.values(resolveComponentPins(type, 0, 0)).map((pin) => pin.row);
    if (rows.length === 0) return minimumVisualHeight;
    return Math.max(minimumVisualHeight, Math.max(...rows) - Math.min(...rows) + 1);
  } catch {
    return minimumVisualHeight;
  }
}

export function advanceAutoLayoutRow(type: string, row: number): number {
  return row + componentLayoutHeight(type) + AUTO_LAYOUT_ROW_GAP;
}

/** Exact board-row envelope used by the current top-down 2D renderers. */
export function component2DVisualRowBounds(type: string, row: number): VisualRowBounds {
  if (type === "power_supply") {
    const [topPinRow, bottomPinRow] = powerSupplyPinRows(row);
    return {
      top: topPinRow - PSU_BODY_OVERHANG_TOP_ROWS,
      bottom: bottomPinRow + PSU_BODY_OVERHANG_BOTTOM_ROWS,
    };
  }
  if (type === "servo") {
    const middlePinRow = row + 1;
    const caseTop = middlePinRow - SERVO_CASE_LENGTH_MM / 2 / 2.54;
    const caseBottom = middlePinRow + SERVO_CASE_LENGTH_MM / 2 / 2.54;
    const shaftRow = caseTop + SERVO_SHAFT_FROM_TOP_MM / 2.54;
    const hornReachRows = SERVO_HORN_REACH_MM / 2.54;
    return {
      // Include the horn's full 0°..180° sweep, not only its current pose. A
      // servo that starts clear must remain clear while its sketch is running.
      top: Math.min(
        caseTop - SERVO_MOUNTING_EAR_LENGTH_MM / 2.54,
        shaftRow - hornReachRows,
      ),
      bottom: Math.max(
        caseBottom + SERVO_MOUNTING_EAR_LENGTH_MM / 2.54,
        shaftRow + hornReachRows,
      ),
    };
  }
  return { top: row, bottom: row + componentLayoutHeight(type) };
}

/** Calibrated GLB envelope in board-row units. */
export function component3DVisualRowBounds(type: string, row: number): VisualRowBounds {
  if (type === "power_supply") return { top: row - 5, bottom: row + 13 };
  if (type === "servo") return { top: row + 12, bottom: row + 29 };
  return { top: row, bottom: row + componentLayoutHeight(type) };
}

/** Conservative clearance envelope: a placement must be safe in every viewport. */
export function componentPlacementRowBounds(type: string, row: number): VisualRowBounds {
  const twoD = component2DVisualRowBounds(type, row);
  const threeD = component3DVisualRowBounds(type, row);
  return {
    top: Math.min(twoD.top, threeD.top),
    bottom: Math.max(twoD.bottom, threeD.bottom),
  };
}

export function visualRowBoundsOverlap(a: VisualRowBounds, b: VisualRowBounds): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

function physicallyOverlaps(
  a: PhysicalLayoutComponent,
  b: PhysicalLayoutComponent,
): boolean {
  if (a.type !== "power_supply" && b.type !== "power_supply") return false;
  return visualRowBoundsOverlap(
    componentPlacementRowBounds(a.type, a.row),
    componentPlacementRowBounds(b.type, b.row),
  );
}

/** Find the first row whose physical envelope is clear in both 2D and 3D. */
export function findAutoLayoutRow(
  type: string,
  startRow: number,
  occupied: readonly PhysicalLayoutComponent[],
): number | null {
  const maxAnchorRow = Math.max(0, BREADBOARD_FULL_ROWS - componentLayoutHeight(type));
  const rows = Array.from({ length: maxAnchorRow + 1 }, (_, row) => row);
  const normalizedStart = Math.max(0, Math.min(maxAnchorRow, startRow));
  const ordered = [
    ...rows.filter((row) => row >= normalizedStart),
    ...rows.filter((row) => row < normalizedStart),
  ];
  for (const row of ordered) {
    const candidate = { type, row, col: 0 };
    if (!occupied.some((item) => physicallyOverlaps(candidate, item))) return row;
  }
  return null;
}
