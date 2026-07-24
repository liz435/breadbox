import { describe, expect, test } from "bun:test";
import {
  compileCircuitProgram,
  generateCircuitProgram,
  validateCircuitProgram,
} from "../circuit-program";

describe("CircuitProgram", () => {
  test("generates, validates, and compiles a servo + pot program", () => {
    const generated = generateCircuitProgram({
      board: "arduino_uno",
      mode: "build",
      program: {
        modules: [
          {
            id: "servo1",
            type: "servo",
            role: "main_servo",
            pins: {
              signal: { role: "signal_output", arduinoPin: "D9", net: "servo_signal" },
              vcc: { role: "reference_power", arduinoPin: "5V", net: "vcc_bus" },
              gnd: { role: "reference_ground", arduinoPin: "GND", net: "gnd_bus" },
            },
          },
          {
            id: "pot1",
            type: "potentiometer",
            role: "angle_input",
            pins: {
              signal: { role: "signal_input", arduinoPin: "A0", net: "pot_signal" },
              vcc: { role: "reference_power", arduinoPin: "5V", net: "vcc_bus" },
              gnd: { role: "reference_ground", arduinoPin: "GND", net: "gnd_bus" },
            },
          },
        ],
        sketch: {
          code: '#include <Servo.h>\nvoid setup() {}\nvoid loop() {}\n',
          libraries: ["Servo.h"],
          behaviors: ["read_pot", "drive_servo"],
          pinClaims: ["D9", "A0"],
        },
      },
    });

    expect(generated.program.nets.map((net) => net.id).sort()).toEqual([
      "gnd_bus",
      "pot_signal",
      "servo_signal",
      "vcc_bus",
    ]);
    expect(generated.profiles.behaviors.find((behavior) => behavior.moduleId === "servo1")?.runtime).toBe("servo_pulse");

    const validation = validateCircuitProgram(generated);
    expect(validation.ok).toBe(true);
    expect(validation.errors).toHaveLength(0);

    const compiled = compileCircuitProgram(generated);
    expect(compiled.ok).toBe(true);
    expect(compiled.diagram?.board).toBe("arduino_uno");
    expect(compiled.diagram?.components.map((component) => component.id)).toEqual(["servo1", "pot1"]);
    // Power lands on the inner + rail (col −1), ground on the outer − rail
    // (col −2) — per isPositiveRailCol.
    expect(compiled.diagram?.wires.some((wire) => wire.from === "arduino.5V" && wire.to === "grid.0,-1")).toBe(true);
    expect(compiled.diagram?.wires.some((wire) => wire.from === "arduino.GND" && wire.to === "grid.0,-2")).toBe(true);
    expect(compiled.diagram?.wires.some((wire) => wire.from === "arduino.9" && wire.to === "servo1.signal")).toBe(true);
    expect(compiled.diagram?.wires.some((wire) => wire.from === "arduino.A0" && wire.to === "pot1.signal")).toBe(true);
  });

  test("flags invalid PWM constraints on non-PWM pins", () => {
    const validation = validateCircuitProgram({
      version: "circuit-program-v1",
      board: "arduino_uno",
      mode: "build",
      program: {
        modules: [
          {
            id: "led1",
            type: "led",
            role: "status_light",
            pins: {
              anode: { role: "signal_output", arduinoPin: "D8", net: "led_signal" },
              cathode: { role: "reference_ground", arduinoPin: "GND", net: "gnd_bus" },
            },
          },
        ],
        nets: [
          {
            id: "led_signal",
            kind: "signal",
            members: [{ arduinoPin: "D8" }, { moduleId: "led1", pin: "anode" }],
            constraints: ["pwm_capable_pin"],
          },
          {
            id: "gnd_bus",
            kind: "ground",
            members: [{ arduinoPin: "GND" }, { moduleId: "led1", pin: "cathode" }],
          },
        ],
        layout: { strategy: "auto" },
        sketch: {
          code: "void setup() {}\nvoid loop() {}\n",
          behaviors: [],
          pinClaims: ["D8"],
        },
      },
      words: { labels: [], userTerms: [], editHandles: [] },
      profiles: { components: [], examples: [], behaviors: [] },
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors.some((issue) => issue.message.includes("PWM-capable"))).toBe(true);
  });
});
