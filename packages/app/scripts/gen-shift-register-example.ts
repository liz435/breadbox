// Generator for the 74HC595 shift-register example board.
//
// The chip uses the real DIP-16 pinout (see resolveComponentPins in
// @dreamer/schemas), so the 8 outputs are split across both sides:
//   Left  col 2, rows R..R+7 = pins 1-8  = Q1,Q2,Q3,Q4,Q5,Q6,Q7,GND
//   Right col 7, rows R..R+7 = pins 16-9 = VCC,Q0,DS,/OE,STCP,SHCP,/MR,Q7'
//
// Each output Qi is fanned out to its own LED in a bank spaced 2 rows apart so
// the vertical LED footprints (anode row, cathode row) never collide. A series
// resistor straddles the centre gap; cathodes return to the negative rail.
//
// Run:  bun run packages/app/scripts/gen-shift-register-example.ts
// It prints the BoardState JSON to stdout for both the examples and learn dirs.

import {
  legacyRowColToStripId,
  type BoardState,
  type BoardComponent,
  type Wire,
} from "@dreamer/schemas"

const BREADBOARD_ID = "breadboard-1"
const ARDUINO_ID = "arduino-1"
const CHIP_ID = "sr-1"

const R = 1 // chip top row (occupies rows R..R+7)
const NEG_RAIL_COL = 11 // right-side negative power rail

// Arduino pins driving the chip (matches the sketch below).
const DATA_PIN = 8
const CLOCK_PIN = 11
const LATCH_PIN = 12

// Rainbow palette, Q0..Q7.
const LED_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

const components: Record<string, BoardComponent> = {}
const wires: Record<string, Wire> = {}

// ── Chip + boards ──────────────────────────────────────────────────────────
components[CHIP_ID] = {
  id: CHIP_ID,
  type: "shift_register",
  name: "74HC595",
  x: 2, // ignored — the chip always straddles cols 2/7
  y: R,
  rotation: 0,
  pins: { data: null, clock: null, latch: null },
  properties: {},
  parentId: BREADBOARD_ID,
}
components[BREADBOARD_ID] = {
  id: BREADBOARD_ID,
  type: "breadboard_full",
  name: "Breadboard",
  x: 0, y: 0, rotation: 0, pins: {}, properties: {},
  parentId: null, worldX: 0, worldY: 0,
}
components[ARDUINO_ID] = {
  id: ARDUINO_ID,
  type: "arduino_uno",
  name: "Arduino Uno",
  x: 0, y: 0, rotation: 0, pins: {}, properties: {},
  parentId: null, worldX: -300, worldY: 0,
}

// ── Wire helpers ─────────────────────────────────────────────────────────────
const POWER_STRIP: Record<number, string> = { [-1]: "5v", [-3]: "gnd" }

function arduinoWire(
  id: string,
  fromPin: number, // Arduino pin number, or -1 (5V) / -3 (GND)
  toRow: number,
  toCol: number,
  color: string,
): void {
  wires[id] = {
    id,
    fromRow: -999,
    fromCol: fromPin,
    toRow,
    toCol,
    color,
    fromBoardId: ARDUINO_ID,
    fromStrip: POWER_STRIP[fromPin] ?? `d${fromPin}`,
    toBoardId: BREADBOARD_ID,
    toStrip: legacyRowColToStripId(toRow, toCol) ?? `term_${toRow}_left`,
  }
}

function bbWire(
  id: string,
  fromRow: number, fromCol: number,
  toRow: number, toCol: number,
  color: string,
): void {
  wires[id] = {
    id,
    fromRow, fromCol, toRow, toCol, color,
    fromBoardId: BREADBOARD_ID,
    fromStrip: legacyRowColToStripId(fromRow, fromCol) ?? `term_${fromRow}_left`,
    toBoardId: BREADBOARD_ID,
    toStrip: legacyRowColToStripId(toRow, toCol) ?? `term_${toRow}_left`,
  }
}

// Right-column pin rows (col 7): VCC,Q0,DS,/OE,STCP,SHCP,/MR,Q7' = rows R..R+7.
const rowVcc = R + 0
const rowData = R + 2
const rowOe = R + 3
const rowLatch = R + 4
const rowClock = R + 5
const rowMr = R + 6
const rowGndPin = R + 7 // left col, pin 8

