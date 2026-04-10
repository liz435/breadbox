// ── Flash Route ───────────────────────────────────────────────────────────
//
// POST /api/flash
// Compiles an Arduino sketch to HEX and uploads it to a connected board via
// arduino-cli. After a successful flash the board resets — we signal
// board-manager to reconnect after the bootloader window (2.5s).

import { Elysia } from "elysia"
import { z } from "zod"
import { createLogger } from "../logger"
import { reconnectAfter } from "../serial/board-manager"

const log = createLogger("flash")

const flashRequestSchema = z.object({
  port: z.string().min(1, "port is required"),
  code: z.string().min(1, "sketch code is required"),
  fqbn: z.string().default("arduino:avr:uno"),
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

  const { port, code, fqbn } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = `/tmp/arduino-flash-${sketchId}`
  const sketchFile = `${sketchDir}/sketch/sketch.ino`
  const outputDir = `${sketchDir}/output`

  try {
    // Check arduino-cli
    const check = await exec(["which", "arduino-cli"])
    if (check.exitCode !== 0) {
      set.status = 503
      return {
        error: "arduino-cli is not installed. Install from https://arduino.github.io/arduino-cli/",
      }
    }

    // Write sketch
    await Bun.write(sketchFile, "")
    await Bun.write(sketchFile, code)

    log.info(`Compiling for flash — sketch: ${sketchId}, port: ${port}`)

    // Compile
    const compileResult = await exec([
      "arduino-cli", "compile",
      "--fqbn", fqbn,
      "--output-dir", outputDir,
      `${sketchDir}/sketch`,
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
    const hexFile = `${outputDir}/sketch.ino.hex`
    const uploadResult = await exec([
      "arduino-cli", "upload",
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
    exec(["rm", "-rf", sketchDir]).catch(() => {})
  }
})
