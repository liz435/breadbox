import {
  DEFAULT_BOARD_TARGET,
  type BoardTarget,
  isBoardComponentType,
  type BoardComponent,
  type Wire,
} from "@dreamer/schemas";
import { getComponentDef } from "@/components/registry";

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

// ── Breadboard constants (re-exported from breadboard-constants for back-compat) ──
export {
  ROWS,
  COLS,
  HOLE_SPACING,
  HOLE_RADIUS,
  GAP_WIDTH,
  RAIL_OFFSET,
  ARDUINO_BOARD_WIDTH,
  ARDUINO_BOARD_HEIGHT,
  BOARD_PADDING,
} from "@/breadboard/breadboard-constants"
import {
  ROWS,
  HOLE_SPACING,
  GAP_WIDTH,
  RAIL_OFFSET,
  RAIL_PAIR_SPACING,
  RAIL_BLOCK_HOLES,
  ARDUINO_BOARD_WIDTH,
  ARDUINO_BOARD_HEIGHT,
  ARDUINO_BOARD_MARGIN,
  BOARD_PADDING,
} from "@/breadboard/breadboard-constants"

/** Empty rows kept at the very top and very bottom of each rail line. */
const RAIL_END_SKIP = 2

/** Rows carrying a power-rail hole. Matches a full-size breadboard's segmented
 *  rail: a RAIL_END_SKIP-row margin at each end, blocks of RAIL_BLOCK_HOLES
 *  holes separated by a single skipped row, and a wider break in the centre
 *  where the rail splits into its upper/lower half. The rail holes otherwise
 *  track the terminal rows one-to-one. */
const RAIL_ROWS: ReadonlySet<number> = (() => {
  const rows = new Set<number>()
  const period = RAIL_BLOCK_HOLES + 1 // 5 holes + 1 gap row
  const mid = Math.ceil(ROWS / 2)
  // Upper half: full blocks packed down from the top margin, staying above mid.
  for (let start = RAIL_END_SKIP; start + RAIL_BLOCK_HOLES <= mid; start += period) {
    for (let h = 0; h < RAIL_BLOCK_HOLES; h++) rows.add(start + h)
  }
  // Lower half: full blocks packed up from the bottom margin, staying below mid.
  const bottom = ROWS - 1 - RAIL_END_SKIP
  for (let end = bottom; end - RAIL_BLOCK_HOLES + 1 >= mid; end -= period) {
    for (let h = 0; h < RAIL_BLOCK_HOLES; h++) rows.add(end - h)
  }
  return rows
})()

/** True if a power-rail hole exists on this row (inside a block, not a gap). */
export function isRailRow(row: number): boolean {
  return RAIL_ROWS.has(row)
}

/** Which power-rail rows carry a hole, in order (for renderers that iterate). */
export function railRows(): number[] {
  return [...RAIL_ROWS].sort((a, b) => a - b)
}

// Breadboard offset: starts after the Arduino board
export const BREADBOARD_OFFSET_X =
  ARDUINO_BOARD_WIDTH + ARDUINO_BOARD_MARGIN;

// Computed dimensions for the breadboard itself
export const TERMINAL_WIDTH = 4 * HOLE_SPACING; // 5 holes, 4 gaps
const BREADBOARD_INNER_WIDTH =
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

// ── Arduino pin pixel positions ──────────────────────────────

type PinCategory = "digital" | "analog" | "power";

type ArduinoPinInfo = {
  label: string;
  pin: number; // Arduino pin number (board-dependent; can be up to 69 on Mega)
  x: number;
  y: number;
  isPwm?: boolean;
  category: PinCategory;
  labelSide?: "top" | "bottom" | "left" | "right";
};

const ARDUINO_X = 10; // left edge of the Uno board
const ARDUINO_Y = 20; // top edge of the Uno board

/**
 * The Uno artwork (assets/arduino-uno-board.svg, intrinsic 860×611) is drawn
 * into the 340×220 board box with preserveAspectRatio="meet": it scales to
 * 220/611 and centers horizontally. These helpers map artwork coordinates to
 * board space so every clickable pin dot lands exactly on its drawn socket.
 */
