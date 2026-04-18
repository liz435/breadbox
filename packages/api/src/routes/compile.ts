// ── Arduino Sketch Compilation Route ──────────────────────────────────────
//
// POST /api/compile
// Compiles an Arduino sketch to Intel HEX using arduino-cli.
// Requires arduino-cli and the selected board core to be installed.

import { Elysia } from "elysia"
import { z } from "zod"
import { tmpdir } from "os"
import { join } from "path"
import { rm } from "fs/promises"
import { createLogger } from "../logger"
import { resolveArduinoCli, ensureArduinoCliCore, ArduinoCliMissingError } from "../toolchain"
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
  const sketchDir = join(tmpdir(), `arduino-sketch-${sketchId}`)
  const sketchFile = join(sketchDir, "sketch", "sketch.ino")
  const outputDir = join(sketchDir, "output")

  try {
    // Resolve arduino-cli via the toolchain resolver. For API (non-TTY)
    // contexts, auto-install is gated on DREAMER_AUTO_INSTALL=1 — otherwise
    // we surface the missing-binary error as a 503 so the client can prompt
    // its user.
    let arduinoCli: string
    try {
      arduinoCli = await resolveArduinoCli({ install: process.env.DREAMER_AUTO_INSTALL === "1" })
      await ensureArduinoCliCore("arduino:avr")
    } catch (err) {
      if (err instanceof ArduinoCliMissingError) {
        set.status = 503
        return { error: err.message }
      }
      throw err
    }

    // Create the sketch directory structure (arduino-cli requires a directory
    // containing a .ino file with the same name as the directory)
    await Bun.write(sketchFile, "")  // ensure parent dirs
    await writeFile(sketchFile, code)

    log.info(`Compiling sketch ${sketchId}`)

    // Compile using arduino-cli
    const compileResult = await exec([
      arduinoCli,
      "compile",
      "--fqbn",
      fqbn,
      "--output-dir",
      outputDir,
      join(sketchDir, "sketch"),
    ])

    if (compileResult.exitCode !== 0) {
      log.info(`Compilation failed for ${sketchId}: ${compileResult.stderr}`)
      const raw = compileResult.stderr || compileResult.stdout || "Compilation failed"
      return { error: normalizeCompileError(raw) }
    }

    // Read the generated .hex file
    const hexFile = join(outputDir, "sketch.ino.hex")
    let hexContent: string
    try {
      hexContent = await readFile(hexFile)
    } catch {
      // Try alternative name patterns
      const altHexFile = join(outputDir, "sketch.ino.with_bootloader.hex")
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
    // Clean up temp files — platform-neutral.
    try {
      await rm(sketchDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  }
})
