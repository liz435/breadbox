// ── Sketch pre-compile validator ───────────────────────────────────────────
//
// Lightweight structural check for Arduino sketches. Runs synchronously on
// the agent's edit path so obvious mistakes (unbalanced braces, missing
// setup/loop) get caught before a compile round-trip. The real syntax
// check happens in arduino-cli when the sketch actually runs — this
// utility is just a fast-fail guard.

export type SketchValidationResult = {
  valid: boolean
  error?: string
  line?: number
}

/**
 * Strip C/C++ comments and string literals so brace counting isn't thrown
 * off by `"{"` in a string or `/* }` in a comment. Keeps newlines so line
 * numbers stay intact.
 */
function stripCommentsAndStrings(code: string): string {
  let out = ""
  let i = 0
  const len = code.length
  while (i < len) {
    const ch = code[i]
    const next = code[i + 1]

    // Line comment
    if (ch === "/" && next === "/") {
      while (i < len && code[i] !== "\n") i++
      continue
    }
    // Block comment
    if (ch === "/" && next === "*") {
      i += 2
      while (i < len && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") out += "\n"
        i++
      }
      i += 2
      continue
    }
    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < len && code[i] !== quote) {
        if (code[i] === "\\" && i + 1 < len) i += 2
        else if (code[i] === "\n") { out += "\n"; i++ }
        else i++
      }
      i++
      continue
    }

    out += ch
    i++
  }
  return out
}

function findUnbalancedBrace(code: string): { char: "{" | "}" | "(" | ")"; line: number } | null {
  let braceDepth = 0
  let parenDepth = 0
  let line = 1
  let lastOpenBraceLine = 1
  let lastOpenParenLine = 1
  for (const ch of code) {
    if (ch === "\n") {
      line++
      continue
    }
    if (ch === "{") {
      braceDepth++
      lastOpenBraceLine = line
    } else if (ch === "}") {
      braceDepth--
      if (braceDepth < 0) return { char: "}", line }
    } else if (ch === "(") {
      parenDepth++
      lastOpenParenLine = line
    } else if (ch === ")") {
      parenDepth--
      if (parenDepth < 0) return { char: ")", line }
    }
  }
  if (braceDepth > 0) return { char: "{", line: lastOpenBraceLine }
  if (parenDepth > 0) return { char: "(", line: lastOpenParenLine }
  return null
}

/**
 * Map an A-prefixed token to its canonical Arduino pin index (Uno: A0=14..A5=19).
 * Returns null for anything else.
 */
function resolveAnalogToken(token: string): number | null {
  const m = /^A(\d+)$/.exec(token)
  if (!m) return null
  const idx = Number(m[1])
  if (!Number.isInteger(idx) || idx < 0 || idx > 5) return null
  return 14 + idx
}

/**
 * Best-effort pin resolution from a sketch identifier. Handles:
 *   - integer literals: `7`, `13`
 *   - analog tokens: `A0`..`A5`
 *   - identifier references resolved against a constants map
 * Returns null when the token can't be confidently mapped — verifiers
 * should treat null as "unknown, don't flag" rather than as a failure.
 */
function resolvePinToken(token: string, constants: Map<string, number>): number | null {
  const trimmed = token.trim()
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  const analog = resolveAnalogToken(trimmed)
  if (analog !== null) return analog
  const c = constants.get(trimmed)
  return c ?? null
}

/**
 * Scan the (comment- and string-stripped) sketch for top-level pin
 * declarations like `int echoPin = 8;`, `const int trigPin = 7;`,
 * `#define LED_PIN 13`, `byte servoPin = A0;`. Only literal integer or
 * A-prefixed RHS values are captured — anything else is left unresolved.
 */