const UNO_ART_SCALE = ARDUINO_BOARD_HEIGHT / 611;
const UNO_ART_X = ARDUINO_X + (ARDUINO_BOARD_WIDTH - 860 * UNO_ART_SCALE) / 2;
const artX = (x: number) => UNO_ART_X + x * UNO_ART_SCALE;
const artY = (y: number) => ARDUINO_Y + y * UNO_ART_SCALE;

/**
 * Header socket centres in the artwork's SVG user units, measured from
 * headless Chromium and WebKit renders (both engines agree; macOS Quick
 * Look draws this file ~11% larger, so don't re-measure with qlmanage).
 * All headers share a 22.7-unit pitch. The top-left strip's first two
 * sockets are SCL/SDA and the power strip's first socket is unpopulated —
 * neither is modelled, so the anchors below start at the first socket we
 * expose.
 */
const UNO_PITCH = 22.7;
const UNO_TOP_HEADER_Y = 86.8; // digital header centreline
const UNO_BOTTOM_HEADER_Y = 523.2; // power/analog header centreline
const UNO_AREF_X = 336.8; // top-left strip: AREF, GND, D13..D8
const UNO_D7_X = 532.3; // top-right strip: D7..D0
const UNO_IOREF_X = 396.5; // power strip: IOREF, RESET, 3V3, 5V, GND, GND, VIN
const UNO_A0_X = 577.5; // analog strip: A0..A5

/**
 * Digital pins along the TOP edge, matching the silkscreen:
 * AREF, GND, D13..D8 on the left strip, D7..D0 on the right strip.
 */
function makeDigitalPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const pwmPins = new Set([3, 5, 6, 9, 10, 11]);
  const pinY = artY(UNO_TOP_HEADER_Y);

  for (let i = 0; i <= 13; i++) {
    const x =
      i >= 8
        ? artX(UNO_AREF_X + (2 + (13 - i)) * UNO_PITCH) // left strip after AREF, GND
        : artX(UNO_D7_X + (7 - i) * UNO_PITCH); // right strip
    pins.push({
      label: `D${i}${pwmPins.has(i) ? "~" : ""}`,
      pin: i,
      x,
      y: pinY,
      isPwm: pwmPins.has(i),
      category: "digital",
      labelSide: "top",
    });
  }
  pins.push({
    label: "GND",
    pin: -6,
    x: artX(UNO_AREF_X + UNO_PITCH),
    y: pinY,
    category: "power",
    labelSide: "top",
  });
  pins.push({
    label: "AREF",
    pin: -7,
    x: artX(UNO_AREF_X),
    y: pinY,
    category: "power",
    labelSide: "top",
  });
  return pins;
}

/**
 * Analog pins A0..A5 on the bottom-right header, left to right.
 */
function makeAnalogPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const pinY = artY(UNO_BOTTOM_HEADER_Y);
  for (let i = 0; i <= 5; i++) {
    pins.push({
      label: `A${i}`,
      pin: 14 + i,
      x: artX(UNO_A0_X + i * UNO_PITCH),
      y: pinY,
      category: "analog",
      labelSide: "bottom",
    });
  }
  return pins;
}

/**
 * Power pins on the bottom-left header:
 * IOREF, RESET, 3V3, 5V, GND, GND, VIN
 */
function makePowerPins(): ArduinoPinInfo[] {
  const pinY = artY(UNO_BOTTOM_HEADER_Y);
  const labels: Array<{ label: string; pin: number }> = [
    { label: "IOREF", pin: -8 },
    { label: "RESET", pin: -9 },
    { label: "3V3", pin: -2 },
    { label: "5V", pin: -1 },
    { label: "GND", pin: -3 },
    { label: "GND", pin: -4 },
    { label: "VIN", pin: -5 },
  ];
  return labels.map(({ label, pin }, i) => ({
    label,
    pin,
    x: artX(UNO_IOREF_X + i * UNO_PITCH),
    y: pinY,
    category: "power" as const,
    labelSide: "bottom" as const,
  }));
}

