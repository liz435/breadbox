// ── Arduino Autocomplete Source ─────────────────────────────────────────────
//
// Provides Arduino-specific completions for the CodeMirror editor.

import type {
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete"

// ── Core Arduino functions ──────────────────────────────────────────────────

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
  { label: "pulseIn", type: "function", detail: "(pin, value, [timeout])", info: "Read a pulse duration in microseconds" },
  { label: "shiftOut", type: "function", detail: "(dataPin, clockPin, bitOrder, value)", info: "Shift out a byte one bit at a time" },
  { label: "shiftIn", type: "function", detail: "(dataPin, clockPin, bitOrder)", info: "Shift in a byte one bit at a time" },
  { label: "map", type: "function", detail: "(val, inMin, inMax, outMin, outMax)", info: "Re-map a number from one range to another" },
  { label: "constrain", type: "function", detail: "(val, min, max)", info: "Constrain a value to a range" },
  { label: "attachInterrupt", type: "function", detail: "(interrupt, ISR, mode)", info: "Attach an interrupt handler" },
  { label: "detachInterrupt", type: "function", detail: "(interrupt)", info: "Remove an interrupt handler" },
  { label: "digitalPinToInterrupt", type: "function", detail: "(pin)", info: "Convert pin number to interrupt number" },
  { label: "Serial.begin", type: "function", detail: "(baud)", info: "Start serial communication" },
  { label: "Serial.print", type: "function", detail: "(value)", info: "Print to serial monitor" },
  { label: "Serial.println", type: "function", detail: "(value)", info: "Print to serial monitor with newline" },
  { label: "Serial.available", type: "function", detail: "()", info: "Number of bytes available to read" },
  { label: "Serial.read", type: "function", detail: "()", info: "Read a byte from the serial buffer" },
  { label: "Serial.write", type: "function", detail: "(value)", info: "Write a byte or string to serial" },
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
  { label: "RISING", type: "constant", detail: "Interrupt mode" },
  { label: "FALLING", type: "constant", detail: "Interrupt mode" },
  { label: "CHANGE", type: "constant", detail: "Interrupt mode" },
  { label: "MSBFIRST", type: "constant", detail: "Bit order" },
  { label: "LSBFIRST", type: "constant", detail: "Bit order" },
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

// ── Built-in library completions ────────────────────────────────────────────

const includeCompletions: Completion[] = [
  { label: "#include <Servo.h>", type: "keyword", detail: "Built-in", info: "Servo motor control library" },
  { label: "#include <LiquidCrystal.h>", type: "keyword", detail: "Built-in", info: "LCD display library (16x2, 20x4)" },
  { label: "#include <EEPROM.h>", type: "keyword", detail: "Built-in", info: "Persistent storage (1KB)" },
  { label: "#include <Wire.h>", type: "keyword", detail: "Built-in", info: "I2C communication library" },
  { label: "#include <SPI.h>", type: "keyword", detail: "Built-in", info: "SPI communication library" },
  { label: "#include <Stepper.h>", type: "keyword", detail: "Built-in", info: "Stepper motor control library" },
]

const libraryCompletions: Completion[] = [
  // Servo
  { label: "Servo", type: "class", detail: "Servo.h", info: "Servo motor controller class" },
  { label: ".attach", type: "method", detail: "(pin)", info: "Attach servo to a pin", apply: "attach" },
  { label: ".write", type: "method", detail: "(angle)", info: "Set servo angle (0-180)", apply: "write" },
  { label: ".read", type: "method", detail: "()", info: "Read current servo angle", apply: "read" },
  { label: ".attached", type: "method", detail: "()", info: "Check if servo is attached", apply: "attached" },
  { label: ".detach", type: "method", detail: "()", info: "Detach servo from pin", apply: "detach" },

  // LiquidCrystal
  { label: "LiquidCrystal", type: "class", detail: "LiquidCrystal.h", info: "LCD display controller class" },
  { label: ".begin", type: "method", detail: "(cols, rows)", info: "Initialize LCD dimensions", apply: "begin" },
  { label: ".setCursor", type: "method", detail: "(col, row)", info: "Set cursor position", apply: "setCursor" },
  { label: ".print", type: "method", detail: "(text)", info: "Print text at cursor", apply: "print" },
  { label: ".clear", type: "method", detail: "()", info: "Clear LCD screen", apply: "clear" },

  // EEPROM
  { label: "EEPROM", type: "variable", detail: "EEPROM.h", info: "Persistent storage object (1KB)" },
  { label: "EEPROM.read", type: "function", detail: "(addr)", info: "Read byte from EEPROM address" },
  { label: "EEPROM.write", type: "function", detail: "(addr, val)", info: "Write byte to EEPROM address" },
  { label: "EEPROM.update", type: "function", detail: "(addr, val)", info: "Write only if value differs" },
  { label: "EEPROM.length", type: "function", detail: "()", info: "EEPROM size in bytes (1024)" },

  // Wire (I2C)
  { label: "Wire", type: "variable", detail: "Wire.h", info: "I2C communication object" },
  { label: "Wire.begin", type: "function", detail: "([addr])", info: "Initialize I2C as master or slave" },
  { label: "Wire.beginTransmission", type: "function", detail: "(addr)", info: "Begin I2C transmission to address" },
  { label: "Wire.write", type: "function", detail: "(data)", info: "Write data to I2C bus" },
  { label: "Wire.endTransmission", type: "function", detail: "()", info: "End I2C transmission" },
  { label: "Wire.requestFrom", type: "function", detail: "(addr, count)", info: "Request bytes from I2C device" },
  { label: "Wire.available", type: "function", detail: "()", info: "Bytes available to read" },
  { label: "Wire.read", type: "function", detail: "()", info: "Read byte from I2C buffer" },

  // SPI
  { label: "SPI", type: "variable", detail: "SPI.h", info: "SPI communication object" },
  { label: "SPI.begin", type: "function", detail: "()", info: "Initialize SPI bus" },
  { label: "SPI.transfer", type: "function", detail: "(data)", info: "Send and receive a byte" },
  { label: "SPI.beginTransaction", type: "function", detail: "(settings)", info: "Begin SPI transaction" },
  { label: "SPI.endTransaction", type: "function", detail: "()", info: "End SPI transaction" },

  // Stepper
  { label: "Stepper", type: "class", detail: "Stepper.h", info: "Stepper motor controller class" },
  { label: ".setSpeed", type: "method", detail: "(rpm)", info: "Set stepper speed in RPM", apply: "setSpeed" },
  { label: ".step", type: "method", detail: "(steps)", info: "Move stepper by number of steps", apply: "step" },
]

const allCompletions: Completion[] = [
  ...functionCompletions,
  ...constantCompletions,
  ...typeCompletions,
  ...libraryCompletions,
]

/** Extract user-defined identifiers from the document text. */
function extractUserIdentifiers(doc: string): Completion[] {
  const seen = new Set<string>()
  const varRe = /\b(?:int|float|double|char|bool|boolean|byte|long|short|word|String|unsigned|void|auto)\s+(\w+)/g
  const funcRe = /\b(?:int|float|double|char|bool|boolean|byte|long|short|word|String|void)\s+(\w+)\s*\(/g
  const defineRe = /#define\s+(\w+)/g
  const classRe = /\b(?:class|struct)\s+(\w+)/g
  // Match Servo/LiquidCrystal/Stepper instance declarations: Servo myServo;
  const instanceRe = /\b(?:Servo|LiquidCrystal|Stepper)\s+(\w+)/g

  const completions: Completion[] = []

  for (const re of [varRe, funcRe, defineRe, classRe, instanceRe]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(doc)) !== null) {
      const name = m[1]
      if (name.length < 2 || seen.has(name)) continue
      seen.add(name)
      const isFn = re === funcRe
      const isCls = re === classRe
      const isInstance = re === instanceRe
      completions.push({
        label: name,
        type: isCls ? "class" : isFn ? "function" : isInstance ? "variable" : "variable",
        detail: isInstance ? "instance" : undefined,
        boost: -1,
      })
    }
  }

  return completions
}

export function arduinoCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const word = context.matchBefore(/[\w.#<>]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const text = context.state.doc.sliceString(word.from, word.to)

  // #include completions — when typing # or #include
  if (text.startsWith("#")) {
    return {
      from: word.from,
      options: includeCompletions,
      validFor: /^[#\w<>. ]*$/,
    }
  }

  // Merge built-in completions with user-defined identifiers from current doc
  const docText = context.state.doc.toString()
  const userCompletions = extractUserIdentifiers(docText)

  // Filter out the word being typed from user completions (avoid self-suggestion)
  const currentWord = docText.slice(word.from, word.to)
  const filtered = userCompletions.filter(c => c.label !== currentWord)

  return {
    from: word.from,
    options: [...allCompletions, ...filtered],
    validFor: /^[\w.]*$/,
  }
}
