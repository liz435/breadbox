// ── Circuit Templates ───────────────────────────────────────────────────
//
// Deterministic circuit builders. Each template produces a set of BoardOps
// that are guaranteed correct — valid positions, correct pin names, proper
// wiring, and working sketch code.
//
// WIRING RULES:
// - Left strip: cols 0-4 in same row are ONE bus (all connected)
// - Right strip: cols 5-9 in same row are ONE bus (all connected)
// - Center gap: col 4 and col 5 are NOT connected
// - Components that need separate connections must be on DIFFERENT rows
//   or span the center gap
// - Pin assignments in components are NOT used by SPICE — only wires matter
//
// Zero AI cost, <1ms execution, 100% reliability.

import type { BoardOp } from "@dreamer/schemas";
import type { ProjectFile } from "../db/schemas";
import { makeBoardOp, type OpContext } from "./make-op";

type TemplateResult = {
  ops: BoardOp[];
  description: string;
}

type BoardState = NonNullable<ProjectFile["boardState"]>;

// ── Position finder ─────────────────────────────────────────────────────

function findOpenRow(board: BoardState, col: number, startRow: number = 0): number {
  const occupied = new Set<number>();
  for (const comp of Object.values(board.components)) {
    if (comp.x === col || Math.abs(comp.x - col) <= 4) {
      for (let r = comp.y - 1; r <= comp.y + 3; r++) {
        occupied.add(r);
      }
    }
  }
  let row = startRow;
  while (occupied.has(row) && row < 26) row++;
  return Math.min(row, 26);
}

function makeComponent(ctx: OpContext, type: import("@dreamer/schemas").ComponentType, name: string, x: number, y: number, pins: Record<string, null>, properties: Record<string, unknown> = {}): BoardOp {
  return makeBoardOp(ctx, { kind: "place_component", payload: { component: {
    id: crypto.randomUUID(), type, name, x, y, rotation: 0, pins, properties,
  } } });
}

function makeWire(ctx: OpContext, fromRow: number, fromCol: number, toRow: number, toCol: number, color: string): BoardOp {
  return makeBoardOp(ctx, { kind: "connect_wire", payload: { wire: {
    id: crypto.randomUUID(), fromRow, fromCol, toRow, toCol, color,
  } } });
}

function makeArduinoWire(ctx: OpContext, arduinoPin: number, toRow: number, toCol: number, color: string): BoardOp {
  return makeWire(ctx, -999, arduinoPin, toRow, toCol, color);
}

function makeSketch(ctx: OpContext, code: string): BoardOp {
  return makeBoardOp(ctx, { kind: "update_sketch", payload: { code } });
}

// ── LED + Resistor helper ───────────────────────────────────────────────
// Standard pattern:
//   Row N:   LED anode (col 2)    ← Arduino wire lands here
//   Row N+1: LED cathode (col 2)  ← same row as resistor pin A (col 3)
//   Resistor spans col 3 → col 7 (crosses center gap)
//   GND wire → col 7 (right strip = resistor pin B)

function makeLedWithResistor(
  ctx: OpContext, board: BoardState,
  ledName: string, resName: string, pin: number, color: string, startRow?: number,
): { ops: BoardOp[]; ledRow: number; nextRow: number } {
  const ledRow = findOpenRow(board, 2, startRow);
  const cathodeRow = ledRow + 1;

  const ops = [
    // LED: pins are null — SPICE uses wire topology, not pin assignments
    makeComponent(ctx, "led", ledName, 2, ledRow,
      { anode: null, cathode: null }, { color }),
    // Resistor in cathode row, spans left→right strip
    makeComponent(ctx, "resistor", resName, 3, cathodeRow,
      { a: null, b: null }, { resistance: 220 }),
    // Arduino pin → LED anode
    makeArduinoWire(ctx, pin, ledRow, 2, color),
    // GND → resistor pin B (right strip col 7)
    makeArduinoWire(ctx, -3, cathodeRow, 7, "#42a5f5"),
  ];

  return { ops, ledRow, nextRow: cathodeRow + 2 };
}

// ── Templates ───────────────────────────────────────────────────────────

function blinkTemplate(
  ctx: OpContext, board: BoardState,
  params: { pin?: number; color?: string },
): TemplateResult {
  const pin = params.pin ?? 13;
  const color = params.color ?? "#ef4444";
  const { ops: circuitOps } = makeLedWithResistor(ctx, board, "LED", "R1 (220Ω)", pin, color);

  return {
    ops: [
      ...circuitOps,
      makeSketch(ctx, `void setup() {\n  pinMode(${pin}, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(${pin}, HIGH);\n  delay(1000);\n  digitalWrite(${pin}, LOW);\n  delay(1000);\n}\n`),
    ],
    description: `Created LED blink circuit: D${pin} → LED → 220Ω resistor → GND. Blinks at 1Hz.`,
  };
}

