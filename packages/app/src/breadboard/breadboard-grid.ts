import type { BoardComponent, Wire } from "@dreamer/schemas";

/**
 * Layout:
 *
 * ┌──────────────────┐  ┌────────────────────────────────────┐
 * │   ARDUINO UNO    │  │          BREADBOARD                │
 * │                  │  │  + rail  ─────────────────── + rail │
 * │  [D13] ... [D0]  │  │  - rail  ─────────────────── - rail │
 * │                  │  │                                    │
 * │  [A0] ... [A5]   │  │  a b c d e    f g h i j           │
 * │                  │  │  1 ○ ○ ○ ○ ○    ○ ○ ○ ○ ○ 1       │
 * │  [5V] [3.3V]    │  │  2 ○ ○ ○ ○ ○    ○ ○ ○ ○ ○ 2       │
 * │  [GND] [VIN]    │  │  ...                               │
 * │                  │  │  30 ○ ○ ○ ○ ○    ○ ○ ○ ○ ○ 30      │
 * └──────────────────┘  │  - rail  ─────────────────── - rail │
 *                       │  + rail  ─────────────────── + rail │
 *                       └────────────────────────────────────┘
 *
 * Grid coordinates use (row, col) where:
 * - row: 0-29 for terminal strips (30-row half-size breadboard)
 * - col: 0-9 for terminal strips (0-4 = left side a-e, 5-9 = right side f-j)
 * - Power rails use special col values: -2 (+ rail), -1 (- rail), 10 (+ rail), 11 (- rail)
 */

export type GridPoint = { row: number; col: number };
export type Net = { id: string; points: GridPoint[]; arduinoPins: number[] };

// ── Arduino Uno board constants ──────────────────────────────
export const ARDUINO_BOARD_WIDTH = 340;
export const ARDUINO_BOARD_HEIGHT = 220;
export const ARDUINO_BOARD_MARGIN = 20; // gap between Uno and breadboard

// ── Breadboard layout constants ──────────────────────────────
export const ROWS = 30; // half-size breadboard
export const COLS = 10; // 0-4 left (a-e), 5-9 right (f-j)
export const HOLE_SPACING = 14; // px between hole centers (larger for realism)
export const HOLE_RADIUS = 2.8;
export const GAP_WIDTH = 28; // px gap between left and right sides (center channel)
export const RAIL_OFFSET = 24; // px offset for power rails from terminal area
export const BOARD_PADDING = 40; // px padding around the board

// Breadboard offset: starts after the Arduino board
export const BREADBOARD_OFFSET_X =
  ARDUINO_BOARD_WIDTH + ARDUINO_BOARD_MARGIN;

// Computed dimensions for the breadboard itself
export const TERMINAL_WIDTH = 4 * HOLE_SPACING; // 5 holes, 4 gaps
export const BREADBOARD_INNER_WIDTH =
  TERMINAL_WIDTH + GAP_WIDTH + TERMINAL_WIDTH;
export const BREADBOARD_WIDTH =
  BOARD_PADDING * 2 + BREADBOARD_INNER_WIDTH + RAIL_OFFSET * 2;

// Power rails occupy space above and below the terminal area
export const POWER_RAIL_HEIGHT = 30; // px height for the top/bottom power rail sections
export const BREADBOARD_HEIGHT =
  BOARD_PADDING * 2 +
  POWER_RAIL_HEIGHT + // top rails
  (ROWS - 1) * HOLE_SPACING +
  POWER_RAIL_HEIGHT; // bottom rails

// Total canvas size
export const CANVAS_WIDTH = BREADBOARD_OFFSET_X + BREADBOARD_WIDTH;
export const CANVAS_HEIGHT = Math.max(ARDUINO_BOARD_HEIGHT + 40, BREADBOARD_HEIGHT);

// ── Arduino pin pixel positions ──────────────────────────────

type PinCategory = "digital" | "analog" | "power";

type ArduinoPinInfo = {
  label: string;
  pin: number; // Arduino pin number (0-19, where A0=14..A5=19)
  x: number;
  y: number;
  isPwm?: boolean;
  category: PinCategory;
};

