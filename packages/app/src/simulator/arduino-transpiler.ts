// ── Arduino C++ → JavaScript Transpiler ────────────────────────────────────
//
// Handles a beginner-friendly subset of Arduino C++. NOT a full C++ parser.
// Transpiled code defines setup() and loop() as plain JS functions.

export type TranspileError = {
  line: number
  message: string
}

export type TranspileResult = {
  success: boolean
  code: string
  error?: TranspileError
}

/** Custom library map passed to the transpiler. Key = filename (e.g. "MyLib.h"), value = code. */
export type CustomLibraryMap = Record<string, string>

const KNOWN_LIBRARIES = new Set([
  "Servo.h",
  "LiquidCrystal.h",
  "EEPROM.h",
  "Wire.h",
  "SPI.h",
  "Stepper.h",
  "Adafruit_NeoPixel.h",
  "DHT.h",
  "IRremote.h",
  "Adafruit_SSD1306.h",
])

const C_TYPES = new Set([
  "int",
  "float",
  "double",
  "bool",
  "boolean",
  "byte",
  "char",
  "long",
  "short",
  "word",
  "String",
  "void",
  "unsigned",
  "uint8_t",
  "uint16_t",
  "uint32_t",
  "int8_t",
  "int16_t",
  "int32_t",
  "size_t",
])

/** Type keywords that can appear as return types or in declarations. */
const TYPE_PATTERN = "(?:unsigned\\s+long|unsigned\\s+int|unsigned\\s+char|unsigned|int|float|double|bool|boolean|byte|char|long|short|word|String|void|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t)"

// Unsupported feature patterns
const POINTER_RE = /[*&]\s*\w+|->|\w+\s*\*\s/
const TEMPLATE_RE = /^\s*template\s*</
const NAMESPACE_RE = /^\s*namespace\s+\w+/

/**
 * Transpile Arduino C++ source to executable JavaScript.
 *
 * The output is a self-contained JS string that, when evaluated, defines
 * `setup()` and `loop()` functions (and any user-defined helpers).
 *
 * @param customLibraries Optional map of custom library filenames to their code.
 *   When the sketch has `#include "MyLib.h"`, the library code is transpiled and prepended.
 */
export function transpile(arduinoCode: string, customLibraries?: CustomLibraryMap): TranspileResult {
  const lines = arduinoCode.split("\n")
  const output: string[] = []
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    let line = lines[i]

    // ── Block comment tracking ────────────────────────────────────
    if (inBlockComment) {
      const endIdx = line.indexOf("*/")
      if (endIdx !== -1) {
        inBlockComment = false
        output.push(line.slice(0, endIdx + 2))
        // Process remainder of line after block comment ends
        line = line.slice(endIdx + 2)
        if (line.trim() === "") continue
      } else {
        output.push(line)
        continue
      }
    }

    // Check for block comment start (not inside a string)
    const blockStart = line.indexOf("/*")
    if (blockStart !== -1 && !line.slice(0, blockStart).includes("//")) {
      const blockEnd = line.indexOf("*/", blockStart + 2)
      if (blockEnd === -1) {
        inBlockComment = true
        output.push(line)
        continue
      }
      // Single-line block comment — pass through
    }

    const trimmed = line.trim()

    // ── Empty lines ──────────────────────────────────────────────
    if (trimmed === "") {
      output.push("")
      continue
    }

    // ── Line comments ────────────────────────────────────────────
    if (trimmed.startsWith("//")) {
      output.push(line)
      continue
    }

    // ── Unsupported feature detection ────────────────────────────
    const unsupported = detectUnsupported(trimmed, lineNum)
    if (unsupported) {
      return { success: false, code: "", error: unsupported }
    }

    // ── Preprocessor directives ──────────────────────────────────
    if (trimmed.startsWith("#")) {
      const directive = transpileDirective(trimmed, lineNum, customLibraries)
      if (directive.error) {
        return { success: false, code: "", error: directive.error }
      }
      if (directive.output !== null) {
        output.push(directive.output)
      }
      continue
    }

    // ── Transform the line ───────────────────────────────────────
    output.push(transpileLine(line))
  }

  return { success: true, code: output.join("\n") }
}

