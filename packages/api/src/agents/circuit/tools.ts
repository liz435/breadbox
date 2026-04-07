import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { BoardOp } from "@dreamer/schemas";
import { makeBoardOp } from "../make-op";

const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);
const INTERRUPT_PINS = new Set([2, 3]);
const SPI_PINS = new Set([10, 11, 12, 13]);
const I2C_PINS = new Set([18, 19]); // A4=18, A5=19

/**
 * Creates the circuit design tools for the circuit specialist agent.
 */
export function createCircuitTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: BoardOp[];
}) {
  const { project, sceneId, ops } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  return {
    suggest_circuit: tool({
      description:
        "Suggest a complete circuit design for a given description. Returns component list, wiring instructions, and pin assignments. Also places the components and wires on the board.",
      inputSchema: z.object({
        description: z
          .string()
          .describe(
            "Description of the desired circuit (e.g. 'LED blink on pin 13', 'button-controlled servo')"
          ),
      }),
      execute: async (input) => {
        // Analyze the description and provide suggestions
        const desc = input.description.toLowerCase();
        const suggestions: Array<{
          type: string;
          name: string;
          pins: Record<string, number | null>;
          properties: Record<string, unknown>;
        }> = [];

        // LED detection
        if (desc.includes("led") && !desc.includes("rgb")) {
          suggestions.push({
            type: "led",
            name: "LED",
            pins: { anode: 13, cathode: null },
            properties: { color: "red" },
          });
          suggestions.push({
            type: "resistor",
            name: "LED Resistor",
            pins: { terminal1: null, terminal2: null },
            properties: { resistance: 220, unit: "ohm" },
          });
        }

        if (desc.includes("rgb")) {
          suggestions.push({
            type: "rgb_led",
            name: "RGB LED",
            pins: { red: 9, green: 10, blue: 11, common: null },
            properties: { commonType: "cathode" },
          });
          for (const color of ["Red", "Green", "Blue"]) {
            suggestions.push({
              type: "resistor",
              name: `${color} Resistor`,
              pins: { terminal1: null, terminal2: null },
              properties: { resistance: 220, unit: "ohm" },
            });
          }
        }

        // Button detection
        if (desc.includes("button") || desc.includes("switch")) {
          suggestions.push({
            type: "button",
            name: "Push Button",
            pins: { terminal1: 2, terminal2: null },
            properties: { pullup: true },
          });
        }

        // Servo detection
        if (desc.includes("servo")) {
          suggestions.push({
            type: "servo",
            name: "Servo Motor",
            pins: { signal: 9, power: null, ground: null },
            properties: { range: "0-180" },
          });
        }

        // Potentiometer detection
        if (desc.includes("potentiometer") || desc.includes("pot") || desc.includes("knob")) {
          suggestions.push({
            type: "potentiometer",
            name: "Potentiometer",
            pins: { wiper: 14, terminal1: null, terminal2: null }, // 14 = A0
            properties: { resistance: 10000, unit: "ohm" },
          });
        }

        // Buzzer detection
        if (desc.includes("buzzer") || desc.includes("tone") || desc.includes("speaker")) {
          suggestions.push({
            type: "buzzer",
            name: "Piezo Buzzer",
            pins: { positive: 8, negative: null },
            properties: {},
          });
        }

        // LCD detection
        if (desc.includes("lcd") || desc.includes("display")) {
          suggestions.push({
            type: "lcd_16x2",
            name: "LCD 16x2",
            pins: { rs: 12, en: 11, d4: 5, d5: 4, d6: 3, d7: 2, v0: null },
            properties: { cols: 16, rows: 2 },
          });
          suggestions.push({
            type: "potentiometer",
            name: "Contrast Pot",
            pins: { wiper: null, terminal1: null, terminal2: null },
            properties: { resistance: 10000, unit: "ohm", purpose: "LCD contrast" },
          });
        }

        // Temperature sensor
        if (desc.includes("temperature") || desc.includes("temp sensor") || desc.includes("tmp36")) {
          suggestions.push({
            type: "temperature_sensor",
            name: "TMP36",
            pins: { vout: 14, power: null, ground: null }, // 14 = A0
            properties: {},
          });
        }

        // Ultrasonic sensor
        if (desc.includes("ultrasonic") || desc.includes("distance") || desc.includes("hc-sr04")) {
          suggestions.push({
            type: "ultrasonic_sensor",
            name: "HC-SR04",
            pins: { trigger: 9, echo: 10, power: null, ground: null },
            properties: {},
          });
        }

        // Place suggested components on the board
        let row = 5;
        for (const s of suggestions) {
          const componentId = crypto.randomUUID();
          ops.push(
            makeBoardOp(opCtx, {
              kind: "place_component",
              payload: {
                component: {
                  id: componentId,
                  type: s.type as "led" | "resistor" | "button" | "servo" | "potentiometer" | "buzzer" | "lcd_16x2" | "rgb_led" | "temperature_sensor" | "ultrasonic_sensor" | "seven_segment" | "photoresistor",
                  name: s.name,
                  x: 10,
                  y: row,
                  rotation: 0,
                  pins: s.pins,
                  properties: s.properties,
                },
              },
            })
          );
          row += 5;
        }

        return {
          suggestions,
          componentsPlaced: suggestions.length,
          notes: suggestions.length === 0
            ? "Could not determine specific components from the description. Please provide more detail about what you want to build."
            : `Placed ${suggestions.length} component(s) on the board. Review pin assignments and adjust positions as needed.`,
        };
      },
    }),

    validate_wiring: tool({
      description:
        "Validate the current board wiring for common issues: missing resistors for LEDs, pin conflicts, overcurrent risks, and incorrect pin modes.",
      inputSchema: z.object({}),
      execute: async () => {
        const board = project.boardState;
        if (!board) {
          return { valid: true, warnings: [], errors: [], message: "No board state to validate." };
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const usedPins = new Map<number, string[]>();

        // Check each component
        for (const comp of Object.values(board.components)) {
          // Track pin usage
          for (const [pinName, pinNum] of Object.entries(comp.pins)) {
            if (pinNum !== null) {
              const existing = usedPins.get(pinNum) ?? [];
              existing.push(`${comp.name}.${pinName}`);
              usedPins.set(pinNum, existing);
            }
          }

          // LED without resistor check
          if (comp.type === "led" || comp.type === "rgb_led") {
            const hasResistor = Object.values(board.components).some(
              (c) => c.type === "resistor" && c.name.toLowerCase().includes(comp.name.toLowerCase().replace(" led", ""))
            );
            // Simple heuristic — check if any resistor exists at all
            const anyResistor = Object.values(board.components).some(
              (c) => c.type === "resistor"
            );
            if (!hasResistor && !anyResistor) {
              errors.push(
                `${comp.name}: LED has no current-limiting resistor. Add a 220-330 ohm resistor in series.`
              );
            }
          }

          // Servo on non-PWM pin
          if (comp.type === "servo") {
            const signalPin = comp.pins.signal;
            if (signalPin !== null && !PWM_PINS.has(signalPin)) {
              errors.push(
                `${comp.name}: Servo signal on D${signalPin} which is not a PWM pin. Use one of: D3, D5, D6, D9, D10, D11.`
              );
            }
          }

          // Serial pin conflict
          for (const [, pinNum] of Object.entries(comp.pins)) {
            if (pinNum === 0 || pinNum === 1) {
              warnings.push(
                `${comp.name}: Using serial pin D${pinNum}. This will conflict with Serial communication.`
              );
            }
          }
        }

        // Check for pin conflicts (multiple components on same pin)
        for (const [pin, users] of usedPins.entries()) {
          if (users.length > 1) {
            errors.push(
              `Pin D${pin}: Multiple components connected — ${users.join(", ")}. Each pin should connect to one component.`
            );
          }
        }

        // Validate sketch pin modes match wiring
        const sketch = board.sketchCode;
        if (sketch) {
          // Check if sketch references pins that have no components
          const pinModeMatches = sketch.matchAll(/pinMode\s*\(\s*(\d+)\s*,/g);
          for (const match of pinModeMatches) {
            const pin = parseInt(match[1], 10);
            if (!usedPins.has(pin) && pin !== 13) {
              // Pin 13 has built-in LED
              warnings.push(
                `Sketch sets pinMode for D${pin}, but no component is connected to this pin.`
              );
            }
          }
        }

        return {
          valid: errors.length === 0,
          errors,
          warnings,
          componentCount: Object.keys(board.components).length,
          wireCount: Object.keys(board.wires).length,
        };
      },
    }),

    list_available_components: tool({
      description:
        "List all available component types with their pin configurations, typical connections, and recommended resistor values.",
      inputSchema: z.object({}),
      execute: async () => {
        return {
          components: [
            {
              type: "led",
              description: "Light-emitting diode",
              pins: { anode: "Digital pin (through resistor)", cathode: "GND" },
              resistor: "220-330 ohm in series",
              notes: "Red ~1.8V, Green ~2.0V, Blue/White ~3.0V forward voltage",
            },
            {
              type: "rgb_led",
              description: "RGB LED (common cathode or common anode)",
              pins: { red: "PWM pin", green: "PWM pin", blue: "PWM pin", common: "GND (cathode) or 5V (anode)" },
              resistor: "220 ohm per color channel",
              notes: "Use PWM pins for color mixing with analogWrite()",
            },
            {
              type: "button",
              description: "Momentary push button",
              pins: { terminal1: "Digital pin", terminal2: "GND (with INPUT_PULLUP)" },
              resistor: "None needed with INPUT_PULLUP, or 10K pull-down",
              notes: "Reads LOW when pressed with INPUT_PULLUP",
            },
            {
              type: "resistor",
              description: "Fixed resistor",
              pins: { terminal1: "Connected inline", terminal2: "Connected inline" },
              resistor: "N/A — this IS the resistor",
              notes: "Common values: 220, 330, 1K, 4.7K, 10K ohm",
            },
            {
              type: "potentiometer",
              description: "Variable resistor / voltage divider",
              pins: { terminal1: "5V", wiper: "Analog pin (A0-A5)", terminal2: "GND" },
              resistor: "None needed",
              notes: "Typically 10K ohm. Analog reading 0-1023.",
            },
            {
              type: "buzzer",
              description: "Piezoelectric buzzer/speaker",
              pins: { positive: "Digital pin", negative: "GND" },
              resistor: "None needed (optional 100 ohm for volume control)",
              notes: "Use tone(pin, frequency) function",
            },
            {
              type: "servo",
              description: "Servo motor (0-180 degrees)",
              pins: { signal: "PWM pin", power: "5V", ground: "GND" },
              resistor: "None needed",
              notes: "Use Servo library. External power for multiple/large servos.",
            },
            {
              type: "lcd_16x2",
              description: "16x2 character LCD display (4-bit mode)",
              pins: { rs: "Digital", en: "Digital", d4: "Digital", d5: "Digital", d6: "Digital", d7: "Digital", v0: "10K pot wiper" },
              resistor: "220 ohm for backlight",
              notes: "Use LiquidCrystal library",
            },
            {
              type: "seven_segment",
              description: "7-segment numeric display",
              pins: { a: "Digital", b: "Digital", c: "Digital", d: "Digital", e: "Digital", f: "Digital", g: "Digital", dp: "Digital" },
              resistor: "220 ohm per segment",
              notes: "Common cathode or common anode",
            },
            {
              type: "photoresistor",
              description: "Light-dependent resistor (LDR)",
              pins: { terminal1: "Analog pin (voltage divider junction)", terminal2: "5V" },
              resistor: "10K fixed resistor to GND (voltage divider)",
              notes: "Resistance decreases with light. Read with analogRead().",
            },
            {
              type: "temperature_sensor",
              description: "TMP36 analog temperature sensor",
              pins: { power: "5V", vout: "Analog pin", ground: "GND" },
              resistor: "None needed",
              notes: "Temp(C) = (voltage - 0.5) * 100. voltage = analogRead() * 5.0 / 1024",
            },
            {
              type: "ultrasonic_sensor",
              description: "HC-SR04 ultrasonic distance sensor",
              pins: { trigger: "Digital (output)", echo: "Digital (input)", power: "5V", ground: "GND" },
              resistor: "None needed",
              notes: "Distance(cm) = pulseIn(echo) * 0.034 / 2",
            },
          ],
          pinInfo: {
            pwmPins: [3, 5, 6, 9, 10, 11],
            analogPins: ["A0 (14)", "A1 (15)", "A2 (16)", "A3 (17)", "A4 (18)", "A5 (19)"],
            interruptPins: [2, 3],
            serialPins: { tx: 1, rx: 0 },
            spiPins: { ss: 10, mosi: 11, miso: 12, sck: 13 },
            i2cPins: { sda: "A4 (18)", scl: "A5 (19)" },
          },
        };
      },
    }),
  };
}
