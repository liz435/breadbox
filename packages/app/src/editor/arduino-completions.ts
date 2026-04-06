// ── Arduino Autocomplete Source ─────────────────────────────────────────────
//
// Provides Arduino-specific completions for the CodeMirror editor.

import type {
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete"

const functionCompletions: Completion[] = [
  { label: "pinMode", type: "function", detail: "(pin, mode)", info: "Configure a pin as INPUT or OUTPUT" },
  { label: "digitalWrite", type: "function", detail: "(pin, value)", info: "Write HIGH or LOW to a digital pin" },
  { label: "digitalRead", type: "function", detail: "(pin)", info: "Read HIGH or LOW from a digital pin" },
  { label: "analogWrite", type: "function", detail: "(pin, value)", info: "Write PWM value (0-255) to a pin" },
  { label: "analogRead", type: "function", detail: "(pin)", info: "Read analog value (0-1023) from a pin" },
  { label: "delay", type: "function", detail: "(ms)", info: "Pause execution for milliseconds" },
  { label: "delayMicroseconds", type: "function", detail: "(us)", info: "Pause execution for microseconds" },
  { label: "millis", type: "function", detail: "()", info: "Milliseconds since program started" },
  { label: "micros", type: "function", detail: "()", info: "Microseconds since program started" },
  { label: "tone", type: "function", detail: "(pin, freq, [duration])", info: "Generate a square wave on a pin" },
  { label: "noTone", type: "function", detail: "(pin)", info: "Stop tone generation on a pin" },
  { label: "map", type: "function", detail: "(val, inMin, inMax, outMin, outMax)", info: "Re-map a number from one range to another" },
  { label: "constrain", type: "function", detail: "(val, min, max)", info: "Constrain a value to a range" },
  { label: "attachInterrupt", type: "function", detail: "(interrupt, ISR, mode)", info: "Attach an interrupt handler" },
  { label: "Serial.begin", type: "function", detail: "(baud)", info: "Start serial communication" },
  { label: "Serial.print", type: "function", detail: "(value)", info: "Print to serial monitor" },
  { label: "Serial.println", type: "function", detail: "(value)", info: "Print to serial monitor with newline" },
  { label: "Serial.available", type: "function", detail: "()", info: "Number of bytes available to read" },
  { label: "Serial.read", type: "function", detail: "()", info: "Read a byte from the serial buffer" },
]

const constantCompletions: Completion[] = [
  { label: "HIGH", type: "constant", detail: "1" },
  { label: "LOW", type: "constant", detail: "0" },
  { label: "INPUT", type: "constant", detail: "Pin mode" },
  { label: "OUTPUT", type: "constant", detail: "Pin mode" },
  { label: "INPUT_PULLUP", type: "constant", detail: "Pin mode with pull-up" },
  { label: "LED_BUILTIN", type: "constant", detail: "Built-in LED pin (13)" },
  { label: "A0", type: "constant", detail: "Analog pin 0 (14)" },
  { label: "A1", type: "constant", detail: "Analog pin 1 (15)" },
  { label: "A2", type: "constant", detail: "Analog pin 2 (16)" },
  { label: "A3", type: "constant", detail: "Analog pin 3 (17)" },
  { label: "A4", type: "constant", detail: "Analog pin 4 (18)" },
  { label: "A5", type: "constant", detail: "Analog pin 5 (19)" },
]

const typeCompletions: Completion[] = [
  { label: "void", type: "type" },
  { label: "int", type: "type" },
  { label: "float", type: "type" },
  { label: "char", type: "type" },
  { label: "bool", type: "type" },
  { label: "boolean", type: "type" },
  { label: "byte", type: "type" },
  { label: "long", type: "type" },
  { label: "unsigned", type: "type" },
  { label: "String", type: "type" },
]

const allCompletions: Completion[] = [
  ...functionCompletions,
  ...constantCompletions,
  ...typeCompletions,
]

export function arduinoCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  // Match word characters and dots (for Serial.xxx)
  const word = context.matchBefore(/[\w.]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  return {
    from: word.from,
    options: allCompletions,
    validFor: /^[\w.]*$/,
  }
}
