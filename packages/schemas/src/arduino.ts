import { z } from "zod";
import { boardTargetSchema, DEFAULT_BOARD_TARGET } from "./board-targets";
import { assemblyDocSchema, createEmptyAssembly } from "./assembly";

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

// MCU boards (the dev board itself — has digital/analog pin headers).
const mcuBoardTypeValues = [
  "arduino_uno",
  "arduino_nano",
  "arduino_mega_2560",
] as const;

// Surface boards (host components on a grid — no MCU).
const surfaceBoardTypeValues = [
  "breadboard_full",
  "perfboard_generic",
] as const;

// All board-type components. "board" = anything in components{} that is itself
// a parent surface or MCU, as opposed to a regular discrete component. Wires
// reference these via from/toBoardId; non-board components have parentId
// pointing to a surface board.
const boardComponentTypeValues = [
  ...mcuBoardTypeValues,
  ...surfaceBoardTypeValues,
] as const;

export const boardComponentTypeSchema = z.enum(boardComponentTypeValues);
export type BoardComponentType = z.infer<typeof boardComponentTypeSchema>;

export const mcuBoardTypeSchema = z.enum(mcuBoardTypeValues);
export type McuBoardType = z.infer<typeof mcuBoardTypeSchema>;

export const surfaceBoardTypeSchema = z.enum(surfaceBoardTypeValues);
export type SurfaceBoardType = z.infer<typeof surfaceBoardTypeSchema>;

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
  "ir_remote",
  "shift_register",
  "oled_display",
  "power_supply",
  "multimeter",
  "wire",
  ...boardComponentTypeValues,
]);
export type ComponentType = z.infer<typeof componentTypeSchema>;

/**
 * A user-authored custom component type, namespaced so it can never collide
 * with a built-in. Validated structurally (kebab-case) rather than against a
 * fixed enum — the set is open and lives in the per-app custom-parts library.
 *
 * Runtime is a plain string+pattern schema so it stays representable in JSON
 * Schema (the validate_design / apply_design MCP tools serialize the diagram
 * schema). The inferred type is refined to the namespaced template literal so
 * BoardComponent.type remains a precise union and isCustomComponentType can
 * narrow — z.custom<...> would infer the right type but is JSON-unrepresentable.
 */
export const customComponentTypeSchema = z
  .string()
  .regex(/^custom:[a-z0-9-]+$/, "Custom component type must be custom:<kebab-name>") as unknown as z.ZodType<`custom:${string}`>;
export type CustomComponentType = z.infer<typeof customComponentTypeSchema>;

/** Any placeable component type: a built-in or a custom one. */
export const placeableComponentTypeSchema = z.union([
  componentTypeSchema,
  customComponentTypeSchema,
]);
export type PlaceableComponentType = z.infer<typeof placeableComponentTypeSchema>;

/** True for the `custom:<name>` namespace (user-authored parts). */
export function isCustomComponentType(type: string): type is CustomComponentType {
  return /^custom:[a-z0-9-]+$/.test(type);
}

export const BOARD_COMPONENT_TYPES = boardComponentTypeValues;
export const MCU_BOARD_TYPES = mcuBoardTypeValues;
export const SURFACE_BOARD_TYPES = surfaceBoardTypeValues;

export function isBoardComponentType(type: string): type is BoardComponentType {
  return (BOARD_COMPONENT_TYPES as readonly string[]).includes(type);
}

export function isMcuBoardType(type: string): type is McuBoardType {
  return (MCU_BOARD_TYPES as readonly string[]).includes(type);
}

export function isSurfaceBoardType(type: string): type is SurfaceBoardType {
  return (SURFACE_BOARD_TYPES as readonly string[]).includes(type);
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

export const neoPixelStateSchema = z.object({
  pin: z.number().int().min(0).max(MAX_ARDUINO_PIN),
  pixels: z.array(z.object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
  })),
});
export type NeoPixelState = z.infer<typeof neoPixelStateSchema>;

export const libraryStateSchema = z.object({
  servos: z.record(z.string(), servoStateSchema),
  lcd: lcdStateSchema.nullable().default(null),
  serialBaud: z.number().default(0),
  // Keyed by componentId (mirrors `servos`). I²C addresses aren't unique
  // across multiple soft-buses and the renderer locates by component.
  oled: z.record(z.string(), oledStateSchema).default({}),
  neopixels: z.record(z.string(), neoPixelStateSchema).default({}),
  // Custom-part behavior signals, keyed by componentId → signal name → value.
  // Published by the generic DSL peripheral; consumed by visual bindings.
  custom: z.record(z.string(), z.record(z.string(), z.number())).default({}),
});
export type LibraryState = z.infer<typeof libraryStateSchema>;