export const ARDUINO_DIGITAL_PINS = makeDigitalPins();
export const ARDUINO_ANALOG_PINS = makeAnalogPins();
export const ARDUINO_POWER_PINS = makePowerPins();
const ARDUINO_PINS: ArduinoPinInfo[] = [
  ...ARDUINO_DIGITAL_PINS,
  ...ARDUINO_ANALOG_PINS,
  ...ARDUINO_POWER_PINS,
];

export type { ArduinoPinInfo };

export type BoardPinLayout = {
  digitalPins: ArduinoPinInfo[];
  analogPins: ArduinoPinInfo[];
  powerPins: ArduinoPinInfo[];
  allPins: ArduinoPinInfo[];
};

function makeNanoDigitalPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const xLeft = ARDUINO_X + 99;
  const xRight = ARDUINO_X + 241;
  const startY = ARDUINO_Y + 24;
  const spacing = 10;
  const pwmPins = new Set([3, 5, 6, 9, 10, 11]);

  // Official Nano side-header ordering (USB at top):
  // Left side: D1, D0, RESET, GND, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12
  // Right side: D13, 3V3, AREF, A0, A1, A2, A3, A4, A5, A6, A7, 5V, RESET, GND, VIN
  const leftDigital: Array<{ slot: number; pin: number }> = [
    { slot: 0, pin: 1 },
    { slot: 1, pin: 0 },
    { slot: 4, pin: 2 },
    { slot: 5, pin: 3 },
    { slot: 6, pin: 4 },
    { slot: 7, pin: 5 },
    { slot: 8, pin: 6 },
    { slot: 9, pin: 7 },
    { slot: 10, pin: 8 },
    { slot: 11, pin: 9 },
    { slot: 12, pin: 10 },
    { slot: 13, pin: 11 },
    { slot: 14, pin: 12 },
  ];

  for (const { slot, pin } of leftDigital) {
    pins.push({
      label: `D${pin}${pwmPins.has(pin) ? "~" : ""}`,
      pin,
      x: xLeft,
      y: startY + slot * spacing,
      isPwm: pwmPins.has(pin),
      category: "digital",
      labelSide: "left",
    });
  }

  // D13 lives on the opposite side near USB on the official Nano.
  pins.push({
    label: "D13",
    pin: 13,
    x: xRight,
    y: startY + 0 * spacing,
    category: "digital",
    labelSide: "right",
  });

  return pins;
}

function makeNanoAnalogPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const xRight = ARDUINO_X + 241;
  const startY = ARDUINO_Y + 24;
  const spacing = 10;

  // A0..A5 align to slots 3..8 on the right header.
  for (let i = 0; i <= 5; i++) {
    pins.push({
      label: `A${i}`,
      pin: 14 + i,
      x: xRight,
      y: startY + (3 + i) * spacing,
      category: "analog",
      labelSide: "right",
    });
  }

  // Nano-specific analog-only channels
  pins.push({
    label: "A6",
    pin: 20,
    x: xRight,
    y: startY + 9 * spacing,
    category: "analog",
    labelSide: "right",
  });
  pins.push({
    label: "A7",
    pin: 21,
    x: xRight,
    y: startY + 10 * spacing,
    category: "analog",
    labelSide: "right",
  });
  return pins;
}

function makeNanoPowerPins(): ArduinoPinInfo[] {
  const xLeft = ARDUINO_X + 99;
  const xRight = ARDUINO_X + 241;
  const startY = ARDUINO_Y + 24;
  const spacing = 10;
  return [
    { label: "RESET", pin: -9, x: xLeft, y: startY + 2 * spacing, category: "power", labelSide: "left" },
    { label: "GND", pin: -3, x: xLeft, y: startY + 3 * spacing, category: "power", labelSide: "left" },
    { label: "3V3", pin: -2, x: xRight, y: startY + 1 * spacing, category: "power", labelSide: "right" },
    { label: "AREF", pin: -7, x: xRight, y: startY + 2 * spacing, category: "power", labelSide: "right" },
    { label: "5V", pin: -1, x: xRight, y: startY + 11 * spacing, category: "power", labelSide: "right" },
    { label: "GND", pin: -4, x: xRight, y: startY + 13 * spacing, category: "power", labelSide: "right" },
    { label: "VIN", pin: -5, x: xRight, y: startY + 14 * spacing, category: "power", labelSide: "right" },
  ];
}

function makeMegaDigitalPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const startX = ARDUINO_X + 52;
  const step = 12;
  const topY = ARDUINO_Y + 10;
  const midY = ARDUINO_Y + 184;
  const lowY = ARDUINO_Y + 198;
  // Mega PWM pins include 2-13 and 44-46.
  const pwmPins = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]);

  // Header 1/2 (top): D0..D21
  for (let pin = 0; pin <= 21; pin++) {
    pins.push({
      label: `D${pin}${pwmPins.has(pin) ? "~" : ""}`,
      pin,
      x: startX + pin * step,
      y: topY,
      isPwm: pwmPins.has(pin),
      category: "digital",
      labelSide: "top",
    });
  }

  // Header 3 (lower): D22..D37
  for (let pin = 22; pin <= 37; pin++) {
    pins.push({
      label: `D${pin}`,
      pin,
      x: startX + (pin - 22) * step,
      y: midY,
      category: "digital",
      labelSide: "top",
    });
  }

  // Header 4 (lower): D38..D53 (PWM on 44..46)
  for (let pin = 38; pin <= 53; pin++) {
    pins.push({
      label: `D${pin}${pwmPins.has(pin) ? "~" : ""}`,
      pin,
      x: startX + (pin - 38) * step,
      y: lowY,
      isPwm: pwmPins.has(pin),
      category: "digital",
      labelSide: "top",
    });
  }
  return pins;
}

function makeMegaAnalogPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const startX = ARDUINO_X + 160;
  const step = 11;
  const bottomY = ARDUINO_Y + ARDUINO_BOARD_HEIGHT - 10;
  for (let i = 0; i <= 15; i++) {
    pins.push({
      label: `A${i}`,
      pin: 54 + i,
      x: startX + i * step,
      y: bottomY,
      category: "analog",
      labelSide: "bottom",
    });
  }
  return pins;
}

function makeMegaPowerPins(): ArduinoPinInfo[] {
  const startX = ARDUINO_X + 52;
  const step = 12;
  const bottomY = ARDUINO_Y + ARDUINO_BOARD_HEIGHT - 10;
  return [
    { label: "3V3", pin: -2, x: startX + step * 0, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "5V", pin: -1, x: startX + step * 1, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "GND", pin: -3, x: startX + step * 2, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "GND", pin: -4, x: startX + step * 3, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "VIN", pin: -5, x: startX + step * 4, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "RESET", pin: -9, x: startX + step * 5, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "AREF", pin: -7, x: startX + step * 6, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "IOREF", pin: -8, x: startX + step * 7, y: bottomY, category: "power", labelSide: "bottom" },
  ];
}

// ── Raspberry Pi Pico layout ────────────────────────────────────────────
//
// Minimal functional layout — pin positions approximate the physical Pico
// (20 pins per side, DIP-40 form factor) so lessons can wire to the right
// pin numbers. Replace with SVG-backed positions when a real Pico board
// asset ships. Digital: GP0–GP28 as `D{n}`. Analog: GP26/27/28 as A0/A1/A2.
// GP29 is reserved for VSYS monitoring on the stock Pico pinout and is not
// exposed as a user-addressable pin.

const PICO_LEFT_GP_ORDER: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
const PICO_RIGHT_GP_ORDER: readonly number[] = [
  16, 17, 18, 19, 20, 21, 22, 26, 27, 28,
];
const PICO_ADC_PINS = new Set([26, 27, 28]);

function makePicoDigitalPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const xLeft = ARDUINO_X + 99;
  const xRight = ARDUINO_X + 241;
  const startY = ARDUINO_Y + 24;
  const spacing = 10;

  PICO_LEFT_GP_ORDER.forEach((pin, slot) => {
    if (PICO_ADC_PINS.has(pin)) return;
    pins.push({
      label: `D${pin}`,
      pin,
      x: xLeft,
      y: startY + slot * spacing,
      category: "digital",
      labelSide: "left",
    });
  });
  PICO_RIGHT_GP_ORDER.forEach((pin, slot) => {
    if (PICO_ADC_PINS.has(pin)) return;
    pins.push({
      label: `D${pin}`,
      pin,
      x: xRight,
      y: startY + slot * spacing,
      category: "digital",
      labelSide: "right",
    });
  });
  return pins;
}

function makePicoAnalogPins(): ArduinoPinInfo[] {
  const pins: ArduinoPinInfo[] = [];
  const xRight = ARDUINO_X + 241;
  const startY = ARDUINO_Y + 24;
  const spacing = 10;

  PICO_RIGHT_GP_ORDER.forEach((pin, slot) => {
    if (!PICO_ADC_PINS.has(pin)) return;
    const analogIndex = pin - 26; // GP26→A0, GP27→A1, GP28→A2
    pins.push({
      label: `A${analogIndex}`,
      pin,
      x: xRight,
      y: startY + slot * spacing,
      category: "analog",
      labelSide: "right",
    });
  });
  return pins;
}

function makePicoPowerPins(): ArduinoPinInfo[] {
  const startX = ARDUINO_X + 52;
  const step = 12;
  const bottomY = ARDUINO_Y + ARDUINO_BOARD_HEIGHT - 10;
  return [
    { label: "VBUS", pin: -5, x: startX + step * 0, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "VSYS", pin: -5, x: startX + step * 1, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "3V3", pin: -2, x: startX + step * 2, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "GND", pin: -3, x: startX + step * 3, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "GND", pin: -4, x: startX + step * 4, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "RUN", pin: -9, x: startX + step * 5, y: bottomY, category: "power", labelSide: "bottom" },
    { label: "AREF", pin: -7, x: startX + step * 6, y: bottomY, category: "power", labelSide: "bottom" },
  ];
}

const BOARD_PIN_LAYOUTS: Record<BoardTarget, BoardPinLayout> = {
  arduino_uno: {
    digitalPins: ARDUINO_DIGITAL_PINS,
    analogPins: ARDUINO_ANALOG_PINS,
    powerPins: ARDUINO_POWER_PINS,
    allPins: ARDUINO_PINS,
  },
  arduino_nano: (() => {
    const digitalPins = makeNanoDigitalPins();
    const analogPins = makeNanoAnalogPins();
    const powerPins = makeNanoPowerPins();
    return { digitalPins, analogPins, powerPins, allPins: [...digitalPins, ...analogPins, ...powerPins] };
  })(),
  arduino_mega_2560: (() => {
    const digitalPins = makeMegaDigitalPins();
    const analogPins = makeMegaAnalogPins();
    const powerPins = makeMegaPowerPins();
    return { digitalPins, analogPins, powerPins, allPins: [...digitalPins, ...analogPins, ...powerPins] };
  })(),
  rpi_pico: (() => {
    const digitalPins = makePicoDigitalPins();
    const analogPins = makePicoAnalogPins();
    const powerPins = makePicoPowerPins();
    return { digitalPins, analogPins, powerPins, allPins: [...digitalPins, ...analogPins, ...powerPins] };
  })(),
};

export function getBoardPinLayout(boardTarget: BoardTarget = DEFAULT_BOARD_TARGET): BoardPinLayout {
  return BOARD_PIN_LAYOUTS[boardTarget] ?? BOARD_PIN_LAYOUTS[DEFAULT_BOARD_TARGET];
}

// ── Coordinate conversion ─────────────────────────────────────

/** The x offset where the breadboard terminal area starts */
const TERMINAL_ORIGIN_X = BREADBOARD_OFFSET_X + BOARD_PADDING + RAIL_OFFSET;
/** The y offset where the terminal rows start (below top power rails) */
const TERMINAL_ORIGIN_Y = BOARD_PADDING + POWER_RAIL_HEIGHT;

