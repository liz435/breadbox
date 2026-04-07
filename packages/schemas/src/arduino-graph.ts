import { z } from "zod";

// ── Arduino Graph Node Types ─────────────────────────────────────

export const arduinoNodeTypeSchema = z.enum([
  // Flow control
  "setup",
  "loop",
  // Digital I/O
  "digital_write",
  "digital_read",
  "pin_mode",
  // Analog I/O
  "analog_write",
  "analog_read",
  // Timing
  "delay",
  "millis",
  "micros",
  // Serial
  "serial_begin",
  "serial_print",
  "serial_read",
  // Logic
  "if_else",
  "comparison",
  "logic_gate",
  // Math
  "math",
  "map_value",
  "constrain",
  // Variables
  "variable",
  "constant",
  // Components (high-level)
  "servo_write",
  "tone",
  "lcd_print",
  // Custom
  "code_block",
]);
export type ArduinoNodeType = z.infer<typeof arduinoNodeTypeSchema>;

// ── Arduino Port Data Types ──────────────────────────────────────

export const arduinoPortDataTypeSchema = z.enum([
  "flow", // execution flow
  "digital", // HIGH/LOW
  "analog", // 0-1023
  "pwm", // 0-255
  "integer", // int
  "float", // float
  "string", // char*/String
  "boolean", // bool
  "pin", // pin number reference
  "any",
]);
export type ArduinoPortDataType = z.infer<typeof arduinoPortDataTypeSchema>;
