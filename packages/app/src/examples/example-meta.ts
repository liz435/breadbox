// ── Example metadata (Vite-free) ────────────────────────────────────────
//
// Extracted from example-catalog.ts so the bun:test simulation suite can
// import the metadata without going through Vite's `import.meta.glob`.
// example-catalog.ts re-exports these for the runtime catalog builder.

import type { ComponentType } from "@dreamer/schemas"

/**
 * Behavioral assertion the example-simulation test runs against the live
 * AVR. Each rule is checked after `simulateMs` of simulated execution.
 * All fields optional — examples without `expectedBehavior` are smoke-
 * tested for "runs without exception" only.
 */
export type ExpectedBehavior = {
  /** How long to run the simulation before evaluating rules. Default 250ms. */
  simulateMs?: number
  /** Pin must toggle at least N times within simulateMs (e.g. a blink). */
  pinToggles?: Array<{ pin: number; minToggles: number }>
  /** Pin must be HIGH (or LOW) at the end of simulateMs. */
  pinFinalState?: Array<{ pin: number; state: "HIGH" | "LOW" }>
  /** Serial output must contain this substring within simulateMs. */
  serialContains?: string
}

export type ExampleMeta = {
  label: string
  description: string
  /** The "featured" component type for this example. */
  primaryType: ComponentType
  category: "output" | "input" | "passive" | "display" | "other"
  /** v2.0.0+: behavioral assertions for the example-simulation test suite. */
  expectedBehavior?: ExpectedBehavior
}

export const EXAMPLE_META: Record<string, ExampleMeta> = {
  "ex-led": {
    label: "Blink LED",
    description: "Blink an LED on and off every 500 ms.",
    primaryType: "led",
    category: "output",
    expectedBehavior: {
      // Sketch toggles D13 every 500ms. In 1100ms simulated we should
      // see at least two HIGH→LOW (or LOW→HIGH) transitions.
      simulateMs: 1100,
      pinToggles: [{ pin: 13, minToggles: 2 }],
    },
  },
  "ex-rgb-led": {
    label: "RGB LED Color Cycle",
    description: "Cycle through red, green, and blue using PWM.",
    primaryType: "rgb_led",
    category: "output",
  },
  "ex-resistor": {
    label: "Current Limiting",
    description: "Use a resistor to safely drive an LED.",
    primaryType: "resistor",
    category: "passive",
  },
  "ex-capacitor": {
    label: "Capacitor Blink",
    description: "Charge and discharge through an LED.",
    primaryType: "capacitor",
    category: "passive",
  },
  "ex-button": {
    label: "Button + LED",
    description: "Press a button to light an LED.",
    primaryType: "button",
    category: "input",
    expectedBehavior: {
      // INPUT_PULLUP on D2 reads HIGH at rest (no button press in sim).
      // Sketch drives D13 LOW in the else branch. D13 should stay LOW.
      simulateMs: 300,
      pinFinalState: [{ pin: 13, state: "LOW" }],
    },
  },
  "ex-potentiometer": {
    label: "Pot → LED Brightness",
    description: "Turn a pot to control LED brightness.",
    primaryType: "potentiometer",
    category: "input",
    expectedBehavior: {
      // analogRead + analogWrite — no deterministic toggle pattern;
      // depends on pot value (which is 0 by default in headless sim).
      // Just verify the sketch runs without crashing.
      simulateMs: 200,
    },
  },
  "ex-buzzer": {
    label: "Buzzer Melody",
    description: "Play a short tone sequence on a piezo buzzer.",
    primaryType: "buzzer",
    category: "output",
    expectedBehavior: {
      // tone(8, 262) generates a 262 Hz square wave on D8 — that's ~262
      // toggles/second. In 200ms we expect tens of toggles.
      simulateMs: 200,
      pinToggles: [{ pin: 8, minToggles: 10 }],
    },
  },
  "ex-servo": {
    label: "Servo Sweep",
    description: "Sweep a servo from 0° to 180° and back.",
    primaryType: "servo",
    category: "output",
    expectedBehavior: {
      // Servo PWM (~50 Hz, 20 ms period). In 200ms we'd see ~10 cycles.
      // The Servo library uses a timer interrupt; just verify it runs
      // without crashing and the pin sees activity.
      simulateMs: 200,
      pinToggles: [{ pin: 9, minToggles: 4 }],
    },
  },
  "ex-photoresistor": {
    label: "Light Sensor",
    description: "Read a photoresistor and print to Serial.",
    primaryType: "photoresistor",
    category: "input",
  },
  "ex-temperature-sensor": {
    label: "Temperature Reader",
    description: "Read a TMP36 and print °C to Serial.",
    primaryType: "temperature_sensor",
    category: "input",
  },
  "ex-ultrasonic-sensor": {
    label: "Distance Sensor",
    description: "Measure distance with an HC-SR04.",
    primaryType: "ultrasonic_sensor",
    category: "input",
  },
  "ex-lcd-16x2": {
    label: "LCD Hello World",
    description: "Print text on a 16×2 character LCD.",
    primaryType: "lcd_16x2",
    category: "display",
  },
  "ex-seven-segment": {
    label: "7-Segment Counter",
    description: "Count 0–9 on a seven-segment display.",
    primaryType: "seven_segment",
    category: "display",
  },
  "ex-neopixel": {
    label: "NeoPixel Rainbow",
    description: "Chase a rainbow across a NeoPixel strip.",
    primaryType: "neopixel",
    category: "output",
  },
  "ex-pir-sensor": {
    label: "Motion Alarm",
    description: "Detect motion with a PIR sensor, light an LED.",
    primaryType: "pir_sensor",
    category: "input",
  },
  "ex-relay": {
    label: "Relay Toggle",
    description: "Toggle a relay on and off every 2 seconds.",
    primaryType: "relay",
    category: "output",
  },
  "ex-dc-motor": {
    label: "Motor Speed",
    description: "Ramp a DC motor up and down with PWM.",
    primaryType: "dc_motor",
    category: "output",
  },
  "ex-dht-sensor": {
    label: "Temp + Humidity",
    description: "Read a DHT sensor and print to Serial.",
    primaryType: "dht_sensor",
    category: "input",
  },
  "ex-ir-receiver": {
    label: "IR Remote Decoder",
    description: "Decode IR signals and print hex codes.",
    primaryType: "ir_receiver",
    category: "input",
  },
  "ex-shift-register": {
    label: "Shift Register Counter",
    description: "Drive 8 LEDs through a 74HC595.",
    primaryType: "shift_register",
    category: "output",
  },
  "ex-oled-display": {
    label: "OLED Hello",
    description: "Print text on a 128×64 SSD1306 over I²C.",
    primaryType: "oled_display",
    category: "display",
  },
  "ex-graph-led": {
    label: "Graph-driven LED",
    description: "Drive an LED from a graph node program (no sketch).",
    primaryType: "led",
    category: "input",
  },
}
