// ── Arduino Linter ──────────────────────────────────────────────────────────
//
// Custom lint source that checks for common Arduino sketch issues AND
// displays the last transpile error inline (from transpileErrorRef).

import type { Diagnostic } from "@codemirror/lint"
import type { EditorView } from "@codemirror/view"
import { transpileErrorRef } from "@/simulator/transpile-error-ref"
import { getBoardAnalogPins, parseArduinoPinToken, type BoardTarget } from "@dreamer/schemas"

const PWM_PINS_BY_TARGET: Record<BoardTarget, Set<number>> = {
  arduino_uno: new Set([3, 5, 6, 9, 10, 11]),
  arduino_nano: new Set([3, 5, 6, 9, 10, 11]),
  arduino_mega_2560: new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]),
}

const ANALOG_PINS_BY_TARGET: Record<BoardTarget, Set<number>> = {
  arduino_uno: new Set(getBoardAnalogPins("arduino_uno")),
  arduino_nano: new Set(getBoardAnalogPins("arduino_nano")),
  arduino_mega_2560: new Set(getBoardAnalogPins("arduino_mega_2560")),
}

function parsePin(raw: string, boardTarget: BoardTarget): number | null {
  return parseArduinoPinToken(raw, boardTarget)
}

export function arduinoLinter(
  view: EditorView,
  boardTarget: BoardTarget = "arduino_uno",
): Diagnostic[] {
  const text = view.state.doc.toString()
  const diagnostics: Diagnostic[] = []
  const pwmPins = PWM_PINS_BY_TARGET[boardTarget]
  const analogPins = ANALOG_PINS_BY_TARGET[boardTarget]

  // ── Transpile error from last compilation attempt ──
  const transpileWrap = transpileErrorRef.current
  if (transpileWrap) {
    const transpileErr = transpileWrap.error
    // Convert 1-based line number to character positions
    const line = Math.max(1, Math.min(transpileErr.line, view.state.doc.lines))
    const lineObj = view.state.doc.line(line)
    diagnostics.push({
      from: lineObj.from,
      to: lineObj.to,
      severity: "error",
      message: transpileErr.message,
    })
  }

  // ── Static checks ──

  // Missing setup()
  const hasSetup = /\bvoid\s+setup\s*\(/.test(text)
  if (!hasSetup && text.trim().length > 0) {
    diagnostics.push({
      from: 0,
      to: Math.min(text.length, 1),
      severity: "warning",
      message: "Missing setup() function. Arduino sketches require a void setup() function.",
    })
  }

  // Missing loop()
  const hasLoop = /\bvoid\s+loop\s*\(/.test(text)
  if (!hasLoop && text.trim().length > 0) {
    diagnostics.push({
      from: 0,
      to: Math.min(text.length, 1),
      severity: "warning",
      message: "Missing loop() function. Arduino sketches require a void loop() function.",
    })
  }

  // analogWrite on non-PWM pin
  const analogWriteRegex = /\banalogWrite\s*\(\s*(\w+)/g
  let match: RegExpExecArray | null = null
  while ((match = analogWriteRegex.exec(text)) !== null) {
    const pinArg = match[1]
    const pin = parsePin(pinArg, boardTarget)
    if (pin !== null && !pwmPins.has(pin)) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "error",
        message: `analogWrite: pin ${pinArg} is not a PWM pin for ${boardTarget}.`,
      })
    }
  }

  // analogRead on non-analog pin
  const analogReadRegex = /\banalogRead\s*\(\s*(\w+)/g
  while ((match = analogReadRegex.exec(text)) !== null) {
    const pinArg = match[1]
    const pin = parsePin(pinArg, boardTarget)
    if (pin !== null && !analogPins.has(pin)) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "error",
        message: `analogRead: pin ${pinArg} is not an analog pin for ${boardTarget}.`,
      })
    }
  }

  return diagnostics
}
