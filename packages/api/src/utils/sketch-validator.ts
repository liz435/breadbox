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