// Save-path schema: framebuffers and live signal values are runtime-only,
// never persisted to disk.
export const persistedLibraryStateSchema = libraryStateSchema.omit({ oled: true, neopixels: true, custom: true });
export type PersistedLibraryState = z.infer<typeof persistedLibraryStateSchema>;

// ── Board Component ──────────────────────────────────────────────

export const boardComponentSchema = z.object({
  id: z.string().min(1),
  type: placeableComponentTypeSchema,
  name: z.string().min(1),
  x: z.number().int(), // breadboard grid column (0-9 for terminal, -2/-1/10/11 for power rails)
  y: z.number().int(), // breadboard grid row (0-29)
  rotation: z.number().default(0),
  pins: z.record(z.string(), z.number().nullable()), // component pin name -> Arduino pin number
  properties: z.record(z.string(), z.unknown()), // type-specific props
  // Parent surface board (breadboard | perfboard). Null for board-type
  // components themselves (they live in world space, not on another board).
  // Optional during migration window — populated by migrator.
  parentId: z.string().nullable().optional(),
  // World coords for board-type components (where the board sits on the
  // canvas). Ignored for non-board components, which derive world position
  // from parent + grid (x, y).
  worldX: z.number().optional(),
  worldY: z.number().optional(),
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
  // Hybrid endpoint shape (post-multi-BB). Strip id resolves to a single net
  // on the named board. For Arduino, `strip` is the pin id (e.g. "d2", "a0").
  // For breadboard/perfboard, `strip` is a strip id (see strip-ids.ts).
  // Optional during migration window — populated by migrator.
  fromBoardId: z.string().optional(),
  fromStrip: z.string().optional(),
  toBoardId: z.string().optional(),
  toStrip: z.string().optional(),
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
  libraryState: libraryStateSchema.default({ servos: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {}, custom: {} }),
  // Supports legacy string[] format from old saves, normalises to {text, ts}.
  // `source` (optional, added v2.x) lets the Serial Monitor filter output by
  // origin when both the simulator AND a paired real board are emitting at
  // once. Older saves and entries written before the tagging shipped have
  // no source and are treated as "unknown" by the filter (always visible).
  serialOutput: z.array(
    z.union([
      z.string().transform((s) => ({
        text: s,
        ts: 0,
        source: undefined as "simulator" | "board" | undefined,
      })),
      z.object({
        text: z.string(),
        ts: z.number(),
        source: z.enum(["simulator", "board"]).optional(),
      }),
    ])
  ).default([]),
  sketchCode: z.string(),
  customLibraries: z.record(z.string(), customLibrarySchema).default({}),
  // Selected board target for compile/upload/runtime mode decisions.
  // Optional for backward compatibility with older saved projects.
  boardTarget: boardTargetSchema.optional(),
  // Environment layer for sensor simulation (obstacles, walls).
  environment: environmentSchema.default({ obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 }),
  // 3D assembly layer (uploaded meshes + joints/bindings) for the 3D view.
  // Optional so older saved projects (and BoardState literals that predate
  // the 3D view) parse unchanged; readers treat absence as empty.
  assembly: assemblyDocSchema.optional(),
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
    // Seed an explicit `breadboard-1`. Without this, the canvas renders a
    // legacy <StaticBackground/> fallback that vanishes the moment the user
    // places any explicit breadboard_full — making the "default" breadboard
    // appear to disappear. Treating it as a real component up front keeps
    // both the default and the newly placed board on screen.
    components: {
      "breadboard-1": {
        id: "breadboard-1",
        type: "breadboard_full",
        name: "Breadboard",
        x: 0,
        y: 0,
        rotation: 0,
        pins: {},
        properties: {},
        parentId: null,
        worldX: 0,
        worldY: 0,
      },
    },
    wires: {},
    libraryState: { servos: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {}, custom: {} },
    serialOutput: [],
    sketchCode: DEFAULT_SKETCH_CODE,
    customLibraries: {},
    boardTarget: DEFAULT_BOARD_TARGET,
    environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
    assembly: createEmptyAssembly(),
  };
}