function detectUnsupported(
  trimmed: string,
  line: number,
): TranspileError | null {
  const withoutStrings = trimmed.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''")
  if (POINTER_RE.test(withoutStrings) && !withoutStrings.startsWith("//") && !withoutStrings.startsWith("/*")) {
    // E1/E2: char*/char[] string aliases and pointer params are handled in transpileLine — skip them here
    const isCharStringAlias = /^(?:const\s+)?char\s*\*\s*\w+\s*=/.test(withoutStrings)
      || /^(?:const\s+)?char\s+\w+\s*\[\s*\]\s*=/.test(withoutStrings)
    const isPointerParam = /^[a-z_]\w*\s*\([^)]*\*[^)]*\)/.test(withoutStrings)
    if (!isCharStringAlias && !isPointerParam) {
      if (withoutStrings.includes("->") || /[&]\s*\w+/.test(withoutStrings) || /^\s*\w+\s*\*\s*\w+/.test(withoutStrings)) {
        return {
          line,
          message: "Pass-by-reference (&) is not supported — use return values or global variables instead",
        }
      }
    }
  }
  if (TEMPLATE_RE.test(trimmed)) {
    return { line, message: "Templates are not supported" }
  }
  if (NAMESPACE_RE.test(trimmed)) {
    return { line, message: "Namespaces are not supported" }
  }
  return null
}

type DirectiveResult = {
  output: string | null
  error?: TranspileError
}

