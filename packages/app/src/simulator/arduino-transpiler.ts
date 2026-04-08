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
])

const RETURN_TYPES = new Set([
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
  "unsigned",
])

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
  if (POINTER_RE.test(trimmed) && !trimmed.startsWith("//") && !trimmed.startsWith("/*")) {
    // Avoid false positive on multiplication: check for pointer-specific patterns
    if (trimmed.includes("->") || /[&]\s*\w+/.test(trimmed) || /^\s*\w+\s*\*\s*\w+/.test(trimmed)) {
      return { line, message: "Pointer arithmetic is not supported" }
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

  // Substitute Arduino constants
  trimmed = substituteConstants(trimmed)

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

  // ── const type declarations: `const int PIN = 13;` ─────────
  const constDeclMatch = trimmed.match(
    /^const\s+(?:unsigned\s+)?(?:int|float|double|bool|boolean|byte|char|long|short|word|String)\s+(\w+)\s*=\s*(.+);$/,
  )
  if (constDeclMatch) {
    return `${indent}const ${constDeclMatch[1]} = ${constDeclMatch[2]};`
  }

  // ── Array declarations: `int arr[5];` or `int arr[5] = {1,2,3};` ─
  const arrayDeclMatch = trimmed.match(
    /^(?:unsigned\s+)?(?:int|float|double|bool|boolean|byte|char|long|short|word|String)\s+(\w+)\s*\[(\d+)?\]\s*(?:=\s*\{(.+?)\})?\s*;$/,
  )
  if (arrayDeclMatch) {
    const name = arrayDeclMatch[1]
    const size = arrayDeclMatch[2]
    const init = arrayDeclMatch[3]
    if (init) {
      return `${indent}let ${name} = [${init}];`
    }
    return `${indent}let ${name} = new Array(${size ?? 0}).fill(0);`
  }

  // ── Function definitions: `void setup() {` or `int readSensor() {` ─
  // Also handles one-liners like `void loop() {}` or `void loop() { body; }`
  const funcMatch = trimmed.match(
    /^(?:unsigned\s+)?(?:int|float|double|bool|boolean|byte|char|long|short|word|String|void)\s+(\w+)\s*\(([^)]*)\)\s*(\{.*)?$/,
  )
  if (funcMatch) {
    const name = funcMatch[1]
    const params = transpileParams(funcMatch[2])
    const braceAndBody = funcMatch[3] ?? ""
    return `${indent}function ${name}(${params}) ${braceAndBody}`.trimEnd()
  }

  // ── for loop with type: `for (int i = 0; ...)` ────────────
  const forMatch = trimmed.match(
    /^for\s*\(\s*(?:unsigned\s+)?(?:int|float|double|byte|long|short)\s+/,
  )
  if (forMatch) {
    return (
      indent +
      trimmed.replace(
        /\(\s*(?:unsigned\s+)?(?:int|float|double|byte|long|short)\s+/,
        "(let ",
      )
    )
  }

  // ── Class instantiation: `Servo motor;` or `LiquidCrystal lcd(12, 11, ...);`
  // Matches any PascalCase type (starts with uppercase) that isn't a C keyword,
  // followed by a variable name, optionally with constructor args.
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
  const varDeclMatch = trimmed.match(
    /^(?:unsigned\s+)?(?:int|float|double|bool|boolean|byte|char|long|short|word|String)\s+(\w+)\s*(?:=\s*(.+))?\s*;$/,
  )
  if (varDeclMatch) {
    const name = varDeclMatch[1]
    const value = varDeclMatch[2]
    if (value !== undefined) {
      return `${indent}let ${name} = ${value};`
    }
    return `${indent}let ${name} = 0;`
  }

  // ── Multi-variable declarations: `int a, b, c;` ───────────
  const multiVarMatch = trimmed.match(
    /^(?:unsigned\s+)?(?:int|float|double|bool|boolean|byte|char|long|short|word|String)\s+(\w+(?:\s*,\s*\w+)+)\s*;$/,
  )
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
  result = result.replace(/\bHIGH\b/g, "1")
  result = result.replace(/\bLOW\b/g, "0")
  result = result.replace(/\bINPUT\b/g, "0")
  result = result.replace(/\bOUTPUT\b/g, "1")
  result = result.replace(/\bINPUT_PULLUP\b/g, "2")
  return result
}

function transpileParams(params: string): string {
  // Remove type annotations from parameter declarations
  return params
    .split(",")
    .map((p) => {
      const trimmedParam = p.trim()
      if (trimmedParam === "") return ""
      // Match `type name` or `type name = default`
      const m = trimmedParam.match(
        /^(?:unsigned\s+)?(?:int|float|double|bool|boolean|byte|char|long|short|word|String)\s+(\w+)(.*)$/,
      )
      if (m) {
        return m[1] + m[2]
      }
      return trimmedParam
    })
    .join(", ")
}