const ARDUINO_PIN_SPACING = 14;
const ARDUINO_X = 10; // left edge of the Uno board
const ARDUINO_Y = 20; // top edge of the Uno board

/**
 * Digital pins along the TOP edge of the board.
 * Order (right to left): D0(RX), D1(TX), D2, D3~, D4, D5~, D6~, D7 | D8, D9~, D10~, D11~, D12, D13, GND, AREF
 * We lay them left-to-right in ascending pin order for rendering convenience,
 * with AREF and GND at the right end.
 */
function makeDigitalPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const pwmPins = new Set([3, 5, 6, 9, 10, 11]);
  const startX = ARDUINO_X + 56; // offset from left edge (past USB area)
  const pinY = ARDUINO_Y + 8; // near top edge

  // Digital pins D0..D13
  for (let i = 0; i <= 13; i++) {
    pins.push({
      label: `D${i}${pwmPins.has(i) ? "~" : ""}`,
      pin: i,
      x: startX + i * ARDUINO_PIN_SPACING,
      y: pinY,
      isPwm: pwmPins.has(i),
      category: "digital",
    });
  }
  // GND (near digital header)
  pins.push({
    label: "GND",
    pin: -6,
    x: startX + 14 * ARDUINO_PIN_SPACING,
    y: pinY,
    category: "power",
  });
  // AREF
  pins.push({
    label: "AREF",
    pin: -7,
    x: startX + 15 * ARDUINO_PIN_SPACING,
    y: pinY,
    category: "power",
  });
  return pins;
}

/**
 * Analog pins along the BOTTOM-RIGHT edge.
 * A0..A5 left to right.
 */
function makeAnalogPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const startX = ARDUINO_X + 182; // right portion of bottom edge
  const pinY = ARDUINO_Y + ARDUINO_BOARD_HEIGHT - 8; // near bottom edge
  for (let i = 0; i <= 5; i++) {
    pins.push({
      label: `A${i}`,
      pin: 14 + i,
      x: startX + i * ARDUINO_PIN_SPACING,
      y: pinY,
      category: "analog",
    });
  }
  return pins;
}

/**
 * Power pins along the BOTTOM-LEFT edge.
 * IOREF, RESET, 3V3, 5V, GND, GND, VIN
 */
function makePowerPins(): ArduinoPinInfo[] {
  const startX = ARDUINO_X + 56;
  const pinY = ARDUINO_Y + ARDUINO_BOARD_HEIGHT - 8;
  return [
    { label: "IOREF", pin: -8, x: startX, y: pinY, category: "power" },
    { label: "RESET", pin: -9, x: startX + ARDUINO_PIN_SPACING, y: pinY, category: "power" },
    { label: "3V3", pin: -2, x: startX + ARDUINO_PIN_SPACING * 2, y: pinY, category: "power" },
    { label: "5V", pin: -1, x: startX + ARDUINO_PIN_SPACING * 3, y: pinY, category: "power" },
    { label: "GND", pin: -3, x: startX + ARDUINO_PIN_SPACING * 4, y: pinY, category: "power" },
    { label: "GND", pin: -4, x: startX + ARDUINO_PIN_SPACING * 5, y: pinY, category: "power" },
    { label: "VIN", pin: -5, x: startX + ARDUINO_PIN_SPACING * 6, y: pinY, category: "power" },
  ];
}

export const ARDUINO_DIGITAL_PINS = makeDigitalPins();
export const ARDUINO_ANALOG_PINS = makeAnalogPins();
export const ARDUINO_POWER_PINS = makePowerPins();
export const ARDUINO_PINS: ArduinoPinInfo[] = [
  ...ARDUINO_DIGITAL_PINS,
  ...ARDUINO_ANALOG_PINS,
  ...ARDUINO_POWER_PINS,
];

export type { ArduinoPinInfo, PinCategory };

// ── Coordinate conversion ─────────────────────────────────────

/** The x offset where the breadboard terminal area starts */
const TERMINAL_ORIGIN_X = BREADBOARD_OFFSET_X + BOARD_PADDING + RAIL_OFFSET;
/** The y offset where the terminal rows start (below top power rails) */
const TERMINAL_ORIGIN_Y = BOARD_PADDING + POWER_RAIL_HEIGHT;

