// ── Arduino Sketch Compilation Route ──────────────────────────────────────
//
// POST /api/compile
// Compiles an Arduino sketch to Intel HEX using arduino-cli.
// Requires arduino-cli and the selected board core to be installed.

import { Elysia } from "elysia"
import { z } from "zod"
import { createLogger } from "../logger"
import { BOARD_TARGETS, boardTargetSchema, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

const log = createLogger("compile")

const compileRequestSchema = z.object({
  code: z.string().min(1, "Sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
})

/**
 * Write a file using Bun's native file API, creating parent dirs as needed.
 */
async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content)
}

/**
 * Read a file's text content.
 */
async function readFile(path: string): Promise<string> {
  const file = Bun.file(path)
  return file.text()
}

/**
 * Run a shell command and return stdout/stderr.
 */
async function exec(
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

// ── Internals ───────────────────────────────────────────────────────────────

/**
 * arduino-cli prepends a generated header to the sketch file, shifting all
 * line numbers. The header is typically 1-2 lines. We detect the offset by
 * counting how many lines are prepended before the user's first non-empty line,
 * and subtract it from reported line numbers so errors point to the right place.
 *
 * Pattern in stderr:  /path/to/sketch/sketch.ino:N:M: error: message
 */
function normalizeCompileError(stderr: string): string {
  // arduino-cli adds exactly one "#line 1" directive at the top of the sketch
  // which shifts everything by 1 line. Subtract 1 from all reported line numbers.
  const LINE_RE = /sketch\.ino:(\d+):(\d+):/g
  return stderr.replace(LINE_RE, (match, line, col) => {
    const corrected = Math.max(1, parseInt(line, 10) - 1)
    return `sketch.ino:${corrected}:${col}:`
  })
}

export type SketchSizeInfo = {
  flashUsed: number
  flashMax: number
  flashPercent: number
  ramUsed: number
  ramMax: number
  ramPercent: number
}

/**
 * Parse the size summary lines that arduino-cli prints after a successful compile.
 * Example:
 *   Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.
 *   Global variables use 9 bytes (0%) of dynamic memory, leaving 2039 bytes for local variables. Maximum is 2048 bytes.
 */
function parseSizeInfo(output: string): SketchSizeInfo | null {
  const flashMatch = output.match(
    /Sketch uses (\d+) bytes \((\d+)%\) of program storage space\. Maximum is (\d+) bytes/,
  )
  const ramMatch = output.match(
    /Global variables use (\d+) bytes \((\d+)%\) of dynamic memory.*Maximum is (\d+) bytes/,
  )
  if (!flashMatch || !ramMatch) return null
  return {
    flashUsed: parseInt(flashMatch[1], 10),
    flashMax: parseInt(flashMatch[3], 10),
    flashPercent: parseInt(flashMatch[2], 10),
    ramUsed: parseInt(ramMatch[1], 10),
    ramMax: parseInt(ramMatch[3], 10),
    ramPercent: parseInt(ramMatch[2], 10),
  }
}

export const compileRoutes = new Elysia().post("/api/compile", async ({ body, set }) => {
  // Validate request body
  const parsed = compileRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  const boardTarget = parsed.data.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = parsed.data.fqbn ?? BOARD_TARGETS[boardTarget].fqbn
  const { code } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = `/tmp/arduino-sketch-${sketchId}`
  const sketchFile = `${sketchDir}/sketch/sketch.ino`
  const outputDir = `${sketchDir}/output`

  try {
    // Check if arduino-cli is available
    const checkResult = await exec(["which", "arduino-cli"])
    if (checkResult.exitCode !== 0) {
      set.status = 503
      return {
        error:
          "arduino-cli is not installed. Install it from https://arduino.github.io/arduino-cli/ and ensure the Arduino AVR core is installed.",
      }
    }

    // Create the sketch directory structure (arduino-cli requires a directory
    // containing a .ino file with the same name as the directory)
    await Bun.write(sketchFile, "")  // ensure parent dirs
    await writeFile(sketchFile, code)

    log.info(`Compiling sketch ${sketchId}`)

    // Compile using arduino-cli
    const compileResult = await exec([
      "arduino-cli",
      "compile",
      "--fqbn",
      fqbn,
      "--output-dir",
      outputDir,
      `${sketchDir}/sketch`,
    ])

    if (compileResult.exitCode !== 0) {
      log.info(`Compilation failed for ${sketchId}: ${compileResult.stderr}`)
      const raw = compileResult.stderr || compileResult.stdout || "Compilation failed"
      return { error: normalizeCompileError(raw) }
    }

    // Read the generated .hex file
    const hexFile = `${outputDir}/sketch.ino.hex`
    let hexContent: string
    try {
      hexContent = await readFile(hexFile)
    } catch {
      // Try alternative name patterns
      const altHexFile = `${outputDir}/sketch.ino.with_bootloader.hex`
      try {
        hexContent = await readFile(altHexFile)
      } catch {
        set.status = 500
        return { error: "Compilation succeeded but hex file not found" }
      }
    }

    // Extract size info from compiler output
    const sizeInfo = parseSizeInfo(compileResult.stderr + compileResult.stdout)

    log.info(`Compilation succeeded for ${sketchId}`)
    return { hex: hexContent, sizeInfo }
  } catch (err) {
    log.info(`Compilation error: ${err instanceof Error ? err.message : "unknown"}`)
    set.status = 500
    return {
      error: err instanceof Error ? err.message : "Internal compilation error",
    }
  } finally {
    // Clean up temp files
    try {
      const rmResult = await exec(["rm", "-rf", sketchDir])
      if (rmResult.exitCode !== 0) {
        log.info(`Failed to clean up ${sketchDir}`)
      }
    } catch {
      // Best effort cleanup
    }
  }
})