/** Right edge x of the right terminal strip (col 9) */
const RIGHT_STRIP_ORIGIN_X = TERMINAL_ORIGIN_X + TERMINAL_WIDTH + GAP_WIDTH;

function gridToPixelUncached(point: GridPoint): { x: number; y: number } {
  const { row, col } = point;
  const y = TERMINAL_ORIGIN_Y + row * HOLE_SPACING;

  // Power rails
  if (col === -2) {
    return { x: TERMINAL_ORIGIN_X - RAIL_OFFSET + 4, y };
  }
  if (col === -1) {
    return { x: TERMINAL_ORIGIN_X - RAIL_OFFSET + 4 + RAIL_PAIR_SPACING, y };
  }
  if (col === 10) {
    return {
      x: TERMINAL_ORIGIN_X + BREADBOARD_INNER_WIDTH + RAIL_OFFSET - 4 - RAIL_PAIR_SPACING,
      y,
    };
  }
  if (col === 11) {
    return {
      x: TERMINAL_ORIGIN_X + BREADBOARD_INNER_WIDTH + RAIL_OFFSET - 4,
      y,
    };
  }

  // Left terminal strip (cols 0-4) — and extrapolate left for col < 0
  if (col <= 4) {
    return { x: TERMINAL_ORIGIN_X + col * HOLE_SPACING, y };
  }

  // Right terminal strip (cols 5-9) — and extrapolate right for col > 9
  return {
    x: RIGHT_STRIP_ORIGIN_X + (col - 5) * HOLE_SPACING,
    y,
  };
}

// Pre-computed pixel position cache for all valid grid points
const PIXEL_CACHE = new Map<string, { x: number; y: number }>();

function initPixelCache() {
  // Terminal holes + power rail holes
  for (let row = 0; row < ROWS; row++) {
    for (let col = -2; col <= 11; col++) {
      const key = `${row},${col}`;
      PIXEL_CACHE.set(key, gridToPixelUncached({ row, col }));
    }
  }
}

initPixelCache();

export function gridToPixel(point: GridPoint): { x: number; y: number } {
  const key = `${point.row},${point.col}`;
  const cached = PIXEL_CACHE.get(key);
  if (cached) return cached;
  // Off-grid points are computed on the fly (not cached)
  const pos = gridToPixelUncached(point);
  return pos;
}

/** Returns true if the grid point falls on the physical breadboard area. */
export function isOnBoard(point: GridPoint): boolean {
  const { row, col } = point;
  if (row < 0 || row >= ROWS) return false;
  if (col >= 0 && col <= 9) return true;
  // Power rails only carry holes inside their 5-hole blocks (gap rows don't).
  if (col === -2 || col === -1 || col === 10 || col === 11) return isRailRow(row);
  return false;
}

