// ── Flash Route ───────────────────────────────────────────────────────────
//
// POST /api/flash  →  application/x-ndjson stream
//
// Compiles an Arduino sketch to HEX and uploads it to a connected board via
// arduino-cli. Compile output is tagged `compiler`, avrdude upload output
// is tagged `upload` — one chronological NDJSON stream covers both phases.
// After a successful flash the board resets; we signal board-manager to
// reconnect after the bootloader window (2.5s).
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
import { createNdjsonStream, pumpProcessStream, type LogTag, type StreamWriter } from "./_stream-lines"

const log = createLogger("flash")

const flashRequestSchema = z.object({
  port: z.string().min(1, "port is required"),
  code: z.string().min(1, "sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
  customLibraries: customLibrariesSchema,
})

async function streamProc(
  cmd: string[],
  tag: LogTag,
  writer: StreamWriter,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const stdoutSink = { buffer: "" }
  const stderrSink = { buffer: "" }
  await Promise.all([
    pumpProcessStream(proc.stdout, tag, writer, stdoutSink),
    pumpProcessStream(proc.stderr, tag, writer, stderrSink),
  ])
  const exitCode = await proc.exited
  return { stdout: stdoutSink.buffer, stderr: stderrSink.buffer, exitCode }
}

async function streamCompile(
  arduinoCli: string,
  sketchDir: string,
  fqbn: string,
  libsDir: string | null,
  writer: StreamWriter,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = [
    arduinoCli,
    "compile",
    "--fqbn", fqbn,
    "--output-dir", join(sketchDir, "output"),
  ]
  if (libsDir) args.push("--libraries", libsDir)
  args.push(join(sketchDir, "sketch"))
  return streamProc(args, "compiler", writer)
}

export const flashRoutes = new Elysia().post("/api/flash", ({ body, set }) => {
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

  const { stream, writer } = createNdjsonStream()

  ;(async () => {
    try {
      let arduinoCli: string
      try {
        arduinoCli = await resolveArduinoCli({ install: process.env.DREAMER_AUTO_INSTALL === "1" })
        await ensureArduinoCliCore("arduino:avr")
      } catch (err) {
        if (err instanceof ArduinoCliMissingError) {
          writer.write({ kind: "error", stage: "compile", message: err.message })
          return
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
      writer.write({
        kind: "log",
        tag: "compiler",
        line: `arduino-cli compile --fqbn ${fqbn}`,
        ts: Date.now(),
      })

      // Auto-install retry for missing headers. Same pattern as /api/compile.
      const MAX_RETRIES = 3
      const autoInstalled: string[] = []
      let compileResult = await streamCompile(arduinoCli, sketchDir, fqbn, libsDir, writer)

      for (let attempt = 0; attempt < MAX_RETRIES && compileResult.exitCode !== 0; attempt++) {
        const stderr = compileResult.stderr + compileResult.stdout
        const missing = extractMissingHeader(stderr)
        if (!missing) break
        if (autoInstalled.includes(missing)) break

        writer.write({
          kind: "log",
          tag: "compiler",
          line: `[auto-install] missing header "${missing}.h" — searching Arduino library index…`,
          ts: Date.now(),
        })
        log.info(`flash ${sketchId}: missing header "${missing}.h" — attempting auto-install`)
        const install = await attemptAutoInstall(missing)
        if ("reason" in install) {
          writer.write({
            kind: "log",
            tag: "compiler",
            line: `[auto-install] skipped — ${install.reason}`,
            ts: Date.now(),
          })
          log.info(`flash ${sketchId}: auto-install skipped — ${install.reason}`)
          break
        }
        writer.write({
          kind: "log",
          tag: "compiler",
          line: `[auto-install] installed "${install.installed}" — retrying compile`,
          ts: Date.now(),
        })
        log.info(`flash ${sketchId}: installed "${install.installed}", retrying compile`)
        autoInstalled.push(missing)
        compileResult = await streamCompile(arduinoCli, sketchDir, fqbn, libsDir, writer)
      }

      if (compileResult.exitCode !== 0) {
        writer.write({
          kind: "error",
          stage: "compile",
          message: compileResult.stderr || compileResult.stdout || "Compilation failed",
          autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
        })
        return
      }

      log.info(`Flashing to ${port}`)
      writer.write({
        kind: "log",
        tag: "upload",
        line: `arduino-cli upload -p ${port} --fqbn ${fqbn}`,
        ts: Date.now(),
      })

      const hexFile = join(outputDir, "sketch.ino.hex")
      const uploadResult = await streamProc(
        [arduinoCli, "upload", "-p", port, "--fqbn", fqbn, "--input-file", hexFile],
        "upload",
        writer,
      )

      if (uploadResult.exitCode !== 0) {
        writer.write({
          kind: "error",
          stage: "flash",
          message: uploadResult.stderr || uploadResult.stdout || "Upload failed",
        })
        return
      }

      log.info(`Flash succeeded — ${port}`)
      reconnectAfter(port, 2_500)

      writer.write({
        kind: "done",
        stage: "flash",
        autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
      })
    } catch (err) {
      writer.write({
        kind: "error",
        message: err instanceof Error ? err.message : "Internal error",
      })
    } finally {
      writer.close()
      rm(sketchDir, { recursive: true, force: true }).catch(() => {})
    }
  })()

  set.headers["content-type"] = "application/x-ndjson"
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson" },
  })
})
