import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { BoardOp } from "@dreamer/schemas";
import { makeBoardOp } from "../make-op";

const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);
const INTERRUPT_PINS = new Set([2, 3]);
const SPI_PINS = new Set([10, 11, 12, 13]);
const I2C_PINS = new Set([18, 19]); // A4=18, A5=19

const ALL_COMPONENT_TYPES = [
  "led", "rgb_led", "button", "resistor", "capacitor", "ic",
  "potentiometer", "buzzer", "servo", "lcd_16x2", "seven_segment",
  "photoresistor", "temperature_sensor", "ultrasonic_sensor",
  "neopixel", "pir_sensor", "relay", "dc_motor", "dht_sensor",
  "ir_receiver", "shift_register", "oled_display",
] as const;

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
    get_board_state: tool({
      description:
        "Read the current board state including all components, wires, and pin assignments.",
      inputSchema: z.object({}),
      execute: async () => {
        const board = project.boardState;
        return {
          components: board?.components ?? {},
          wires: board?.wires ?? {},
          sketchCode: board?.sketchCode ?? "",
        };
      },
    }),

    place_component: tool({
      description:
        `Place a component on the breadboard. Available types: ${ALL_COMPONENT_TYPES.join(", ")}.`,
      inputSchema: z.object({
        type: z.enum(ALL_COMPONENT_TYPES).describe("Component type"),
        name: z.string().describe("Display name"),
        x: z.number().int().min(0).max(9).describe("Breadboard column (0-9)"),
        y: z.number().int().min(0).max(29).describe("Breadboard row (0-29)"),
        rotation: z.number().int().min(0).max(3).optional().describe("Rotation: 0-3 (×90°)"),
        pins: z.record(z.string(), z.number().nullable()).describe("Pin name → Arduino pin mapping"),
        properties: z.record(z.string(), z.unknown()).optional().describe("Type-specific properties"),
      }),
      execute: async (input) => {
        // Check overlap
        const existing = Object.values(project.boardState?.components ?? {});
        const overlap = existing.find(
          (c) => c.type !== "arduino_uno" && c.x === input.x && c.y === input.y,
        );
        if (overlap) {
          return { error: `Position row=${input.y} col=${input.x} occupied by ${overlap.name}. Choose another.` };
        }

        const componentId = crypto.randomUUID();
        ops.push(
          makeBoardOp(opCtx, {
            kind: "place_component",
            payload: {
              component: {
                id: componentId,
                type: input.type,
                name: input.name,
                x: input.x,
                y: input.y,
                rotation: input.rotation ?? 0,
                pins: input.pins,
                properties: input.properties ?? {},
              },
            },
          })
        );
        return { componentId, name: input.name, type: input.type };
      },
    }),

    connect_wire: tool({
      description:
        "Add a wire between two points. For Arduino pins use fromRow=-999, fromCol=<pin number>.",
      inputSchema: z.object({
        fromRow: z.number().describe("Starting row (-999 for Arduino pin)"),
        fromCol: z.number().describe("Starting column (or Arduino pin number)"),
        toRow: z.number().describe("Ending row"),
        toCol: z.number().describe("Ending column"),
        color: z.string().optional().describe("Wire color hex"),
      }),
      execute: async (input) => {
        const wireId = crypto.randomUUID();
        ops.push(
          makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: wireId,
                fromRow: input.fromRow,
                fromCol: input.fromCol,
                toRow: input.toRow,
                toCol: input.toCol,
                color: input.color ?? "#22c55e",
              },
            },
          })
        );
        return { wireId };
      },
    }),

    validate_wiring: tool({
      description:
        "Validate the current board wiring for common issues: missing resistors, pin conflicts, incorrect pin modes, and unconnected components.",
      inputSchema: z.object({}),
      execute: async () => {
        const board = project.boardState;
        if (!board) {
          return { valid: true, warnings: [], errors: [], message: "No board state to validate." };
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const usedPins = new Map<number, string[]>();
        const components = Object.values(board.components);
        const wires = Object.values(board.wires);

        for (const comp of components) {
          if (comp.type === "arduino_uno") continue;

          // Track pin usage
          for (const [pinName, pinNum] of Object.entries(comp.pins)) {
            if (pinNum !== null) {
              const existing = usedPins.get(pinNum) ?? [];
              existing.push(`${comp.name}.${pinName}`);
              usedPins.set(pinNum, existing);
            }
          }

          // LED without resistor — check if any wire connects LED position to a resistor position
          if (comp.type === "led" || comp.type === "rgb_led") {
            const hasResistorWired = components.some((c) => {
              if (c.type !== "resistor") return false;
              // Check if any wire connects from the resistor's grid area to the LED's grid area
              return wires.some((w) =>
                (w.toRow === comp.y && w.fromRow === c.y) ||
                (w.fromRow === comp.y && w.toRow === c.y) ||
                (w.toCol === comp.x && w.fromCol === c.x)
              );
            });
            const anyResistor = components.some((c) => c.type === "resistor");
            if (!hasResistorWired && !anyResistor) {
              errors.push(
                `${comp.name}: LED has no current-limiting resistor. Add a 220-330 ohm resistor in series.`
              );
            } else if (!hasResistorWired && anyResistor) {
              warnings.push(
                `${comp.name}: A resistor exists on the board but may not be wired in series with this LED. Verify wiring.`
              );
            }
          }

          // Servo on non-PWM pin
          if (comp.type === "servo" || comp.type === "dc_motor") {
            const signalPin = comp.pins.signal;
            if (signalPin !== null && signalPin !== undefined && !PWM_PINS.has(signalPin)) {
              errors.push(
                `${comp.name}: Signal on D${signalPin} which is not a PWM pin. Use D3, D5, D6, D9, D10, or D11.`
              );
            }
          }

          // Serial pin conflict
          for (const [, pinNum] of Object.entries(comp.pins)) {
            if (pinNum === 0 || pinNum === 1) {
              warnings.push(
                `${comp.name}: Using serial pin D${pinNum}. This conflicts with Serial communication.`
              );
            }
          }

          // OLED not on I2C pins
          if (comp.type === "oled_display") {
            const sda = comp.pins.sda;
            const scl = comp.pins.scl;
            if (sda !== null && sda !== 18) {
              warnings.push(`${comp.name}: SDA should be on A4 (pin 18) for I2C.`);
            }
            if (scl !== null && scl !== 19) {
              warnings.push(`${comp.name}: SCL should be on A5 (pin 19) for I2C.`);
            }
          }

          // Check for unassigned pins
          const unassigned = Object.entries(comp.pins).filter(([, v]) => v === null);
          if (unassigned.length > 0 && comp.type !== "resistor" && comp.type !== "capacitor") {
            warnings.push(
              `${comp.name}: Unassigned pins: ${unassigned.map(([k]) => k).join(", ")}. Open the Inspector to assign Arduino pins.`
            );
          }
        }

        // Pin conflicts
        for (const [pin, users] of usedPins.entries()) {
          if (users.length > 1) {
            errors.push(
              `Pin D${pin}: Multiple components — ${users.join(", ")}. Each pin should connect to one component.`
            );
          }
        }

        // Sketch pin validation
        const sketch = board.sketchCode;
        if (sketch) {
          const pinModeMatches = sketch.matchAll(/pinMode\s*\(\s*(\d+)\s*,/g);
          for (const match of pinModeMatches) {
            const pin = parseInt(match[1], 10);
            if (!usedPins.has(pin) && pin !== 13) {
              warnings.push(
                `Sketch sets pinMode for D${pin}, but no component is assigned to this pin.`
              );
            }
          }
        }

        // Unconnected components (no wires touching their position)
        for (const comp of components) {
          if (comp.type === "arduino_uno" || comp.type === "wire") continue;
          const hasWire = wires.some(
            (w) =>
              (w.toRow === comp.y && w.toCol === comp.x) ||
              (w.fromRow === comp.y && w.fromCol === comp.x),
          );
          if (!hasWire) {
            warnings.push(`${comp.name}: No wires connected. Component may be floating.`);
          }
        }

        return {
          valid: errors.length === 0,
          errors,
          warnings,
          componentCount: components.filter((c) => c.type !== "arduino_uno").length,
          wireCount: wires.length,
        };
      },
    }),

    list_available_components: tool({
      description:
        "List all available component types with pin configurations and wiring guidance.",
      inputSchema: z.object({}),
      execute: async () => {
        return {
          components: [
            { type: "led", pins: "anode (digital), cathode (GND)", resistor: "220-330 ohm in series", notes: "Red ~1.8V, Blue ~3.0V forward voltage" },
            { type: "rgb_led", pins: "red/green/blue (PWM), common (GND/5V)", resistor: "220 ohm per channel", notes: "Use PWM for color mixing" },
            { type: "button", pins: "a (digital), b (GND)", resistor: "None with INPUT_PULLUP", notes: "Reads LOW when pressed" },
            { type: "resistor", pins: "a, b (inline)", resistor: "N/A", notes: "Common: 220, 330, 1K, 10K" },
            { type: "capacitor", pins: "positive, negative", resistor: "None", notes: "Electrolytic or ceramic" },
            { type: "potentiometer", pins: "vcc (5V), signal (analog), gnd (GND)", resistor: "None", notes: "10K typical, analogRead 0-1023" },
            { type: "buzzer", pins: "positive (digital), negative (GND)", resistor: "Optional 100 ohm", notes: "Use tone(pin, freq)" },
            { type: "servo", pins: "signal (PWM), vcc (5V), gnd (GND)", resistor: "None", notes: "Servo library, 0-180°" },
            { type: "lcd_16x2", pins: "rs, en, d4-d7 (digital), v0 (pot)", resistor: "220 ohm backlight", notes: "LiquidCrystal library" },
            { type: "seven_segment", pins: "a-g segments (digital)", resistor: "220 ohm per segment", notes: "Common cathode/anode" },
            { type: "photoresistor", pins: "terminal1 (analog divider), terminal2 (5V)", resistor: "10K to GND (divider)", notes: "Resistance decreases with light" },
            { type: "temperature_sensor", pins: "power (5V), vout (analog), ground (GND)", resistor: "None", notes: "TMP36: Temp(C) = (V-0.5)*100" },
            { type: "ultrasonic_sensor", pins: "trigger (digital out), echo (digital in)", resistor: "None", notes: "Distance = pulseIn*0.034/2 cm" },
            { type: "neopixel", pins: "din (digital), 5v, gnd", resistor: "300-470 ohm on data line", notes: "Adafruit_NeoPixel library, addressable RGB" },
            { type: "pir_sensor", pins: "signal (digital in)", resistor: "None", notes: "HC-SR501, HIGH on motion, ~60s warmup" },
            { type: "relay", pins: "signal (digital)", resistor: "None", notes: "Often active LOW, switches high-power loads" },
            { type: "dc_motor", pins: "signal (PWM)", resistor: "None", notes: "Use transistor/driver, analogWrite for speed" },
            { type: "dht_sensor", pins: "signal (digital)", resistor: "10K pull-up", notes: "DHT library, temp + humidity" },
            { type: "ir_receiver", pins: "signal (digital)", resistor: "None", notes: "IRremote library, 38kHz" },
            { type: "shift_register", pins: "data, clock, latch (3 digital)", resistor: "None", notes: "74HC595, 8-bit output expansion" },
            { type: "oled_display", pins: "sda (A4), scl (A5)", resistor: "None", notes: "SSD1306 I2C 128x64, Adafruit_SSD1306 library" },
            { type: "ic", pins: "variable (DIP package)", resistor: "Depends on IC", notes: "Generic IC, straddles center gap" },
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