export function pixelToGrid(px: number, py: number): GridPoint {
  const row = Math.round((py - TERMINAL_ORIGIN_Y) / HOLE_SPACING);

  const leftStart = TERMINAL_ORIGIN_X;
  const leftEnd = TERMINAL_ORIGIN_X + TERMINAL_WIDTH;
  const rightStart = TERMINAL_ORIGIN_X + TERMINAL_WIDTH + GAP_WIDTH;
  const rightEnd = rightStart + TERMINAL_WIDTH;

  // Inside left terminal strip (cols 0-4)
  if (px >= leftStart - HOLE_SPACING / 2 && px <= leftEnd + HOLE_SPACING / 2) {
    const col = Math.round((px - TERMINAL_ORIGIN_X) / HOLE_SPACING);
    return { row, col: Math.max(0, Math.min(4, col)) };
  }

  // Inside right terminal strip (cols 5-9)
  if (px >= rightStart - HOLE_SPACING / 2 && px <= rightEnd + HOLE_SPACING / 2) {
    const col = Math.round((px - rightStart) / HOLE_SPACING) + 5;
    return { row, col: Math.max(5, Math.min(9, col)) };
  }

  // In the center gap — snap to nearest terminal side
  if (px >= leftEnd + HOLE_SPACING / 2 && px < rightStart - HOLE_SPACING / 2) {
    const midX = (leftEnd + rightStart) / 2;
    return { row, col: px < midX ? 4 : 5 };
  }

  // Off-board: to the left of the board → extrapolate left from col 0
  if (px < leftStart - HOLE_SPACING / 2) {
    const col = Math.round((px - TERMINAL_ORIGIN_X) / HOLE_SPACING);
    return { row, col };
  }

  // Off-board: to the right of the board → extrapolate right from col 5
  const col = Math.round((px - rightStart) / HOLE_SPACING) + 5;
  return { row, col };
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

/**
 * Rotate footprint points in 90° increments around the anchor point (first point).
 * rotation: 0 = 0°, 1 = 90° CW, 2 = 180°, 3 = 270° CW
 */
function rotateFootprint(fp: ComponentFootprint, rotation: number): ComponentFootprint {
  const r = ((rotation % 4) + 4) % 4;
  if (r === 0) return fp;

  const anchor = fp.points[0];
  const points = fp.points.map((pt) => {
    const dr = pt.row - anchor.row;
    const dc = pt.col - anchor.col;
    switch (r) {
      case 1: return { row: anchor.row + dc, col: anchor.col - dr }; // 90° CW
      case 2: return { row: anchor.row - dr, col: anchor.col - dc }; // 180°
      case 3: return { row: anchor.row - dc, col: anchor.col + dr }; // 270° CW
      default: return pt;
    }
  });

  const swapped = r === 1 || r === 3;
  return {
    points,
    width: swapped ? fp.height : fp.width,
    height: swapped ? fp.width : fp.height,
  };
}

export function getComponentFootprint(
  type: string,
  row: number,
  col: number,
  rotation?: number,
  properties?: Record<string, unknown>,
): ComponentFootprint {
  const def = getComponentDef(type)
  const base = def ? def.footprint(row, col, properties) : null;
  if (base) return rotation ? rotateFootprint(base, rotation) : base;

  let fallback: ComponentFootprint;
  // All cases handled by registry above; this switch is a legacy fallback.
  // Wrapped with rotation support at the end.
  switch (type) {
    case "led":
      fallback = { points: [{ row, col }, { row: row + 1, col }], width: HOLE_SPACING, height: HOLE_SPACING * 2 }; break;
    case "resistor":
      // Horizontal but straddling the center gap: one leg in the left half
      // (col 3), one leg in the right half (col 6). Keeps the legs in
      // separate nets on a real breadboard.
      fallback = { points: [{ row, col: 3 }, { row, col: 6 }], width: HOLE_SPACING * 5, height: HOLE_SPACING }; break;
    case "button":
      fallback = { points: [{ row, col: 3 }, { row: row + 1, col: 3 }, { row, col: 6 }, { row: row + 1, col: 6 }], width: GAP_WIDTH + HOLE_SPACING * 4, height: HOLE_SPACING * 2 }; break;
    case "capacitor":
      fallback = { points: [{ row, col }, { row: row + 2, col }], width: HOLE_SPACING, height: HOLE_SPACING * 3 }; break;
    case "ic": {
      const pinCount = 8;
      const rowCount = pinCount / 2;
      const pts: GridPoint[] = [];
      for (let r = 0; r < rowCount; r++) { pts.push({ row: row + r, col: 2 }); pts.push({ row: row + r, col: 7 }); }
      fallback = { points: pts, width: GAP_WIDTH + HOLE_SPACING * 6, height: HOLE_SPACING * rowCount }; break;
    }
    case "servo":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }], width: HOLE_SPACING * 3, height: HOLE_SPACING * 3 }; break;
    case "buzzer":
      fallback = { points: [{ row, col }, { row: row + 1, col }], width: HOLE_SPACING * 2, height: HOLE_SPACING * 2 }; break;
    case "potentiometer":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }], width: HOLE_SPACING * 3, height: HOLE_SPACING * 3 }; break;
    case "rgb_led":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }, { row: row + 3, col }], width: HOLE_SPACING, height: HOLE_SPACING * 4 }; break;
    case "photoresistor":
      fallback = { points: [{ row, col }, { row: row + 1, col }], width: HOLE_SPACING, height: HOLE_SPACING * 2 }; break;
    case "temperature_sensor":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }], width: HOLE_SPACING * 3, height: HOLE_SPACING * 3 }; break;
    case "ultrasonic_sensor":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }, { row: row + 3, col }], width: HOLE_SPACING * 4, height: HOLE_SPACING * 4 }; break;
    case "lcd_16x2":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }, { row: row + 3, col }, { row: row + 4, col }, { row: row + 5, col }], width: HOLE_SPACING * 6, height: HOLE_SPACING * 6 }; break;
    case "seven_segment":
      fallback = { points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }, { row: row + 3, col }, { row: row + 4, col }, { row: row + 5, col }, { row: row + 6, col }], width: HOLE_SPACING * 5, height: HOLE_SPACING * 7 }; break;
    default:
      fallback = { points: [{ row, col }], width: HOLE_SPACING * 2, height: HOLE_SPACING * 2 }; break;
  }
  return rotation ? rotateFootprint(fallback, rotation) : fallback;
}