function transpileDirective(trimmed: string, line: number, customLibs?: CustomLibraryMap): DirectiveResult {
  // #include
  const includeMatch = trimmed.match(/^#include\s*[<"](.+?)[>"]/)
  if (includeMatch) {
    const lib = includeMatch[1]
    if (KNOWN_LIBRARIES.has(lib)) {
      // Built-in libraries are provided as globals — skip the include
      return { output: `// #include <${lib}> (provided as global)` }
    }
    if (customLibs && lib in customLibs) {
      // Custom library — transpile and inline its code
      const libResult = transpile(customLibs[lib])
      if (!libResult.success) {
        return {
          output: null,
          error: {
            line,
            message: `Error in custom library "${lib}": ${libResult.error?.message ?? "unknown error"}`,
          },
        }
      }
      return { output: `// ── ${lib} (custom library) ──\n${libResult.code}\n// ── end ${lib} ──` }
    }
    return {
      output: null,
      error: {
        line,
        message: `Unsupported library: ${lib}. Built-in: ${[...KNOWN_LIBRARIES].join(", ")}. Or add it as a custom library.`,
      },
    }
  }

  // #define
  const defineMatch = trimmed.match(/^#define\s+(\w+)\s+(.+)$/)
  if (defineMatch) {
    return { output: `const ${defineMatch[1]} = ${defineMatch[2]};` }
  }

  // Other preprocessor — ignore
  return { output: `// ${trimmed}` }
}

/**
 * Transform a single non-directive, non-comment line of Arduino C++.
 */
function transpileLine(line: string): string {
  const indent = line.match(/^(\s*)/)?.[1] ?? ""
  let trimmed = line.trim()

  // Strip inline comment before matching (preserves it in output)
  let inlineComment = ""
  const commentIdx = trimmed.indexOf("//")
  if (commentIdx > 0) {
    const before = trimmed.slice(0, commentIdx)
    const singles = (before.match(/'/g) || []).length
    const doubles = (before.match(/"/g) || []).length
    if (singles % 2 === 0 && doubles % 2 === 0) {
      inlineComment = " " + trimmed.slice(commentIdx)
      trimmed = before.trim()
    }
  }

  // Substitute Arduino constants
  trimmed = substituteConstants(trimmed)

  // Process the line, then append the inline comment back
  const transformed = processCodeLine(indent, trimmed)
  return transformed + inlineComment
}

function processCodeLine(indent: string, trimmed: string): string {

  // ── class/struct → JS class ─────────────────────────────────
  // `class Foo {` or `class Foo : public Bar {`
  const classMatch = trimmed.match(/^(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+\w+)?\s*\{?\s*$/)
  if (classMatch) {
    return `${indent}class ${classMatch[1]} ${trimmed.includes("{") ? "{" : ""}`
  }
  // `public:` / `private:` / `protected:` → comment (JS classes don't have these)
  if (/^(?:public|private|protected)\s*:\s*$/.test(trimmed)) {
    return `${indent}// ${trimmed}`
  }

  // ── enum → const declarations ──────────────────────────────
  // `enum { RED, GREEN, BLUE };` or `enum Colors { RED, GREEN, BLUE };`
  const enumMatch = trimmed.match(/^enum\s*(?:\w+\s*)?\{(.+?)\}\s*;?$/)
  if (enumMatch) {
    const members = enumMatch[1].split(",").map((m) => m.trim()).filter(Boolean)
    const decls = members.map((m, i) => {
      const eqMatch = m.match(/^(\w+)\s*=\s*(.+)$/)
      if (eqMatch) return `const ${eqMatch[1]} = ${eqMatch[2]};`
      return `const ${m} = ${i};`
    })
    return indent + decls.join(" ")
  }

  // ── static variable declarations ──────────────────────────
  // `static int x = 0;` → hoist to outer scope via a closure-friendly pattern.
  // We emit `var` (function-scoped, not block-scoped) so it persists across loop() calls.
  const staticRe = new RegExp(`^static\\s+${TYPE_PATTERN}\\s+(\\w+)\\s*(?:=\\s*(.+))?\\s*;$`)
  const staticMatch = trimmed.match(staticRe)
  if (staticMatch) {
    const name = staticMatch[1]
    const value = staticMatch[2]
    // Use `var` for function-level hoisting — persists across calls in the VM scope
    if (value !== undefined) {
      return `${indent}if (typeof ${name} === "undefined") var ${name} = ${value};`
    }
    return `${indent}if (typeof ${name} === "undefined") var ${name} = 0;`
  }

  // ── E1: char* / char[] string aliases ─────────────────────────
  // `char* msg = "hello"` or `char msg[] = "hello"` → `let msg = "hello"`
  // `const char* msg = "hello"` or `const char msg[] = "hello"` → `const msg = "hello"`
  const charPtrRe = /^(const\s+)?char\s*(?:\*|\[\s*\])\s*(\w+)\s*=\s*(.+);$/
  const charPtrMatch = trimmed.match(charPtrRe)
  if (charPtrMatch) {
    const kw = charPtrMatch[1] ? "const" : "let"
    return `${indent}${kw} ${charPtrMatch[2]} = ${charPtrMatch[3]};`
  }

  // ── const type declarations: `const int PIN = 13;` ─────────
  const constDeclRe = new RegExp(`^const\\s+${TYPE_PATTERN}\\s+(\\w+)\\s*=\\s*(.+);$`)
  const constDeclMatch = trimmed.match(constDeclRe)
  if (constDeclMatch) {
    return `${indent}const ${constDeclMatch[1]} = ${constDeclMatch[2]};`
  }

  // ── const type without initializer: `const int x;` → `let x;`
  const constNoInitRe = new RegExp(`^const\\s+${TYPE_PATTERN}\\s+(\\w+)\\s*;$`)
  const constNoInitMatch = trimmed.match(constNoInitRe)
  if (constNoInitMatch) {
    return `${indent}let ${constNoInitMatch[1]};`
  }

  // ── Array declarations: `int arr[5];` or `int arr[] = {1,2,3};` or `const int arr[] = {...}` ─
  const arrayDeclRe = new RegExp(`^(?:const\\s+)?${TYPE_PATTERN}\\s+(\\w+)\\s*\\[(\\d+)?\\]\\s*(?:=\\s*\\{(.+?)\\})?\\s*;$`)
  const arrayDeclMatch = trimmed.match(arrayDeclRe)
  if (arrayDeclMatch) {
    const name = arrayDeclMatch[1]
    const size = arrayDeclMatch[2]
    const init = arrayDeclMatch[3]
    const keyword = trimmed.startsWith("const") ? "const" : "let"
    if (init) {
      return `${indent}${keyword} ${name} = [${init}];`
    }
    return `${indent}let ${name} = new Array(${size ?? 0}).fill(0);`
  }

  // ── Function definitions: `void setup() {` or `int readSensor() {` ─
  const funcRe = new RegExp(`^${TYPE_PATTERN}\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*(\\{.*)?$`)
  const funcMatch = trimmed.match(funcRe)
  if (funcMatch) {
    const name = funcMatch[1]
    const params = transpileParams(funcMatch[2])
    const braceAndBody = funcMatch[3] ?? ""
    return `${indent}function ${name}(${params}) ${braceAndBody}`.trimEnd()
  }

  // ── for loop with type: `for (int i = 0; ...)` ────────────
  const forRe = new RegExp(`^for\\s*\\(\\s*${TYPE_PATTERN}\\s+`)
  if (forRe.test(trimmed)) {
    return indent + trimmed.replace(new RegExp(`\\(\\s*${TYPE_PATTERN}\\s+`), "(let ")
  }

  // ── C-style casts: `(int)x`, `(float)val`, `(uint32_t)color` ─
  // Integer casts → strip (JS numbers are already fine for Arduino range)
  // Float casts → strip (no-op in JS)
  trimmed = trimmed.replace(
    /\((?:unsigned\s+long|unsigned\s+int|unsigned\s+char|unsigned|int|long|short|byte|char|word|float|double|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t)\)\s*/g,
    "",
  )

  // ── Class instantiation: `Servo motor;` or `LiquidCrystal lcd(12, 11, ...);`
  const classInstMatch = trimmed.match(
    /^([A-Z]\w+)\s+(\w+)\s*(?:\(([^)]*)\))?\s*;$/,
  )
  if (classInstMatch && !C_TYPES.has(classInstMatch[1])) {
    const className = classInstMatch[1]
    const varName = classInstMatch[2]
    const args = classInstMatch[3]
    if (args !== undefined) {
      return `${indent}let ${varName} = new ${className}(${args});`
    }
    return `${indent}let ${varName} = new ${className}();`
  }

  // ── Variable declarations: `int x = 5;` or `int x;` ──────
  const varDeclRe = new RegExp(`^${TYPE_PATTERN}\\s+(\\w+)\\s*(?:=\\s*(.+))?\\s*;$`)
  const varDeclMatch = trimmed.match(varDeclRe)
  if (varDeclMatch) {
    const name = varDeclMatch[1]
    const value = varDeclMatch[2]
    if (value !== undefined) {
      return `${indent}let ${name} = ${value};`
    }
    return `${indent}let ${name} = 0;`
  }

  // ── Multi-variable declarations: `int a, b, c;` ───────────
  const multiVarRe = new RegExp(`^${TYPE_PATTERN}\\s+(\\w+(?:\\s*,\\s*\\w+)+)\\s*;$`)
  const multiVarMatch = trimmed.match(multiVarRe)
  if (multiVarMatch) {
    const names = multiVarMatch[1].split(",").map((n) => n.trim())
    return `${indent}let ${names.join(", ")};`
  }

  // ── Everything else passes through with constant substitution ──
  return indent + trimmed
}

function substituteConstants(line: string): string {
  // Replace whole-word occurrences of Arduino constants
  let result = line
  // Arduino flash-string macro: F("text") -> "text" in JS runtime.
  // Keep this narrow to string-literal arguments so normal identifiers named
  // `F` are untouched.
  result = result.replace(
    /\bF\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\)/g,
    "$1",
  )
  result = result.replace(/\bHIGH\b/g, "1")
  result = result.replace(/\bLOW\b/g, "0")
  result = result.replace(/\bINPUT\b/g, "0")
  result = result.replace(/\bOUTPUT\b/g, "1")
  result = result.replace(/\bINPUT_PULLUP\b/g, "2")
  return result
}

function transpileParams(params: string): string {
  // E2: also match pointer-typed params: `int* arr` or `char* str`
  const paramTypeRe = new RegExp(`^(?:const\\s+)?${TYPE_PATTERN}\\s*\\*?\\s*(\\w+)(.*)$`)
  return params
    .split(",")
    .map((p) => {
      const trimmedParam = p.trim()
      if (trimmedParam === "") return ""
      const m = trimmedParam.match(paramTypeRe)
      if (m) {
        return m[1] + m[2]
      }
      return trimmedParam
    })
    .join(", ")
}

// ── Debug shim (C2) ─────────────────────────────────────────────────────
//
// Injects a __d_report() function that emits telemetry frames over Serial.
// Frame format: D|<millis>|<d0..d13>|<a0,a1,a2,a3,a4,a5>
// Reports at most every 50ms so bandwidth stays under control.
//
// Used by the hardware debug feature: the API server parses these frames and
// stores them in the telemetry buffer for the agent and the pin diff view.

const DEBUG_SHIM = `
// ── Dreamer debug shim ──────────────────────────────────────────────────
unsigned long __d_lastReport = 0;
void __d_report() {
  if (millis() - __d_lastReport < 50) return;
  __d_lastReport = millis();
  Serial.print("D|");
  Serial.print(millis());
  Serial.print("|");
  for (int __i = 0; __i <= 13; __i++) {
    Serial.print(digitalRead(__i));
  }
  Serial.print("|");
  for (int __i = 0; __i < 6; __i++) {
    if (__i > 0) Serial.print(",");
    Serial.print(analogRead(__i));
  }
  Serial.println();
}
// ── end debug shim ───────────────────────────────────────────────────────

`

/**
 * Inject the debug telemetry shim into an Arduino sketch.
 * The shim function is prepended; a call to __d_report() is inserted at the
 * top of the loop() body so every iteration emits a frame.
 *
 * Does NOT modify setup() or any other user-defined function.
 */
export function injectDebugShim(code: string): string {
  // Insert __d_report() at the start of the loop() body
  // Handles: `void loop() {` on its own line or with code after the brace
  const loopBodyRe = /\bvoid\s+loop\s*\(\s*\)\s*\{/
  const instrumented = code.replace(loopBodyRe, (match) => `${match}\n  __d_report();`)
  return DEBUG_SHIM + instrumented
}
