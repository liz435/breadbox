import { z } from "zod";

// ── Component Types ──────────────────────────────────────────────

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
  "wire",
  "arduino_uno",
]);
export type ComponentType = z.infer<typeof componentTypeSchema>;

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
  pin: z.number().int().min(0).max(19), // 0-13 digital, A0-A5 = 14-19
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
});
export type LcdState = z.infer<typeof lcdStateSchema>;

export const libraryStateSchema = z.object({
  servos: z.record(z.string(), servoStateSchema),
  lcd: lcdStateSchema.nullable().default(null),
  serialBaud: z.number().default(0),
});
export type LibraryState = z.infer<typeof libraryStateSchema>;

// ── Board Component ──────────────────────────────────────────────

export const boardComponentSchema = z.object({
  id: z.string().min(1),
  type: componentTypeSchema,
  name: z.string().min(1),
  x: z.number(), // breadboard grid column
  y: z.number(), // breadboard grid row
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
  toRow: z.number(),
  toCol: z.number(),
  color: z.string().default("#22c55e"),
});
export type Wire = z.infer<typeof wireSchema>;

// ── Board State ──────────────────────────────────────────────────

export const boardStateSchema = z.object({
  components: z.record(z.string(), boardComponentSchema),
  wires: z.record(z.string(), wireSchema),
  pinStates: z.array(pinStateSchema),
  libraryState: libraryStateSchema,
  serialOutput: z.array(z.string()),
  sketchCode: z.string(),
});
export type BoardState = z.infer<typeof boardStateSchema>;

// ── Helper: create default pin states (20 pins) ─────────────────

export function createDefaultPinStates(): PinState[] {
  return Array.from({ length: 20 }, (_, i) => ({
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
    pinStates: createDefaultPinStates(),
    libraryState: { servos: {}, lcd: null, serialBaud: 0 },
    serialOutput: [],
    sketchCode: "",
  };
}
