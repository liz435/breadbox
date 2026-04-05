import type { BoardComponent, Wire } from "@dreamer/schemas";

/**
 * Standard breadboard layout:
 * - Terminal strips: 63 rows × 5 columns × 2 sides (a-e left, f-j right)
 * - Power rails: 2 rails × 2 sides (top +/-, bottom +/-)
 * - Center gap between columns e and f
 *
 * Grid coordinates use (row, col) where:
 * - row: 0-62 for terminal strips
 * - col: 0-9 for terminal strips (0-4 = left side, 5-9 = right side)
 * - Power rails use special col values: -2 (+ rail), -1 (- rail), 10 (+ rail), 11 (- rail)
 */

export type GridPoint = { row: number; col: number };
export type Net = { id: string; points: GridPoint[]; arduinoPins: number[] };

// ── Layout constants ──────────────────────────────────────────────

export const ROWS = 63;
export const COLS = 10; // 0-4 left, 5-9 right
export const HOLE_SPACING = 10; // px between hole centers
export const HOLE_RADIUS = 2.5;
export const GAP_WIDTH = 20; // px gap between left and right sides
export const RAIL_OFFSET = 30; // px offset for power rails from terminal area
export const BOARD_PADDING = 30; // px padding around the board

// Computed dimensions
export const TERMINAL_WIDTH = 4 * HOLE_SPACING; // 5 holes, 4 gaps
export const BOARD_WIDTH =
  BOARD_PADDING * 2 +
  TERMINAL_WIDTH + // left side (cols 0-4)
  GAP_WIDTH +
  TERMINAL_WIDTH; // right side (cols 5-9)

export const BOARD_HEIGHT = BOARD_PADDING * 2 + (ROWS - 1) * HOLE_SPACING;

// ── Coordinate conversion ─────────────────────────────────────────

export function gridToPixel(point: GridPoint): { x: number; y: number } {
  const { row, col } = point;
  const y = BOARD_PADDING + row * HOLE_SPACING;

  // Power rails
  if (col === -2) return { x: BOARD_PADDING - RAIL_OFFSET, y };
  if (col === -1) return { x: BOARD_PADDING - RAIL_OFFSET + HOLE_SPACING, y };
  if (col === 10)
    return {
      x: BOARD_PADDING + TERMINAL_WIDTH + GAP_WIDTH + TERMINAL_WIDTH + RAIL_OFFSET - HOLE_SPACING,
      y,
    };
  if (col === 11)
    return {
      x: BOARD_PADDING + TERMINAL_WIDTH + GAP_WIDTH + TERMINAL_WIDTH + RAIL_OFFSET,
      y,
    };

  // Terminal strips
  if (col >= 0 && col <= 4) {
    return { x: BOARD_PADDING + col * HOLE_SPACING, y };
  }
  if (col >= 5 && col <= 9) {
    return {
      x: BOARD_PADDING + TERMINAL_WIDTH + GAP_WIDTH + (col - 5) * HOLE_SPACING,
      y,
    };
  }

  return { x: 0, y: 0 };
}

export function pixelToGrid(px: number, py: number): GridPoint {
  const row = Math.round((py - BOARD_PADDING) / HOLE_SPACING);
  const clampedRow = Math.max(0, Math.min(ROWS - 1, row));

  // Determine which side based on x
  const leftStart = BOARD_PADDING;
  const leftEnd = BOARD_PADDING + TERMINAL_WIDTH;
  const rightStart = BOARD_PADDING + TERMINAL_WIDTH + GAP_WIDTH;
  const rightEnd = rightStart + TERMINAL_WIDTH;

  if (px >= leftStart - HOLE_SPACING / 2 && px <= leftEnd + HOLE_SPACING / 2) {
    const col = Math.round((px - BOARD_PADDING) / HOLE_SPACING);
    return { row: clampedRow, col: Math.max(0, Math.min(4, col)) };
  }

  if (px >= rightStart - HOLE_SPACING / 2 && px <= rightEnd + HOLE_SPACING / 2) {
    const col = Math.round((px - rightStart) / HOLE_SPACING) + 5;
    return { row: clampedRow, col: Math.max(5, Math.min(9, col)) };
  }

  // Default to nearest terminal side
  const midX = (leftEnd + rightStart) / 2;
  if (px < midX) {
    return { row: clampedRow, col: 4 };
  }
  return { row: clampedRow, col: 5 };
}

