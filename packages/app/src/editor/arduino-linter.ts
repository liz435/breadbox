// ── Arduino Linter ──────────────────────────────────────────────────────────
//
// Custom lint source that checks for common Arduino sketch issues AND
// displays the last transpile error inline (from transpileErrorRef).

import type { Diagnostic } from "@codemirror/lint"
import type { EditorView } from "@codemirror/view"
import { transpileErrorRef } from "@/simulator/transpile-error-ref"

const PWM_PINS = new Set([3, 5, 6, 9, 10, 11])
const ANALOG_PINS = new Set([14, 15, 16, 17, 18, 19]) // A0-A5

function parsePin(raw: string): number | null {
  const analogMatch = raw.match(/^A(\d)$/)
  if (analogMatch) {
    const idx = parseInt(analogMatch[1], 10)
    if (idx >= 0 && idx <= 5) return 14 + idx
    return null
  }
  const num = parseInt(raw, 10)
  return Number.isNaN(num) ? null : num
}

export function arduinoLinter(view: EditorView): Diagnostic[] {
  const text = view.state.doc.toString()
  const diagnostics: Diagnostic[] = []

  // ── Transpile error from last compilation attempt ──
  const transpileErr = transpileErrorRef.current
  if (transpileErr) {
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
    const pin = parsePin(pinArg)
    if (pin !== null && !PWM_PINS.has(pin)) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "error",
        message: `analogWrite: pin ${pinArg} is not a PWM pin. PWM is available on pins 3, 5, 6, 9, 10, 11.`,
      })
    }
  }

  // analogRead on non-analog pin
  const analogReadRegex = /\banalogRead\s*\(\s*(\w+)/g
  while ((match = analogReadRegex.exec(text)) !== null) {
    const pinArg = match[1]
    const pin = parsePin(pinArg)
    if (pin !== null && !ANALOG_PINS.has(pin)) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "error",
        message: `analogRead: pin ${pinArg} is not an analog pin. Analog read is available on A0-A5 (pins 14-19).`,
      })
    }
  }

  return diagnostics
}
