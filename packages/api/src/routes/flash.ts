// ── Flash Route ───────────────────────────────────────────────────────────
//
// POST /api/flash
// Compiles an Arduino sketch to HEX and uploads it to a connected board via
// arduino-cli. After a successful flash the board resets — we signal
// board-manager to reconnect after the bootloader window (2.5s).
//
// Supports the same library conventions as /api/compile:
//   - `customLibraries` written to `<sketchDir>/libs/<Name>/<Name>.h`
//   - Auto-install on missing-header compile errors (bounded retries)

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
} from "../libraries"
import { reconnectAfter } from "../serial/board-manager"
import { BOARD_TARGETS, boardTargetSchema, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

const log = createLogger("flash")

const flashRequestSchema = z.object({
  port: z.string().min(1, "port is required"),
  code: z.string().min(1, "sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
  customLibraries: customLibrariesSchema,
})

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

export const flashRoutes = new Elysia().post("/api/flash", async ({ body, set }) => {
  const parsed = flashRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  const boardTarget = parsed.data.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = parsed.data.fqbn ?? BOARD_TARGETS[boardTarget].fqbn
  const { port, code, customLibraries } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = join(tmpdir(), `arduino-flash-${sketchId}`)
  const sketchFile = join(sketchDir, "sketch", "sketch.ino")
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

    await Bun.write(sketchFile, code)
    let libsDir: string | null = null
    if (Object.keys(customLibraries).length > 0) {
      libsDir = join(sketchDir, "libs")
      await writeCustomLibraries(libsDir, customLibraries)
    }

    log.info(`Compiling for flash — sketch: ${sketchId}, port: ${port}${libsDir ? `, customLibs: ${Object.keys(customLibraries).length}` : ""}`)

    // Auto-install retry for missing headers. Same pattern as /api/compile.
    const MAX_RETRIES = 3
    const autoInstalled: string[] = []
    let compileResult = await runCompile(arduinoCli, sketchDir, fqbn, libsDir)

    for (let attempt = 0; attempt < MAX_RETRIES && compileResult.exitCode !== 0; attempt++) {
      const stderr = compileResult.stderr + compileResult.stdout
      const missing = extractMissingHeader(stderr)
      if (!missing) break
      if (autoInstalled.includes(missing)) break

      log.info(`flash ${sketchId}: missing header "${missing}.h" — attempting auto-install`)
      const install = await attemptAutoInstall(missing)
      if ("reason" in install) {
        log.info(`flash ${sketchId}: auto-install skipped — ${install.reason}`)
        break
      }
      log.info(`flash ${sketchId}: installed "${install.installed}", retrying compile`)
      autoInstalled.push(missing)
      compileResult = await runCompile(arduinoCli, sketchDir, fqbn, libsDir)
    }

    if (compileResult.exitCode !== 0) {
      return {
        success: false,
        stage: "compile",
        error: compileResult.stderr || compileResult.stdout || "Compilation failed",
        autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
      }
    }

    log.info(`Flashing to ${port}`)

    const hexFile = join(outputDir, "sketch.ino.hex")
    const uploadResult = await exec([
      arduinoCli, "upload",
      "-p", port,
      "--fqbn", fqbn,
      "--input-file", hexFile,
    ])

    if (uploadResult.exitCode !== 0) {
      return {
        success: false,
        stage: "flash",
        error: uploadResult.stderr || uploadResult.stdout || "Upload failed",
      }
    }

    log.info(`Flash succeeded — ${port}`)
    reconnectAfter(port, 2_500)

    return {
      success: true,
      stdout: uploadResult.stdout,
      stderr: uploadResult.stderr,
      autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
    }
  } catch (err) {
    set.status = 500
    return { error: err instanceof Error ? err.message : "Internal error" }
  } finally {
    rm(sketchDir, { recursive: true, force: true }).catch(() => {})
  }
})