export function gridToPixel(point: GridPoint): { x: number; y: number } {
  const { row, col } = point;
  const y = TERMINAL_ORIGIN_Y + row * HOLE_SPACING;

  // Power rails (top rails: row < 0 maps to top area, row >= 0 maps normally)
  if (col === -2) {
    return { x: TERMINAL_ORIGIN_X - RAIL_OFFSET + 4, y };
  }
  if (col === -1) {
    return { x: TERMINAL_ORIGIN_X - RAIL_OFFSET + 4 + HOLE_SPACING, y };
  }
  if (col === 10) {
    return {
      x: TERMINAL_ORIGIN_X + BREADBOARD_INNER_WIDTH + RAIL_OFFSET - 4 - HOLE_SPACING,
      y,
    };
  }
  if (col === 11) {
    return {
      x: TERMINAL_ORIGIN_X + BREADBOARD_INNER_WIDTH + RAIL_OFFSET - 4,
      y,
    };
  }

  // Terminal strips
  if (col >= 0 && col <= 4) {
    return { x: TERMINAL_ORIGIN_X + col * HOLE_SPACING, y };
  }
  if (col >= 5 && col <= 9) {
    return {
      x: TERMINAL_ORIGIN_X + TERMINAL_WIDTH + GAP_WIDTH + (col - 5) * HOLE_SPACING,
      y,
    };
  }

  return { x: 0, y: 0 };
}