function collectPinConstants(stripped: string): Map<string, number> {
  const consts = new Map<string, number>()
  const decl = /(?:^|;|\n)\s*(?:const\s+)?(?:int|byte|uint8_t|short|unsigned\s+int)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9_]+)\s*;/g
  let m: RegExpExecArray | null
  while ((m = decl.exec(stripped)) !== null) {
    const name = m[1]
    const rhs = m[2]
    if (/^-?\d+$/.test(rhs)) consts.set(name, Number(rhs))
    else {
      const a = resolveAnalogToken(rhs)
      if (a !== null) consts.set(name, a)
    }
  }
  const define = /(?:^|\n)\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z0-9_]+)/g
  while ((m = define.exec(stripped)) !== null) {
    const name = m[1]
    const rhs = m[2]
    if (/^-?\d+$/.test(rhs)) consts.set(name, Number(rhs))
    else {
      const a = resolveAnalogToken(rhs)
      if (a !== null) consts.set(name, a)
    }
  }
  return consts
}

export type SketchPinReference = {
  /** Canonical Arduino pin index (D0..D13 = 0..13, A0..A5 = 14..19). */
  pin: number
  /** Call sites where this pin was referenced, e.g. `pinMode(echoPin, INPUT)`. */
  callSites: string[]
}

/**
 * Extract Arduino pins referenced from sketch code by the standard pin-IO
 * intrinsics (pinMode/digitalRead/digitalWrite/analogRead/analogWrite/
 * pulseIn/tone/noTone) and from `Servo.attach(...)`. Best-effort:
 * unresolvable identifiers are skipped, not flagged. Returns one entry
 * per distinct pin with the call sites that referenced it.
 */
export function extractPinReferences(code: string): SketchPinReference[] {
  if (!code.trim()) return []
  const stripped = stripCommentsAndStrings(code)
  const consts = collectPinConstants(stripped)

  const calls: Array<{ fn: string; arg: string; raw: string }> = []
  // Standard pin-IO intrinsics: pin is always the first arg.
  const ioFns = /\b(pinMode|digitalRead|digitalWrite|analogRead|analogWrite|pulseIn|tone|noTone)\s*\(\s*([^,\s)]+)/g
  let m: RegExpExecArray | null
  while ((m = ioFns.exec(stripped)) !== null) {
    calls.push({ fn: m[1], arg: m[2], raw: `${m[1]}(${m[2]})` })
  }
  // Servo.attach style: `<var>.attach(pin)`. We assume any `.attach(<int|A#|ident>)`
  // call is servo-shaped (the only Arduino lib using that exact name is Servo).
  const attachFns = /(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\.attach\s*\(\s*([^,\s)]+)/g
  while ((m = attachFns.exec(stripped)) !== null) {
    calls.push({ fn: `${m[1]}.attach`, arg: m[2], raw: `${m[1]}.attach(${m[2]})` })
  }

  const byPin = new Map<number, string[]>()
  for (const c of calls) {
    const pin = resolvePinToken(c.arg, consts)
    if (pin === null) continue
    const list = byPin.get(pin) ?? []
    list.push(c.raw)
    byPin.set(pin, list)
  }
  return Array.from(byPin.entries())
    .sort(([a], [b]) => a - b)
    .map(([pin, callSites]) => ({ pin, callSites }))
}

/**
 * Check a sketch for structural errors that would definitely fail to
 * compile. Empty sketches are treated as valid so callers can gate on
 * "does the user have code yet?" separately.
 */
export function validateSketch(code: string): SketchValidationResult {
  if (!code.trim()) return { valid: true }

  const stripped = stripCommentsAndStrings(code)

  const unbalanced = findUnbalancedBrace(stripped)
  if (unbalanced) {
    const which = unbalanced.char === "{" || unbalanced.char === "}" ? "brace" : "parenthesis"
    return {
      valid: false,
      error: `Unbalanced ${which} near '${unbalanced.char}'`,
      line: unbalanced.line,
    }
  }

  if (!/\bvoid\s+setup\s*\(/.test(stripped)) {
    return { valid: false, error: "Sketch missing setup() function" }
  }
  if (!/\bvoid\s+loop\s*\(/.test(stripped)) {
    return { valid: false, error: "Sketch missing loop() function" }
  }

  return { valid: true }
}