// ── Connectivity ──────────────────────────────────────────────

/**
 * In a real breadboard:
 * - Each row of 5 holes on the same side is internally connected
 * - Power rails run the full length
 * - The center gap separates left (0-4) and right (5-9) sides
 *
 * TODO(multi-board-resolver): this signature has no notion of which board a
 * (row, col) belongs to. When multiple surface boards exist in components{}
 * (the schema supports it today), endpoints with the same row/col on
 * DIFFERENT boards will be reported as connected. The simulator,
 * netlist-builder, and pin resolver all silently produce wrong answers in
 * that case. Fix shape: accept `{ boardId, row, col }` and require boardId
 * equality before applying the bus-equivalence rules below. See the design
 * note in CLAUDE.md / branch web-bb-component (task #7).
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
 *
 * TODO(multi-board-resolver): clusters by `(row, col)` only — assumes a
 * single implicit breadboard. With multiple surface boards in components{}
 * the union-find merges nets across physically isolated boards. To fix:
 * cluster by `(boardId, stripId)` using each wire's fromStrip/toStrip when
 * present, and project every component footprint through its parentId to
 * a `(boardId, row, col)` tuple before unioning. The strip-id constants in
 * @dreamer/schemas (legacyRowColToStripId, breadboardFullStripIds, ...) are
 * already in place to receive this.
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

  // 3. Collect nets and annotate with Arduino pin numbers.
  //    Pin-to-net mappings come exclusively from WIRES (the -999 sentinel wires),
  //    NOT from component Inspector pin assignments. This means the circuit works
  //    purely from wire topology — users don't need to set pins in the Inspector
  //    for the SPICE solver to work.
  const pinMap = new Map<string, number[]>(); // pointKey -> Arduino pin numbers

  // From Arduino pin wires (the -999 sentinel wires)
  // Inject Arduino pin numbers into any grid point connected via the virtual key
  for (const [arduinoPinNumber, gridKeys] of arduinoPinToGridKeys) {
    for (const gridKey of gridKeys) {
      if (!pinMap.has(gridKey)) pinMap.set(gridKey, []);
      pinMap.get(gridKey)!.push(arduinoPinNumber);
    }
  }

  // Build set of all grid points occupied by component footprints
  const componentFootprintPoints = new Set<string>();
  for (const comp of Object.values(components)) {
    if (isBoardComponentType(comp.type) || comp.type === "wire") continue;
    const fp = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties);
    for (const pt of fp.points) {
      componentFootprintPoints.add(pointKey(pt));
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
    // Include nets that have Arduino pins OR that touch a component footprint point.
    // Previously filtered to realKeys.length > 5, which excluded single-row bus nets
    // critical for component-to-component connections (e.g., LED cathode row = resistor pin A row).
    const touchesComponent = points.some((pt) => componentFootprintPoints.has(pointKey(pt)));
    if (arduinoPins.length > 0 || touchesComponent) {
      nets.push({ id: `net-${netId++}`, points, arduinoPins: [...new Set(arduinoPins)] });
    }
  }

  return nets;
}