// Power + control wiring (land on col 9 = same right strip as the chip pin).
arduinoWire("w-vcc", -1, rowVcc, 9, "#ef4444")        // 5V → VCC (pin 16)
arduinoWire("w-mr", -1, rowMr, 9, "#ef4444")          // 5V → /MR (pin 10, no reset)
arduinoWire("w-oe", -3, rowOe, 9, "#1a1a1a")          // GND → /OE (pin 13, outputs on)
arduinoWire("w-gnd", -3, rowGndPin, 0, "#1a1a1a")     // GND → GND (pin 8)
arduinoWire("w-data", DATA_PIN, rowData, 9, "#fbbf24") // D8  → DS (pin 14)
arduinoWire("w-latch", LATCH_PIN, rowLatch, 9, "#22c55e") // D12 → STCP (pin 12)
arduinoWire("w-clock", CLOCK_PIN, rowClock, 9, "#3b82f6") // D11 → SHCP (pin 11)

// ── Output bank: one LED + resistor per Qi, fanned out, spaced 2 rows ────────
// Source hole for each output (a breadboard hole on that output's net):
//   Q0 sits on the RIGHT strip (col 7, row R+1) → tap col 9.
//   Q1..Q7 sit on the LEFT strip (col 2, rows R..R+6) → tap col 0.
const outputSource: Array<{ row: number; col: number }> = [
  { row: R + 1, col: 9 }, // Q0 (right side)
  { row: R + 0, col: 0 }, // Q1
  { row: R + 1, col: 0 }, // Q2
  { row: R + 2, col: 0 }, // Q3
  { row: R + 3, col: 0 }, // Q4
  { row: R + 4, col: 0 }, // Q5
  { row: R + 5, col: 0 }, // Q6
  { row: R + 6, col: 0 }, // Q7
]

const BANK_TOP = 10 // first LED anode row (below the chip, rows 1..8)
for (let i = 0; i < 8; i++) {
  const anodeRow = BANK_TOP + i * 2
  const cathodeRow = anodeRow + 1

  // Resistor straddles the gap on `anodeRow`: legA (col 3, left) ↔ legB (col 6, right).
  components[`r-${i}`] = {
    id: `r-${i}`,
    type: "resistor",
    name: `R${i}`,
    x: 3, y: anodeRow, rotation: 0,
    pins: { a: null, b: null },
    properties: { resistance: 220 },
    parentId: BREADBOARD_ID,
  }
  // LED: anode (anodeRow, col 8, right strip = resistor legB net), cathode below.
  components[`led-${i}`] = {
    id: `led-${i}`,
    type: "led",
    name: `LED Q${i}`,
    x: 8, y: anodeRow, rotation: 0,
    pins: { anode: null, cathode: null },
    properties: { color: LED_COLORS[i] },
    parentId: BREADBOARD_ID,
  }

  // Fan-out: output net → resistor legA (left strip of anodeRow, tap col 0).
  const src = outputSource[i]
  bbWire(`w-fan-${i}`, src.row, src.col, anodeRow, 0, "#a78bfa")
  // Cathode → negative rail.
  bbWire(`w-cath-${i}`, cathodeRow, 9, cathodeRow, NEG_RAIL_COL, "#64748b")
}

// Tie the negative rail to Arduino GND once.
arduinoWire("w-rail-gnd", -3, R + 1, NEG_RAIL_COL, "#1a1a1a")

const sketchCode = `// Example: Shift Register LED Chaser
// A 74HC595 turns 3 Arduino pins into 8 outputs. shiftOut() clocks one byte
// into the chip; the latch pin copies it to the output pins Q0..Q7.

int dataPin = ${DATA_PIN};   // DS   (pin 14)
int clockPin = ${CLOCK_PIN};  // SHCP (pin 11)
int latchPin = ${LATCH_PIN};  // STCP (pin 12)

void setup() {
  pinMode(dataPin, OUTPUT);
  pinMode(clockPin, OUTPUT);
  pinMode(latchPin, OUTPUT);
}

void loop() {
  for (int i = 0; i < 8; i++) {
    byte pattern = 1 << i;            // light one LED at a time
    digitalWrite(latchPin, LOW);
    shiftOut(dataPin, clockPin, MSBFIRST, pattern);
    digitalWrite(latchPin, HIGH);     // latch → Q0..Q7 update
    delay(200);
  }
}
`

const board: BoardState = {
  components,
  wires,
  libraryState: { servos: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {} },
  serialOutput: [],
  sketchCode,
  customLibraries: {},
} as BoardState

// Drop the runtime-only library fields the static examples don't carry.
const out = {
  components: board.components,
  wires: board.wires,
  libraryState: { servos: {}, lcd: null, serialBaud: 0 },
  serialOutput: [],
  sketchCode: board.sketchCode,
  customLibraries: {},
}

console.log(JSON.stringify(out, null, 2))
