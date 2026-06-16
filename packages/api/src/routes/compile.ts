// ── Arduino Sketch Compilation Route ──────────────────────────────────────
//
// POST /api/compile  →  application/x-ndjson stream
//
// Compiles an Arduino sketch to Intel HEX using arduino-cli, streaming
// arduino-cli's stdout + stderr line-by-line as NDJSON events so the app
// can render a live compile log (Arduino-IDE "Output" pane behavior).
//
// Event types on the wire:
//   {"kind":"log","tag":"compiler","line":"…","ts":…}
//   {"kind":"done","hex":"…","sizeInfo":{…},"autoInstalled"?:[…]}
//   {"kind":"error","message":"…","autoInstalled"?:[…]}
//
// Supports two library mechanisms:
//
//   1. `customLibraries` in the request body — user-authored header-only
//      libraries shipped inline with the sketch.
//
//   2. Auto-install on missing-header errors. If the first compile fails
//      with `fatal error: Foo.h: No such file`, we search the Arduino
//      index for "Foo", install the match if unambiguous, and retry.
//      Capped at 3 retries per request.

import { Elysia } from "elysia"
import { z } from "zod"
import { tmpdir } from "os"
import { join } from "path"
import { rm } from "fs/promises"
import { createLogger } from "../logger"
import {
  resolveArduinoCli,
  ensureArduinoCliCore,
  coreFamilyForFqbn,
  ArduinoCliMissingError,
} from "../toolchain"
import {
  attemptAutoInstall,
  customLibrariesSchema,
  extractMissingHeader,
  writeCustomLibraries,
  type CustomLibrariesPayload,
} from "../libraries"
import { BOARD_TARGETS, boardTargetSchema, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"
import { createNdjsonStream, pumpProcessStream, type StreamWriter } from "./_stream-lines"
import { readFirmwareArtifact } from "./_firmware-artifact"
import { extractLineTable } from "../line-table"
import { spawnWithTimeout } from "../process-utils"
import {
  acquireCompileSlot,
  CompileBusyError,
  CompileCancelledError,
  compileSlotStats,
} from "./_compile-limiter"
import type { AuthContext } from "../auth/context"
import { authPlugin } from "../auth/auth-plugin"
import { requireRateLimit, RateLimitError } from "../auth/rate-limit"
import { auditLog } from "../auth/audit-log"

const log = createLogger("compile")

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route")
  return auth.userId
}

/** Wall-clock ceiling for a single compile invocation. */
const COMPILE_TIMEOUT_MS = 120_000

const compileRequestSchema = z.object({
  code: z.string().min(1, "Sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
  customLibraries: customLibrariesSchema,
})

async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content)
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

type CompileOutcome = {
  stdout: string
  stderr: string
  exitCode: number
  aborted: "timeout" | "signal" | null
}

/**
 * Spawn `arduino-cli compile` and stream its stdout+stderr line-by-line to
 * the NDJSON writer. Returns the accumulated buffers + exit code so the
 * route can still run post-hoc regex extraction (sizeInfo, missing header).
 */
async function streamCompile(
  arduinoCli: string,
  sketchDir: string,
  fqbn: string,
  libsDir: string | null,
  writer: StreamWriter,
  signal: AbortSignal,
): Promise<CompileOutcome> {
  const args = [
    arduinoCli,
    "compile",
    "--fqbn", fqbn,
    "--output-dir", join(sketchDir, "output"),
  ]
  if (libsDir) args.push("--libraries", libsDir)
  args.push(join(sketchDir, "sketch"))

  const handle = spawnWithTimeout(args, {
    timeoutMs: COMPILE_TIMEOUT_MS,
    signal,
  })
  const stdoutSink = { buffer: "" }
  const stderrSink = { buffer: "" }
  await Promise.all([
    pumpProcessStream(handle.proc.stdout, "compiler", writer, stdoutSink),
    pumpProcessStream(handle.proc.stderr, "compiler", writer, stderrSink),
  ])
  const exitCode = await handle.exitPromise
  return {
    stdout: stdoutSink.buffer,
    stderr: stderrSink.buffer,
    exitCode,
    aborted: handle.abortReason(),
  }
}

// ── Route ───────────────────────────────────────────────────────────────────

