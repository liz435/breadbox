import { z } from "zod";
import { boardTargetSchema, DEFAULT_BOARD_TARGET } from "./board-targets";

// Max pin index used by supported board targets (Mega analog A15 maps to D69).
export const MAX_ARDUINO_PIN = 69;

export const DEFAULT_SKETCH_CODE = `void setup() {
  // put your setup code here
}

void loop() {
  // put your main code here
}
`;

// ── Component Types ──────────────────────────────────────────────

const boardComponentTypeValues = [
  "arduino_uno",
  "arduino_nano",
  "arduino_mega_2560",
] as const;

export const boardComponentTypeSchema = z.enum(boardComponentTypeValues);
export type BoardComponentType = z.infer<typeof boardComponentTypeSchema>;

export const componentTypeSchema = z.enum([
  "led",
  "rgb_led",
  "button",
  "resistor",
  "capacitor",
  "ic",
  "potentiometer",
  "buzzer",
  "servo",
  "lcd_16x2",
  "seven_segment",
  "photoresistor",
  "temperature_sensor",
  "ultrasonic_sensor",
  "neopixel",
  "pir_sensor",
  "relay",
  "dc_motor",
  "dht_sensor",
  "ir_receiver",
  "shift_register",
  "oled_display",
  "power_supply",
  "multimeter",
  "wire",
  ...boardComponentTypeValues,
]);
export type ComponentType = z.infer<typeof componentTypeSchema>;

export const BOARD_COMPONENT_TYPES = boardComponentTypeValues;

export function isBoardComponentType(type: string): type is BoardComponentType {
  return (BOARD_COMPONENT_TYPES as readonly string[]).includes(type);
}

// ── Pin Mode ─────────────────────────────────────────────────────

export const pinModeSchema = z.enum(["INPUT", "OUTPUT", "INPUT_PULLUP", "UNSET"]);
export type PinMode = z.infer<typeof pinModeSchema>;

// ── Interrupt Mode ───────────────────────────────────────────────

export const interruptModeSchema = z.enum([
  "RISING",
  "FALLING",
  "CHANGE",
  "LOW",
  "NONE",
]);
export type InterruptMode = z.infer<typeof interruptModeSchema>;

// ── Pin State ────────────────────────────────────────────────────

export const pinStateSchema = z.object({
  pin: z.number().int().min(0).max(MAX_ARDUINO_PIN),
  mode: pinModeSchema,
  digitalValue: z.number().int().min(0).max(1),
  analogValue: z.number().int().min(0).max(1023),
  pwmValue: z.number().int().min(0).max(255),
  isPwm: z.boolean(),
  pwmFrequency: z.number().default(490),
  interruptMode: interruptModeSchema.default("NONE"),
});
export type PinState = z.infer<typeof pinStateSchema>;

// ── Library Object State ─────────────────────────────────────────

export const servoStateSchema = z.object({
  pin: z.number(),
  angle: z.number().min(0).max(180),
});
export type ServoState = z.infer<typeof servoStateSchema>;

export const lcdStateSchema = z.object({
  pins: z.array(z.number()),
  cols: z.number(),
  rows: z.number(),
  cursorCol: z.number(),
  cursorRow: z.number(),
  textBuffer: z.array(z.string()),
  // Backlight & cursor display state
  backlight: z.boolean().default(true),
  displayOn: z.boolean().default(true),
  cursorVisible: z.boolean().default(false),
  cursorBlink: z.boolean().default(false),
  // Text entry direction: 1 = left-to-right, -1 = right-to-left
  direction: z.number().default(1),
  autoscroll: z.boolean().default(false),
  // Display scroll offset (HD44780 has 40-char DDRAM per row, 16 visible)
  scrollOffset: z.number().default(0),
  // CGRAM: 8 custom characters, each 8 rows of 5-bit pixel data (0–31)
  cgram: z.array(z.array(z.number()).length(8)).length(8).default(
    Array.from({ length: 8 }, () => Array<number>(8).fill(0)),
  ),
});
export type LcdState = z.infer<typeof lcdStateSchema>;

export const oledStateSchema = z.object({
  width: z.number().default(128),
  height: z.number().default(64),
  on: z.boolean().default(false),
  inverted: z.boolean().default(false),
  // 1024 bytes = 8 pages × 128 columns. SSD1306 GDDRAM layout: each byte is a
  // vertical 8-pixel column-strip with bit 0 on top (datasheet §8.7 / Fig 8-17).
  // The simulator mutates a backing Uint8Array and exposes this number[] view;
  // the same reference is reused frame-to-frame and only swapped when the
  // framebuffer actually changes (downstream React reference-equality skip).
  framebuffer: z.array(z.number()).length(1024).default(() => Array<number>(1024).fill(0)),
});
export type OledState = z.infer<typeof oledStateSchema>;

export const libraryStateSchema = z.object({
  servos: z.record(z.string(), servoStateSchema),
  lcd: lcdStateSchema.nullable().default(null),
  serialBaud: z.number().default(0),
  // Keyed by componentId (mirrors `servos`). I²C addresses aren't unique
  // across multiple soft-buses and the renderer locates by component.
  oled: z.record(z.string(), oledStateSchema).default({}),
});
export type LibraryState = z.infer<typeof libraryStateSchema>;