export function snapToGrid(px: number, py: number): GridPoint {
  return pixelToGrid(px, py);
}

// ── Connectivity ──────────────────────────────────────────────────

/**
 * In a real breadboard:
 * - Each row of 5 holes on the same side is internally connected
 * - Power rails run the full length
 * - The center gap separates left (0-4) and right (5-9) sides
 */
export function areConnected(a: GridPoint, b: GridPoint): boolean {
  // Same point
  if (a.row === b.row && a.col === b.col) return true;

  // Both on left terminal strip, same row
  if (
    a.row === b.row &&
    a.col >= 0 && a.col <= 4 &&
    b.col >= 0 && b.col <= 4
  ) {
    return true;
  }

  // Both on right terminal strip, same row
  if (
    a.row === b.row &&
    a.col >= 5 && a.col <= 9 &&
    b.col >= 5 && b.col <= 9
  ) {
    return true;
  }

  // Both on same power rail
  if (a.col === b.col && (a.col === -2 || a.col === -1 || a.col === 10 || a.col === 11)) {
    return true;
  }

  return false;
}

// ── Net resolution (union-find) ───────────────────────────────────

function pointKey(p: GridPoint): string {
  return `${p.row},${p.col}`;
}

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  find(key: string): string {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!result.has(root)) result.set(root, []);
      result.get(root)!.push(key);
    }
    return result;
  }
}

/**
 * Resolve which component pins are electrically connected through
 * the breadboard's internal bus + wires.
 */
export function resolveNets(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>
): Net[] {
  const uf = new UnionFind();

  // 1. Internal breadboard connections: each row of 5 on same side
  for (let row = 0; row < ROWS; row++) {
    // Left side: cols 0-4
    for (let col = 1; col <= 4; col++) {
      uf.union(pointKey({ row, col: 0 }), pointKey({ row, col }));
    }
    // Right side: cols 5-9
    for (let col = 6; col <= 9; col++) {
      uf.union(pointKey({ row, col: 5 }), pointKey({ row, col }));
    }
  }

  // Power rails: each rail is fully connected along its length
  for (let row = 1; row < ROWS; row++) {
    uf.union(pointKey({ row: 0, col: -2 }), pointKey({ row, col: -2 }));
    uf.union(pointKey({ row: 0, col: -1 }), pointKey({ row, col: -1 }));
    uf.union(pointKey({ row: 0, col: 10 }), pointKey({ row, col: 10 }));
    uf.union(pointKey({ row: 0, col: 11 }), pointKey({ row, col: 11 }));
  }

  // 2. Wire connections
  for (const wire of Object.values(wires)) {
    const from = pointKey({ row: wire.fromRow, col: wire.fromCol });
    const to = pointKey({ row: wire.toRow, col: wire.toCol });
    uf.union(from, to);
  }

  // 3. Collect nets and annotate with Arduino pin numbers from components
  const pinMap = new Map<string, number[]>(); // pointKey -> Arduino pin numbers
  for (const comp of Object.values(components)) {
    for (const [_pinName, arduinoPin] of Object.entries(comp.pins)) {
      if (arduinoPin != null) {
        const key = pointKey({ row: comp.y, col: comp.x });
        if (!pinMap.has(key)) pinMap.set(key, []);
        pinMap.get(key)!.push(arduinoPin);
      }
    }
  }

  const groups = uf.groups();
  const nets: Net[] = [];
  let netId = 0;

  for (const [, keys] of groups) {
    const points = keys.map((k) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col };
    });
    const arduinoPins: number[] = [];
    for (const key of keys) {
      const pins = pinMap.get(key);
      if (pins) arduinoPins.push(...pins);
    }
    if (arduinoPins.length > 0 || keys.length > 5) {
      // Only include nets that have component connections or cross wires
      nets.push({ id: `net-${netId++}`, points, arduinoPins: [...new Set(arduinoPins)] });
    }
  }

  return nets;
}