export function pixelToGrid(px: number, py: number): GridPoint {
  const row = Math.round((py - TERMINAL_ORIGIN_Y) / HOLE_SPACING);
  const clampedRow = Math.max(0, Math.min(ROWS - 1, row));

  const leftStart = TERMINAL_ORIGIN_X;
  const leftEnd = TERMINAL_ORIGIN_X + TERMINAL_WIDTH;
  const rightStart = TERMINAL_ORIGIN_X + TERMINAL_WIDTH + GAP_WIDTH;
  const rightEnd = rightStart + TERMINAL_WIDTH;

  if (px >= leftStart - HOLE_SPACING / 2 && px <= leftEnd + HOLE_SPACING / 2) {
    const col = Math.round((px - TERMINAL_ORIGIN_X) / HOLE_SPACING);
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

// ── Component footprints ─────────────────────────────────────

/**
 * Returns the grid points occupied by a component placed at (row, col).
 * This represents the physical pins/legs of the component on the breadboard.
 */
export type ComponentFootprint = {
  points: GridPoint[];
  /** Display width in pixels */
  width: number;
  /** Display height in pixels */
  height: number;
};

export function getComponentFootprint(
  type: string,
  row: number,
  col: number,
): ComponentFootprint {
  switch (type) {
    case "led":
      // 2 legs, adjacent rows same column
      return {
        points: [
          { row, col },
          { row: row + 1, col },
        ],
        width: HOLE_SPACING,
        height: HOLE_SPACING * 2,
      };
    case "resistor":
      // Spans 5 holes horizontally
      return {
        points: [
          { row, col },
          { row, col: col + 4 },
        ],
        width: HOLE_SPACING * 5,
        height: HOLE_SPACING,
      };
    case "button":
      // 4 pins in DIP: spans the center gap
      // left side (col 3,4) and right side (col 5,6)
      return {
        points: [
          { row, col: 3 },
          { row: row + 1, col: 3 },
          { row, col: 6 },
          { row: row + 1, col: 6 },
        ],
        width: GAP_WIDTH + HOLE_SPACING * 4,
        height: HOLE_SPACING * 2,
      };
    case "capacitor":
      // 2 legs, spaced 2 rows apart vertically
      return {
        points: [
          { row, col },
          { row: row + 2, col },
        ],
        width: HOLE_SPACING,
        height: HOLE_SPACING * 3,
      };
    case "ic": {
      // IC straddles center gap, pins on cols 2-7
      const pinCount = 8; // default, actual may vary
      const rowCount = pinCount / 2;
      const pts: GridPoint[] = [];
      for (let r = 0; r < rowCount; r++) {
        pts.push({ row: row + r, col: 2 });
        pts.push({ row: row + r, col: 7 });
      }
      return {
        points: pts,
        width: GAP_WIDTH + HOLE_SPACING * 6,
        height: HOLE_SPACING * rowCount,
      };
    }
    case "servo":
      // Takes 3 adjacent holes in a row
      return {
        points: [
          { row, col },
          { row, col: col + 1 },
          { row, col: col + 2 },
        ],
        width: HOLE_SPACING * 3,
        height: HOLE_SPACING * 3,
      };
    default:
      return {
        points: [{ row, col }],
        width: HOLE_SPACING * 2,
        height: HOLE_SPACING * 2,
      };
  }
}

// ── Connectivity ──────────────────────────────────────────────

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

// ── Net resolution (union-find) ───────────────────────────────

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
      root = this.parent.get(root) as string;
    }
    // Path compression
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current) as string;
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
      const group = result.get(root);
      if (group) group.push(key);
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
  // Track which grid points are connected to Arduino pins via -999 sentinel wires
  const arduinoPinToGridKeys = new Map<number, string[]>();

  for (const wire of Object.values(wires)) {
    if (wire.fromRow === -999) {
      // Arduino pin wire: fromCol is the Arduino pin number.
      // Union the target breadboard point with a virtual key for the Arduino pin,
      // so the target net gets the Arduino pin number injected.
      const arduinoPinNumber = wire.fromCol;
      const toKey = pointKey({ row: wire.toRow, col: wire.toCol });
      const virtualKey = `arduino-pin:${arduinoPinNumber}`;
      uf.union(virtualKey, toKey);

      // Track this association so we can inject the pin number into the net later
      if (!arduinoPinToGridKeys.has(arduinoPinNumber)) {
        arduinoPinToGridKeys.set(arduinoPinNumber, []);
      }
      arduinoPinToGridKeys.get(arduinoPinNumber)!.push(toKey);
    } else {
      const from = pointKey({ row: wire.fromRow, col: wire.fromCol });
      const to = pointKey({ row: wire.toRow, col: wire.toCol });
      uf.union(from, to);
    }
  }

  // 3. Collect nets and annotate with Arduino pin numbers from components
  const pinMap = new Map<string, number[]>(); // pointKey -> Arduino pin numbers

  // 3a. From component pin assignments
  for (const comp of Object.values(components)) {
    for (const [_pinName, arduinoPin] of Object.entries(comp.pins)) {
      if (arduinoPin != null) {
        const key = pointKey({ row: comp.y, col: comp.x });
        if (!pinMap.has(key)) pinMap.set(key, []);
        const pins = pinMap.get(key);
        if (pins) pins.push(arduinoPin);
      }
    }
  }

  // 3b. From Arduino pin wires (the -999 sentinel wires)
  // Inject Arduino pin numbers into any grid point connected via the virtual key
  for (const [arduinoPinNumber, gridKeys] of arduinoPinToGridKeys) {
    for (const gridKey of gridKeys) {
      if (!pinMap.has(gridKey)) pinMap.set(gridKey, []);
      pinMap.get(gridKey)!.push(arduinoPinNumber);
    }
  }

  const groups = uf.groups();
  const nets: Net[] = [];
  let netId = 0;

  for (const [, keys] of groups) {
    // Filter out virtual arduino-pin keys — they're not real grid points
    const realKeys = keys.filter((k) => !k.startsWith("arduino-pin:"));
    const points = realKeys.map((k) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col };
    });
    const arduinoPins: number[] = [];
    for (const key of keys) {
      // Check real grid keys for component pin mappings
      const pins = pinMap.get(key);
      if (pins) arduinoPins.push(...pins);
      // Check virtual arduino-pin keys — extract the pin number directly
      if (key.startsWith("arduino-pin:")) {
        const pinNum = parseInt(key.split(":")[1], 10);
        if (!isNaN(pinNum)) arduinoPins.push(pinNum);
      }
    }
    if (arduinoPins.length > 0 || realKeys.length > 5) {
      nets.push({ id: `net-${netId++}`, points, arduinoPins: [...new Set(arduinoPins)] });
    }
  }

  return nets;
}