export const compileRoutes = new Elysia().use(authPlugin).post("/api/compile", async ({ auth, body, request, set }) => {
  const ownerId = requireOwnerId(auth)
  const parsed = compileRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  try {
    await requireRateLimit("compile", ownerId, auth?.mode)
  } catch (err) {
    if (err instanceof RateLimitError) {
      set.status = 429
      set.headers["Retry-After"] = String(err.retryAfterSec)
      return { error: err.message, retryAfterSec: err.retryAfterSec }
    }
    throw err
  }

  let release: () => void
  try {
    release = await acquireCompileSlot(request.signal)
  } catch (err) {
    if (err instanceof CompileBusyError) {
      const stats = compileSlotStats()
      log.info(`queue full — rejecting compile (active=${stats.active}, queued=${stats.queued})`)
      set.status = 429
      return { error: err.message }
    }
    if (err instanceof CompileCancelledError) {
      set.status = 499
      return { error: err.message }
    }
    throw err
  }

  const boardTarget = parsed.data.boardTarget ?? DEFAULT_BOARD_TARGET
  const fqbn = parsed.data.fqbn ?? BOARD_TARGETS[boardTarget].fqbn
  const { code, customLibraries } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = join(tmpdir(), `arduino-sketch-${sketchId}`)
  const outputDir = join(sketchDir, "output")

  void auditLog({
    userId: ownerId,
    action: "compile.start",
    extra: { sketchId, fqbn },
  })

  const { stream, writer } = createNdjsonStream()
  const signal = request.signal

  // Run the whole compile flow in a detached async IIFE so we can return the
  // ReadableStream synchronously and the browser starts seeing chunks as
  // soon as the first arduino-cli line arrives.
  ;(async () => {
    try {
      let arduinoCli: string
      try {
        arduinoCli = await resolveArduinoCli({ install: process.env.BREADBOX_AUTO_INSTALL === "1" })
        await ensureArduinoCliCore(coreFamilyForFqbn(fqbn), writer)
      } catch (err) {
        if (err instanceof ArduinoCliMissingError) {
          writer.write({ kind: "error", message: err.message })
          return
        }
        throw err
      }

      const libsDir = await prepareSketchDir(sketchDir, code, customLibraries)

      log.info(`Compiling sketch ${sketchId}${libsDir ? ` with ${Object.keys(customLibraries).length} custom libs` : ""}`)
      writer.write({
        kind: "log",
        tag: "compiler",
        line: `arduino-cli compile --fqbn ${fqbn}`,
        ts: Date.now(),
      })

      // Bounded auto-install retry loop: on a missing-header error, try to
      // install the matching third-party library and retry.
      const MAX_RETRIES = 3
      const autoInstalled: string[] = []
      let compileResult = await streamCompile(arduinoCli, sketchDir, fqbn, libsDir, writer, signal)

      for (let attempt = 0; attempt < MAX_RETRIES && compileResult.exitCode !== 0 && compileResult.aborted === null; attempt++) {
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
        log.info(`sketch ${sketchId}: missing header "${missing}.h" — attempting auto-install`)
        const install = await attemptAutoInstall(missing)
        if ("reason" in install) {
          writer.write({
            kind: "log",
            tag: "compiler",
            line: `[auto-install] skipped — ${install.reason}`,
            ts: Date.now(),
          })
          log.info(`sketch ${sketchId}: auto-install skipped — ${install.reason}`)
          break
        }
        writer.write({
          kind: "log",
          tag: "compiler",
          line: `[auto-install] installed "${install.installed}" — retrying compile`,
          ts: Date.now(),
        })
        log.info(`sketch ${sketchId}: installed "${install.installed}", retrying`)
        autoInstalled.push(missing)
        compileResult = await streamCompile(arduinoCli, sketchDir, fqbn, libsDir, writer, signal)
      }

      if (compileResult.aborted !== null) {
        const message = compileResult.aborted === "timeout"
          ? `compile timed out after ${COMPILE_TIMEOUT_MS / 1000}s`
          : "compile cancelled"
        log.info(`Compilation aborted for ${sketchId}: ${compileResult.aborted}`)
        writer.write({ kind: "error", message })
        return
      }

      if (compileResult.exitCode !== 0) {
        log.info(`Compilation failed for ${sketchId}`)
        const raw = compileResult.stderr || compileResult.stdout || "Compilation failed"
        writer.write({
          kind: "error",
          message: normalizeCompileError(raw),
          autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
        })
        return
      }

      // AVR fqbns produce Intel HEX; RP2040 fqbns produce UF2 (binary blob
      // that we base64-encode to fit inside NDJSON). The frontend decodes
      // based on `format`.
      const firmware = await readFirmwareArtifact(outputDir, fqbn)
      if (!firmware) {
        writer.write({ kind: "error", message: "Compilation succeeded but firmware artifact not found" })
        return
      }

      const sizeInfo = parseSizeInfo(compileResult.stderr + compileResult.stdout)

      // Source-line → address table for the simulator's debugger (AVR only).
      // Best-effort: a miss just omits the field. Runs before the `finally`
      // deletes the build dir, so the ELF is still present here.
      const lineTable =
        firmware.format === "hex"
          ? await extractLineTable(outputDir, arduinoCli, fqbn)
          : null

      log.info(`Compilation succeeded for ${sketchId}${autoInstalled.length > 0 ? ` (auto-installed: ${autoInstalled.join(", ")})` : ""}`)
      writer.write({
        kind: "done",
        format: firmware.format,
        data: firmware.data,
        sizeInfo,
        lineTable: lineTable ?? undefined,
        autoInstalled: autoInstalled.length > 0 ? autoInstalled : undefined,
      })
    } catch (err) {
      log.info(`Compilation error: ${err instanceof Error ? err.message : "unknown"}`)
      writer.write({
        kind: "error",
        message: err instanceof Error ? err.message : "Internal compilation error",
      })
    } finally {
      writer.close()
      release()
      try {
        await rm(sketchDir, { recursive: true, force: true })
      } catch {
        // Best effort cleanup
      }
    }
  })()

  set.headers["content-type"] = "application/x-ndjson"
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson" },
  })
})