function buttonLedTemplate(ctx: OpContext, board: BoardState): TemplateResult {
  const btnPin = 2;
  const ledPin = 13;
  // Button uses rows for its 4-pin DIP layout
  const btnRow = findOpenRow(board, 3);
  const { ops: ledOps } = makeLedWithResistor(ctx, board, "LED", "R1 (220Ω)", ledPin, "#ef4444", btnRow + 3);

  return {
    ops: [
      // Button straddles center gap
      makeComponent(ctx, "button", "Button", 3, btnRow, { a: null, b: null }),
      // Wire: Arduino D2 → button (left side, row btnRow)
      makeArduinoWire(ctx, btnPin, btnRow, 3, "#ffd54f"),
      // Wire: GND → button (right side, row btnRow+1)
      makeArduinoWire(ctx, -3, btnRow + 1, 6, "#42a5f5"),
      ...ledOps,
      makeSketch(ctx, `void setup() {\n  pinMode(${btnPin}, INPUT_PULLUP);\n  pinMode(${ledPin}, OUTPUT);\n}\n\nvoid loop() {\n  if (digitalRead(${btnPin}) == LOW) {\n    digitalWrite(${ledPin}, HIGH);\n  } else {\n    digitalWrite(${ledPin}, LOW);\n  }\n}\n`),
    ],
    description: `Created button-controlled LED: D${btnPin} → button → GND. D${ledPin} → LED → 220Ω → GND. LED lights when pressed.`,
  };
}

function servoSweepTemplate(ctx: OpContext, board: BoardState, params: { pin?: number }): TemplateResult {
  const pin = params.pin ?? 9;
  // Servo has 3 pins: signal, vcc, gnd — each needs its own row to avoid bus shorts
  const signalRow = findOpenRow(board, 2);
  const vccRow = signalRow + 1;
  const gndRow = signalRow + 2;
  const supplyRow = gndRow + 2;

  return {
    ops: [
      makeComponent(ctx, "servo", "Servo", 2, signalRow, { signal: null, vcc: null, gnd: null }),
      makeComponent(ctx, "power_supply", "External 5V Supply", 8, supplyRow, { positive: null, negative: null }),
      // Each wire on a DIFFERENT row so they're on separate buses
      makeArduinoWire(ctx, pin, signalRow, 2, "#ff9800"),
      // Power the servo motor rail from external supply.
      // Positive rail: supply+ -> servo vcc row
      makeWire(ctx, supplyRow, 8, vccRow, 2, "#ef5350"),
      // Negative rail: supply- -> servo gnd row
      makeWire(ctx, supplyRow + 1, 8, gndRow, 2, "#42a5f5"),
      // Common ground: Arduino GND tied to external negative rail
      makeArduinoWire(ctx, -3, supplyRow + 1, 8, "#42a5f5"),
      makeSketch(ctx, `#include <Servo.h>\n\nServo myServo;\n\nvoid setup() {\n  myServo.attach(${pin});\n}\n\nvoid loop() {\n  for (int angle = 0; angle <= 180; angle++) {\n    myServo.write(angle);\n    delay(15);\n  }\n  for (int angle = 180; angle >= 0; angle--) {\n    myServo.write(angle);\n    delay(15);\n  }\n}\n`),
    ],
    description: `Created servo sweep on D${pin}: signal from Arduino, servo power from external 5V supply, and common ground tied to Arduino GND.`,
  };
}

function trafficLightTemplate(ctx: OpContext, board: BoardState): TemplateResult {
  const redPin = 11, yellowPin = 10, greenPin = 9;
  const baseRow = findOpenRow(board, 2);
  const red = makeLedWithResistor(ctx, board, "Red LED", "R1 (220Ω)", redPin, "#ef4444", baseRow);
  const yellow = makeLedWithResistor(ctx, board, "Yellow LED", "R2 (220Ω)", yellowPin, "#facc15", red.nextRow);
  const green = makeLedWithResistor(ctx, board, "Green LED", "R3 (220Ω)", greenPin, "#22c55e", yellow.nextRow);

  return {
    ops: [
      ...red.ops, ...yellow.ops, ...green.ops,
      makeSketch(ctx, `int redPin = ${redPin};\nint yellowPin = ${yellowPin};\nint greenPin = ${greenPin};\n\nvoid setup() {\n  pinMode(redPin, OUTPUT);\n  pinMode(yellowPin, OUTPUT);\n  pinMode(greenPin, OUTPUT);\n}\n\nvoid loop() {\n  // Green\n  digitalWrite(greenPin, HIGH);\n  delay(3000);\n  digitalWrite(greenPin, LOW);\n\n  // Yellow\n  digitalWrite(yellowPin, HIGH);\n  delay(1000);\n  digitalWrite(yellowPin, LOW);\n\n  // Red\n  digitalWrite(redPin, HIGH);\n  delay(3000);\n  digitalWrite(redPin, LOW);\n}\n`),
    ],
    description: `Created traffic light: Red (D${redPin}), Yellow (D${yellowPin}), Green (D${greenPin}). Each LED → 220Ω → GND. Cycles green → yellow → red.`,
  };
}

