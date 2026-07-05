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
  /** How long to run the simulation before evaluating rules. Default 400ms. */
  simulateMs?: number
  /** Pin must toggle at least N times within simulateMs (e.g. a blink). */
  pinToggles?: Array<{ pin: number; minToggles: number }>
  /** Pin must be HIGH (or LOW) at the end of simulateMs. */
  pinFinalState?: Array<{ pin: number; state: "HIGH" | "LOW" }>
  /** Serial output must contain this substring within simulateMs. */
  serialContains?: string
  /** Serial output must NOT contain this substring (e.g. "nan"). */
  serialNotContains?: string
  /** Final LCD text (all rows) must contain this substring. */
  lcdShows?: string
  /** Final OLED framebuffer must have at least this many lit pixels. */
  oledMinLitPixels?: number
  /** At least this many NeoPixels must be non-black at some point. */
  neopixelMinLitPixels?: number
  /** A buzzer peripheral must report `playing` at some point. */
  buzzerPlays?: boolean
  /** Observed servo sweep (max - min angle) must reach this many degrees. */
  servoMinSweepDeg?: number
  /** A 74HC595 must latch at least one output HIGH at some point. */
  shiftRegisterDrivesHigh?: boolean
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
    expectedBehavior: {
      // 1s per color: red (9) turns off and green (10) turns on within 1.2s.
      simulateMs: 1200,
      pinToggles: [
        { pin: 9, minToggles: 1 },
        { pin: 10, minToggles: 1 },
      ],
    },
  },
  "ex-resistor": {
    label: "Current Limiting",
    description: "Use a resistor to safely drive an LED.",
    primaryType: "resistor",
    category: "passive",
    expectedBehavior: {
      simulateMs: 1200,
      pinToggles: [{ pin: 13, minToggles: 2 }],
    },
  },
  "ex-capacitor": {
    label: "Capacitor Blink",
    description: "Charge and discharge through an LED.",
    primaryType: "capacitor",
    category: "passive",
    expectedBehavior: {
      simulateMs: 1200,
      serialContains: "Charging",
      pinFinalState: [{ pin: 7, state: "HIGH" }],
    },
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
      // toggles/second. The buzzer peripheral must also report `playing`
      // (that's what drives Web Audio in the app).
      simulateMs: 400,
      pinToggles: [{ pin: 8, minToggles: 10 }],
      buzzerPlays: true,
    },
  },
  "ex-servo": {
    label: "Servo Sweep",
    description: "Sweep a servo from 0° to 180° and back.",
    primaryType: "servo",
    category: "output",
    expectedBehavior: {
      // 15ms/degree sweep ⇒ ~80° covered in 1.2s. The servo peripheral
      // must decode the PWM into an actual angle sweep.
      simulateMs: 1200,
      pinToggles: [{ pin: 9, minToggles: 50 }],
      servoMinSweepDeg: 45,
    },
  },
  "ex-photoresistor": {
    label: "Light Sensor",
    description: "Read a photoresistor and print to Serial.",
    primaryType: "photoresistor",
    category: "input",
    expectedBehavior: {
      // The default environment light level feeds the divider → ~362 counts.
      simulateMs: 1200,
      serialContains: "Light: 362",
    },
  },
  "ex-temperature-sensor": {
    label: "Temperature Reader",
    description: "Read a TMP36 and print °C to Serial.",
    primaryType: "temperature_sensor",
    category: "input",
    expectedBehavior: {
      // TMP36 at the default ambient temperature reads back ~24.7°C.
      simulateMs: 1200,
      serialContains: "Temp: 24.71",
    },
  },
  "ex-ultrasonic-sensor": {
    label: "Distance Sensor",
    description: "Measure distance with an HC-SR04.",
    primaryType: "ultrasonic_sensor",
    category: "input",
    expectedBehavior: {
      // Trigger pulses fire and the echo path answers (distance prints).
      simulateMs: 1200,
      pinToggles: [{ pin: 7, minToggles: 2 }],
      serialContains: "Distance:",
    },
  },
  "ex-lcd-16x2": {
    label: "LCD Hello World",
    description: "Print text on a 16×2 character LCD.",
    primaryType: "lcd_16x2",
    category: "display",
    expectedBehavior: {
      // The LCD peripheral must decode the 4-bit HD44780 writes into text.
      simulateMs: 1200,
      lcdShows: "Hello, World!",
    },
  },
  "ex-seven-segment": {
    label: "7-Segment Counter",
    description: "Count 0–9 on a seven-segment display.",
    primaryType: "seven_segment",
    category: "display",
    expectedBehavior: {
      // Counting 0→1 within 1.2s changes segments on pins 2/5/6/7.
      simulateMs: 1200,
      pinToggles: [
        { pin: 2, minToggles: 1 },
        { pin: 5, minToggles: 1 },
        { pin: 6, minToggles: 1 },
        { pin: 7, minToggles: 1 },
      ],
    },
  },
  "ex-neopixel": {
    label: "NeoPixel Rainbow",
    description: "Chase a rainbow across a NeoPixel strip.",
    primaryType: "neopixel",
    category: "output",
    expectedBehavior: {
      // The WS2812 peripheral must decode the 800kHz bitstream — all 8
      // pixels carry a rainbow color.
      simulateMs: 1200,
      neopixelMinLitPixels: 8,
      pinToggles: [{ pin: 6, minToggles: 1000 }],
    },
  },
  "ex-pir-sensor": {
    label: "Motion Alarm",
    description: "Detect motion with a PIR sensor, light an LED.",
    primaryType: "pir_sensor",
    category: "input",
    expectedBehavior: {
      // No motion in the default environment — the alarm LED stays off.
      simulateMs: 1200,
      pinFinalState: [{ pin: 13, state: "LOW" }],
    },
  },
  "ex-relay": {
    label: "Relay Toggle",
    description: "Toggle a relay on and off every 2 seconds.",
    primaryType: "relay",
    category: "output",
    expectedBehavior: {
      // First 2s window: coil driven HIGH.
      simulateMs: 1200,
      pinToggles: [{ pin: 7, minToggles: 1 }],
      pinFinalState: [{ pin: 7, state: "HIGH" }],
    },
  },
  "ex-dc-motor": {
    label: "Motor Speed",
    description: "Ramp a DC motor up and down with PWM.",
    primaryType: "dc_motor",
    category: "output",
    expectedBehavior: {
      // PWM ramp on pin 9 — hundreds of edges per second.
      simulateMs: 1200,
      pinToggles: [{ pin: 9, minToggles: 100 }],
    },
  },
  "ex-dht-sensor": {
    label: "Temp + Humidity",
    description: "Read a DHT sensor and print to Serial.",
    primaryType: "dht_sensor",
    category: "input",
    expectedBehavior: {
      // The DHT peripheral answers the one-wire request with a real frame —
      // a broken handshake surfaces as "nan".
      simulateMs: 2600,
      serialContains: "Humidity: 50.00%",
      serialNotContains: "nan",
    },
  },
  "ex-ir-receiver": {
    label: "IR Remote Decoder",
    description: "Decode IR signals and print hex codes.",
    primaryType: "ir_receiver",
    category: "input",
    expectedBehavior: {
      // Decoding needs a remote press (driven by the inspector, covered by
      // the ir-remote unit tests) — here we verify a clean idle run.
      simulateMs: 400,
    },
  },
  "ex-shift-register": {
    label: "LED Chaser (595)",
    description: "Drive 8 LEDs through a 74HC595.",
    primaryType: "shift_register",
    category: "output",
    expectedBehavior: {
      // shiftOut clocks bits on 11; the 595 peripheral must latch outputs.
      simulateMs: 1200,
      pinToggles: [{ pin: 11, minToggles: 50 }],
      shiftRegisterDrivesHigh: true,
    },
  },
  "ex-oled-display": {
    label: "OLED Hello",
    description: "Print text on a 128×64 SSD1306 over I²C.",
    primaryType: "oled_display",
    category: "display",
    expectedBehavior: {
      // The SSD1306 peripheral must ACK the I²C traffic and fill its
      // framebuffer — text rendering lights a few hundred pixels.
      simulateMs: 1200,
      oledMinLitPixels: 100,
    },
  },
}