// Save-path schema: framebuffers are runtime-only, never persisted to disk.
export const persistedLibraryStateSchema = libraryStateSchema.omit({ oled: true });
export type PersistedLibraryState = z.infer<typeof persistedLibraryStateSchema>;

// ── Board Component ──────────────────────────────────────────────

export const boardComponentSchema = z.object({
  id: z.string().min(1),
  type: componentTypeSchema,
  name: z.string().min(1),
  x: z.number().int(), // breadboard grid column (0-9 for terminal, -2/-1/10/11 for power rails)
  y: z.number().int(), // breadboard grid row (0-29)
  rotation: z.number().default(0),
  pins: z.record(z.string(), z.number().nullable()), // component pin name -> Arduino pin number
  properties: z.record(z.string(), z.unknown()), // type-specific props
});
export type BoardComponent = z.infer<typeof boardComponentSchema>;

// ── Wire ─────────────────────────────────────────────────────────

export const wireSchema = z.object({
  id: z.string().min(1),
  fromRow: z.number(),
  fromCol: z.number(),
  // Optional metadata for Arduino-origin wires (fromRow === -999).
  // This disambiguates board-specific aliases (for example Mega D14 vs A0).
  fromBoardTarget: boardTargetSchema.optional(),
  fromPinLabel: z.string().optional(),
  fromPinCategory: z.enum(["digital", "analog", "power"]).optional(),
  toRow: z.number(),
  toCol: z.number(),
  color: z.string().default("#22c55e"),
});
export type Wire = z.infer<typeof wireSchema>;

// ── Custom Library ───────────────────────────────────────────────

export const customLibrarySchema = z.object({
  name: z.string().min(1),
  code: z.string(),
  description: z.string().default(""),
});
export type CustomLibrary = z.infer<typeof customLibrarySchema>;

// ── Environment (obstacles for sensor simulation) ───────────────

export const obstacleSchema = z.object({
  id: z.string().min(1),
  /** "wall" = line segment, "box" = axis-aligned rectangle */
  shape: z.enum(["wall", "box"]),
  /** For wall: endpoints. For box: top-left and bottom-right in pixel coords. */
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  label: z.string().default(""),
});
export type Obstacle = z.infer<typeof obstacleSchema>;

export const environmentSchema = z.object({
  obstacles: z.record(z.string(), obstacleSchema).default({}),
  /** When true, the breadboard boundary acts as a reflective wall. */
  boundaryEnabled: z.boolean().default(true),
  /** Extra margin (px) around the breadboard for the boundary walls. */
  boundaryMargin: z.number().default(100),
});
export type Environment = z.infer<typeof environmentSchema>;

// ── Board State ──────────────────────────────────────────────────
//
// `pinStates` was previously part of the persisted board state. It is now
// owned exclusively by the runtime `PinStateStore` (in the app package)
// and is NOT part of the saved project file. Legacy project files with a
// `pinStates` field will still parse — the schema uses `.passthrough()` for
// legacy fields and ignores unknown keys.

const boardStateBaseSchema = z.object({
  components: z.record(z.string(), boardComponentSchema),
  wires: z.record(z.string(), wireSchema),
  libraryState: libraryStateSchema.default({ servos: {}, lcd: null, serialBaud: 0, oled: {} }),
  // Supports legacy string[] format from old saves, normalises to {text, ts}.
  serialOutput: z.array(
    z.union([
      z.string().transform((s) => ({ text: s, ts: 0 })),
      z.object({ text: z.string(), ts: z.number() }),
    ])
  ).default([]),
  sketchCode: z.string(),
  customLibraries: z.record(z.string(), customLibrarySchema).default({}),
  // Selected board target for compile/upload/runtime mode decisions.
  // Optional for backward compatibility with older saved projects.
  boardTarget: boardTargetSchema.optional(),
  // Environment layer for sensor simulation (obstacles, walls).
  environment: environmentSchema.default({ obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 }),
});

// Accept legacy `pinStates` field but strip it. The final output type
// matches boardStateBaseSchema exactly.
export const boardStateSchema = boardStateBaseSchema;
export type BoardState = z.infer<typeof boardStateSchema>;

// ── Helper: create default pin states (20 pins) ─────────────────
//
// Kept as a compatibility helper for tests that still build PinState[]
// (e.g. circuit-solver.test.ts). Not used in runtime board state.

export function createDefaultPinStates(): PinState[] {
  return Array.from({ length: MAX_ARDUINO_PIN + 1 }, (_, i) => ({
    pin: i,
    mode: "UNSET" as const,
    digitalValue: 0,
    analogValue: 0,
    pwmValue: 0,
    isPwm: false,
    pwmFrequency: 490,
    interruptMode: "NONE" as const,
  }));
}

export function createDefaultBoardState(): BoardState {
  return {
    components: {},
    wires: {},
    libraryState: { servos: {}, lcd: null, serialBaud: 0, oled: {} },
    serialOutput: [],
    sketchCode: DEFAULT_SKETCH_CODE,
    customLibraries: {},
    boardTarget: DEFAULT_BOARD_TARGET,
    environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
  };
}
