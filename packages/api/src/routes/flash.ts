// ── Flash Route ───────────────────────────────────────────────────────────
//
// POST /api/flash
// Compiles an Arduino sketch to HEX and uploads it to a connected board via
// arduino-cli. After a successful flash the board resets — we signal
// board-manager to reconnect after the bootloader window (2.5s).

import { Elysia } from "elysia"
import { z } from "zod"
import { tmpdir } from "os"
import { join } from "path"
import { rm } from "fs/promises"
import { createLogger } from "../logger"
import { resolveArduinoCli, ensureArduinoCliCore, ArduinoCliMissingError } from "../toolchain"
import { reconnectAfter } from "../serial/board-manager"
import { BOARD_TARGETS, boardTargetSchema, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

const log = createLogger("flash")

const flashRequestSchema = z.object({
  port: z.string().min(1, "port is required"),
  code: z.string().min(1, "sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
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

export const flashRoutes = new Elysia().post("/api/flash", async ({ body, set }) => {
  const parsed = flashRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  const boardTarget = parsed.data.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = parsed.data.fqbn ?? BOARD_TARGETS[boardTarget].fqbn
  const { port, code } = parsed.data
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

    // Write sketch
    await Bun.write(sketchFile, "")
    await Bun.write(sketchFile, code)

    log.info(`Compiling for flash — sketch: ${sketchId}, port: ${port}`)

    // Compile
    const compileResult = await exec([
      arduinoCli, "compile",
      "--fqbn", fqbn,
      "--output-dir", outputDir,
      join(sketchDir, "sketch"),
    ])

    if (compileResult.exitCode !== 0) {
      return {
        success: false,
        stage: "compile",
        error: compileResult.stderr || compileResult.stdout || "Compilation failed",
      }
    }

    log.info(`Flashing to ${port}`)

    // Upload
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

    // Board is resetting — reconnect after the bootloader window
    reconnectAfter(port, 2_500)

    return {
      success: true,
      stdout: uploadResult.stdout,
      stderr: uploadResult.stderr,
    }
  } catch (err) {
    set.status = 500
    return { error: err instanceof Error ? err.message : "Internal error" }
  } finally {
    rm(sketchDir, { recursive: true, force: true }).catch(() => {})
  }
})
