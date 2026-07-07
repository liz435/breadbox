// ── Learn-board simulation behaviors (Vite-free) ────────────────────────
//
// Headless-simulation assertions for every learn board, mirroring
// `EXAMPLE_META[...].expectedBehavior` for the example boards. The
// example-simulation test suite requires an entry for EVERY learn board
// with a sketch — a new board without one fails the suite, so behavior
// coverage can't silently lag behind the catalog.

import type { ExpectedBehavior } from "../examples/example-meta"

export const LEARN_BOARD_BEHAVIOR: Record<string, ExpectedBehavior> = {
  "01-blink-led": {
    simulateMs: 1100,
    pinToggles: [{ pin: 13, minToggles: 2 }],
  },
  "02-button-led": {
    // INPUT_PULLUP on D2 reads HIGH at rest — the LED stays off.
    simulateMs: 400,
    pinFinalState: [{ pin: 13, state: "LOW" }],
  },
  "03-fade-led": {
    // analogWrite fade — PWM edges stream on pin 9.
    simulateMs: 1200,
    pinToggles: [{ pin: 9, minToggles: 100 }],
  },
  "04-rgb-led": {
    simulateMs: 1200,
    pinToggles: [
      { pin: 9, minToggles: 1 },
      { pin: 10, minToggles: 1 },
    ],
  },
  "05-potentiometer": {
    simulateMs: 1200,
    pinToggles: [{ pin: 9, minToggles: 100 }],
  },
  "06-resistor": {
    simulateMs: 1200,
    pinToggles: [{ pin: 13, minToggles: 2 }],
  },
  "07-capacitor": {
    simulateMs: 1200,
    serialContains: "Charging",
    pinFinalState: [{ pin: 7, state: "HIGH" }],
  },
  "08-photoresistor": {
    // Solved divider physics (transient solver): default light 50% puts the
    // LDR at 10 kΩ against the 10 kΩ fixed resistor → 2.5 V → 511 counts.
    // (The old 362 was the legacy injection curve, not the circuit.)
    simulateMs: 1200,
    serialContains: "Light: 511",
  },
  "09-buzzer": {
    simulateMs: 400,
    pinToggles: [{ pin: 8, minToggles: 10 }],
    buzzerPlays: true,
  },
  "10-servo": {
    simulateMs: 1200,
    pinToggles: [{ pin: 9, minToggles: 50 }],
    servoMinSweepDeg: 45,
  },
  "11-temperature-sensor": {
    simulateMs: 1200,
    serialContains: "Temp: 24.71",
  },
  "12-ultrasonic-sensor": {
    simulateMs: 1200,
    pinToggles: [{ pin: 7, minToggles: 2 }],
    serialContains: "Distance:",
  },
  "13-pir-sensor": {
    simulateMs: 1200,
    pinFinalState: [{ pin: 13, state: "LOW" }],
  },
  "14-seven-segment": {
    simulateMs: 1200,
    pinToggles: [
      { pin: 2, minToggles: 1 },
      { pin: 5, minToggles: 1 },
      { pin: 6, minToggles: 1 },
      { pin: 7, minToggles: 1 },
    ],
  },
  "15-lcd-16x2": {
    simulateMs: 1200,
    lcdShows: "Hello, World!",
  },
  "16-dht-sensor": {
    simulateMs: 2600,
    serialContains: "Humidity: 50.00%",
    serialNotContains: "nan",
  },
  "17-ir-receiver": {
    // Decoding needs a remote press (inspector-driven; covered by the
    // ir-remote unit tests) — verify a clean idle run.
    simulateMs: 400,
  },
  "18-relay": {
    simulateMs: 1200,
    pinToggles: [{ pin: 7, minToggles: 1 }],
    pinFinalState: [{ pin: 7, state: "HIGH" }],
  },
  "19-dc-motor": {
    simulateMs: 1200,
    pinToggles: [{ pin: 9, minToggles: 100 }],
  },
  "20-shift-register": {
    simulateMs: 1200,
    pinToggles: [{ pin: 11, minToggles: 50 }],
    shiftRegisterDrivesHigh: true,
  },
  "21-neopixel": {
    simulateMs: 1200,
    neopixelMinLitPixels: 8,
    pinToggles: [{ pin: 6, minToggles: 1000 }],
  },
  "22-oled-display": {
    simulateMs: 1200,
    oledMinLitPixels: 100,
  },
}
