// ── Arduino Sketch Compilation Route ──────────────────────────────────────
//
// POST /api/compile
// Compiles an Arduino sketch to Intel HEX using arduino-cli.
//
// Supports two library mechanisms:
//
//   1. `customLibraries` in the request body — user-authored header-only
//      libraries shipped inline with the sketch. Written to
//      `<sketchDir>/libs/<Name>/<Name>.h` and surfaced to arduino-cli via
//      `--libraries <sketchDir>/libs`.
//
//   2. Auto-install on missing-header errors. If the first compile fails
//      with `fatal error: Foo.h: No such file`, we search the Arduino
//      index for "Foo", install the match if unambiguous, and retry.
//      Capped at 3 retries per request. Disabled with
//      DREAMER_AUTO_INSTALL_LIBS=0.

import { Elysia } from "elysia"
import { z } from "zod"
import { tmpdir } from "os"
import { join } from "path"
import { rm } from "fs/promises"
import { createLogger } from "../logger"
import { resolveArduinoCli, ensureArduinoCliCore, ArduinoCliMissingError } from "../toolchain"
import {
  attemptAutoInstall,
  customLibrariesSchema,
  extractMissingHeader,
  writeCustomLibraries,
  type CustomLibrariesPayload,
} from "../libraries"
import { BOARD_TARGETS, boardTargetSchema, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

const log = createLogger("compile")

const compileRequestSchema = z.object({
  code: z.string().min(1, "Sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
  customLibraries: customLibrariesSchema,
})

async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content)
}

async function readFile(path: string): Promise<string> {
  const file = Bun.file(path)
  return file.text()
}

async function exec(
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { stdout, stderr, exitCode: await proc.exited }
}

// ── Internals ───────────────────────────────────────────────────────────────

/**
 * arduino-cli prepends a `#line 1` directive to the sketch which shifts
 * reported line numbers by one. Subtract to point errors at the user's code.
 */
function normalizeCompileError(stderr: string): string {
  const LINE_RE = /sketch\.ino:(\d+):(\d+):/g
  return stderr.replace(LINE_RE, (_match, line, col) => {
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

/**
 * Prepare the sketch directory: write the .ino and any custom libraries.
 * Returns the include-root to pass as `--libraries`, or null if no libs.
 */
async function prepareSketchDir(
  sketchDir: string,
  code: string,
  customLibraries: CustomLibrariesPayload,
): Promise<string | null> {
  const sketchFile = join(sketchDir, "sketch", "sketch.ino")
  await writeFile(sketchFile, code)

  if (Object.keys(customLibraries).length === 0) return null

  const libsDir = join(sketchDir, "libs")
  await writeCustomLibraries(libsDir, customLibraries)
  return libsDir
}

/**
 * Run a single `arduino-cli compile` invocation.
 */
async function runCompile(
  arduinoCli: string,
  sketchDir: string,
  fqbn: string,
  libsDir: string | null,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = [
    arduinoCli,
    "compile",
    "--fqbn", fqbn,
    "--output-dir", join(sketchDir, "output"),
  ]
  if (libsDir) args.push("--libraries", libsDir)
  args.push(join(sketchDir, "sketch"))
  return exec(args)
}

// ── Route ───────────────────────────────────────────────────────────────────

export const compileRoutes = new Elysia().post("/api/compile", async ({ body, set }) => {
  const parsed = compileRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  const boardTarget = parsed.data.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = parsed.data.fqbn ?? BOARD_TARGETS[boardTarget].fqbn
  const { code, customLibraries } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = join(tmpdir(), `arduino-sketch-${sketchId}`)
  const outputDir = join(sketchDir, "output")

  try {
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

    const libsDir = await prepareSketchDir(sketchDir, code, customLibraries)

    log.info(`Compiling sketch ${sketchId}${libsDir ? ` with ${Object.keys(customLibraries).length} custom libs` : ""}`)

    // Bounded auto-install retry loop: on a missing-header error, try to
    // install the matching third-party library and retry.
    const MAX_RETRIES = 3
    const autoInstalled: string[] = []
    let compileResult = await runCompile(arduinoCli, sketchDir, fqbn, libsDir)

    for (let attempt = 0; attempt < MAX_RETRIES && compileResult.exitCode !== 0; attempt++) {
      const stderr = compileResult.stderr + compileResult.stdout
      const missing = extractMissingHeader(stderr)
      if (!missing) break
      if (autoInstalled.includes(missing)) break // prevent loop on same header

      log.info(`sketch ${sketchId}: missing header "${missing}.h" — attempting auto-install`)
      const install = await attemptAutoInstall(missing)
      if ("reason" in install) {
        log.info(`sketch ${sketchId}: auto-install skipped — ${install.reason}`)
        break
      }
      log.info(`sketch ${sketchId}: installed "${install.installed}", retrying`)
      autoInstalled.push(missing)
      compileResult = await runCompile(arduinoCli, sketchDir, fqbn, libsDir)
    }

    if (compileResult.exitCode !== 0) {
      log.info(`Compilation failed for ${sketchId}: ${compileResult.stderr}`)
      const raw = compileResult.stderr || compileResult.stdout || "Compilation failed"
      return {
        error: normalizeCompileError(raw),
        autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
      }
    }

    const hexFile = join(outputDir, "sketch.ino.hex")
    let hexContent: string
    try {
      hexContent = await readFile(hexFile)
    } catch {
      const altHexFile = join(outputDir, "sketch.ino.with_bootloader.hex")
      try {
        hexContent = await readFile(altHexFile)
      } catch {
        set.status = 500
        return { error: "Compilation succeeded but hex file not found" }
      }
    }

    const sizeInfo = parseSizeInfo(compileResult.stderr + compileResult.stdout)

    log.info(`Compilation succeeded for ${sketchId}${autoInstalled.length > 0 ? ` (auto-installed: ${autoInstalled.join(", ")})` : ""}`)
    return {
      hex: hexContent,
      sizeInfo,
      autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
    }
  } catch (err) {
    log.info(`Compilation error: ${err instanceof Error ? err.message : "unknown"}`)
    set.status = 500
    return { error: err instanceof Error ? err.message : "Internal compilation error" }
  } finally {
    try {
      await rm(sketchDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  }
})