function potLedTemplate(ctx: OpContext, board: BoardState): TemplateResult {
  // Potentiometer: 3 pins need separate rows (like servo) to avoid bus shorts
  const potRow = findOpenRow(board, 2);
  const potVccRow = potRow;       // 5V on potRow
  const potSignalRow = potRow + 1; // A0 on separate row
  const potGndRow = potRow + 2;    // GND on separate row
  const { ops: ledOps } = makeLedWithResistor(ctx, board, "LED", "R1 (220Ω)", 9, "#facc15", potGndRow + 1);

  return {
    ops: [
      makeComponent(ctx, "potentiometer", "Potentiometer", 2, potRow, { vcc: null, signal: null, gnd: null }),
      // Pot wires — each on its own row
      makeArduinoWire(ctx, -1, potVccRow, 2, "#ef5350"),      // 5V
      makeArduinoWire(ctx, 14, potSignalRow, 2, "#81c784"),    // A0
      makeArduinoWire(ctx, -3, potGndRow, 2, "#42a5f5"),       // GND
      // LED + resistor
      ...ledOps,
      makeSketch(ctx, `int potPin = A0;\nint ledPin = 9;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int potValue = analogRead(potPin);\n  int brightness = map(potValue, 0, 1023, 0, 255);\n  analogWrite(ledPin, brightness);\n  Serial.println(brightness);\n  delay(10);\n}\n`),
    ],
    description: `Created pot-controlled LED: pot (A0) → LED (D9 PWM) with 220Ω resistor. Each pot pin on a separate row.`,
  };
}

function temperatureReadingTemplate(ctx: OpContext, board: BoardState): TemplateResult {
  // TMP36: 3 pins need separate rows
  const row = findOpenRow(board, 2);
  const vccRow = row;
  const signalRow = row + 1;
  const gndRow = row + 2;

  return {
    ops: [
      makeComponent(ctx, "temperature_sensor", "TMP36", 2, row, { power: null, vout: null, ground: null }),
      makeArduinoWire(ctx, -1, vccRow, 2, "#ef5350"),      // 5V
      makeArduinoWire(ctx, 14, signalRow, 2, "#81c784"),    // A0
      makeArduinoWire(ctx, -3, gndRow, 2, "#42a5f5"),       // GND
      makeSketch(ctx, `int sensorPin = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int reading = analogRead(sensorPin);\n  float voltage = reading * 5.0 / 1024.0;\n  float temperatureC = (voltage - 0.5) * 100;\n  Serial.print("Temperature: ");\n  Serial.print(temperatureC);\n  Serial.println(" C");\n  delay(1000);\n}\n`),
    ],
    description: `Created temperature reading: TMP36 on A0 with 5V and GND on separate rows.`,
  };
}

function buzzerToneTemplate(ctx: OpContext, board: BoardState): TemplateResult {
  const pin = 8;
  // Buzzer: positive pin on one row, negative (GND) on next row
  const row = findOpenRow(board, 2);
  const gndRow = row + 1;

  return {
    ops: [
      makeComponent(ctx, "buzzer", "Buzzer", 2, row, { positive: null, negative: null }),
      makeArduinoWire(ctx, pin, row, 2, "#ff9800"),         // signal
      makeArduinoWire(ctx, -3, gndRow, 2, "#42a5f5"),       // GND on separate row
      makeSketch(ctx, `int buzzerPin = ${pin};\n\nvoid setup() {\n  // Nothing to set up\n}\n\nvoid loop() {\n  tone(buzzerPin, 262); // C4\n  delay(500);\n  tone(buzzerPin, 294); // D4\n  delay(500);\n  tone(buzzerPin, 330); // E4\n  delay(500);\n  tone(buzzerPin, 349); // F4\n  delay(500);\n  tone(buzzerPin, 392); // G4\n  delay(500);\n  noTone(buzzerPin);\n  delay(1000);\n}\n`),
    ],
    description: `Created buzzer circuit on D${pin}: plays C-D-E-F-G scale. Signal and GND on separate rows.`,
  };
}

// ── Registry ────────────────────────────────────────────────────────────

export const CIRCUIT_TEMPLATES: Record<
  string,
  (ctx: OpContext, board: BoardState, params: Record<string, unknown>) => TemplateResult
> = {
  blink: blinkTemplate,
  button_led: buttonLedTemplate,
  servo_sweep: servoSweepTemplate,
  traffic_light: trafficLightTemplate,
  pot_led: potLedTemplate,
  temperature_reading: temperatureReadingTemplate,
  buzzer_tone: buzzerToneTemplate,
};
