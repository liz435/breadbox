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
} from "../libraries"
import { reconnectAfter } from "../serial/board-manager"
import { BOARD_TARGETS, boardTargetSchema, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"
import { createNdjsonStream, pumpProcessStream, type LogTag, type StreamWriter } from "./_stream-lines"
import {
  buildFlashUploadArgs,
  expectedFirmwareArtifactNameForFqbn,
  findFirmwareArtifactPath,
} from "./_firmware-artifact"
import { IS_HOSTED } from "../env"
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

const log = createLogger("flash")

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route")
  return auth.userId
}

// Allowlist serial port paths: macOS tty/cu devices, Linux ttyUSB/ttyACM/ttyS, Windows COM.
// Defense-in-depth against a buggy client that might send `/dev/sda`
// (flash is already hosted-gated upstream).
export const ALLOWED_PORT_PATTERN =
  /^(\/dev\/tty\.[\w\-.]+|\/dev\/cu\.[\w\-.]+|\/dev\/ttyUSB\d+|\/dev\/ttyACM\d+|\/dev\/ttyS\d+|COM\d+)$/

export function isAllowedFlashPort(port: string): boolean {
  return ALLOWED_PORT_PATTERN.test(port)
}

const COMPILE_TIMEOUT_MS = 120_000
/** avrdude uploads are fast but erase+verify on large sketches can stretch. */
const UPLOAD_TIMEOUT_MS = 90_000

const flashRequestSchema = z.object({
  port: z.string().min(1, "port is required"),
  code: z.string().min(1, "sketch code is required"),
  fqbn: z.string().optional(),
  boardTarget: boardTargetSchema.optional(),
  customLibraries: customLibrariesSchema,
})

type ProcOutcome = {
  stdout: string
  stderr: string
  exitCode: number
  aborted: "timeout" | "signal" | null
}

async function streamProc(
  cmd: string[],
  tag: LogTag,
  writer: StreamWriter,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ProcOutcome> {
  const handle = spawnWithTimeout(cmd, { timeoutMs, signal })
  const stdoutSink = { buffer: "" }
  const stderrSink = { buffer: "" }
  await Promise.all([
    pumpProcessStream(handle.proc.stdout, tag, writer, stdoutSink),
    pumpProcessStream(handle.proc.stderr, tag, writer, stderrSink),
  ])
  const exitCode = await handle.exitPromise
  return {
    stdout: stdoutSink.buffer,
    stderr: stderrSink.buffer,
    exitCode,
    aborted: handle.abortReason(),
  }
}

async function streamCompile(
  arduinoCli: string,
  sketchDir: string,
  fqbn: string,
  libsDir: string | null,
  writer: StreamWriter,
  signal: AbortSignal,
): Promise<ProcOutcome> {
  const args = [
    arduinoCli,
    "compile",
    "--fqbn", fqbn,
    "--output-dir", join(sketchDir, "output"),
  ]
  if (libsDir) args.push("--libraries", libsDir)
  args.push(join(sketchDir, "sketch"))
  return streamProc(args, "compiler", writer, signal, COMPILE_TIMEOUT_MS)
}

function abortMessage(phase: "compile" | "flash", reason: "timeout" | "signal", timeoutMs: number): string {
  if (reason === "timeout") return `${phase} timed out after ${timeoutMs / 1000}s`
  return `${phase} cancelled`
}

export const flashRoutes = new Elysia().use(authPlugin).post("/api/flash", async ({ auth, body, request, set }) => {
  const ownerId = requireOwnerId(auth)
  // Hosted replicas have no USB — reject uploads up front with a clear
  // error so the UI can surface it. Without this, the compile step would
  // succeed and avrdude would blow up on a non-existent port.
  if (IS_HOSTED) {
    set.status = 403
    return { error: "Flashing is unavailable in hosted mode. Run the Breadbox CLI locally to upload to a board." }
  }
  const parsed = flashRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  // Allowlist the port path before we touch anything expensive. Reject
  // `/dev/sda`, `/dev/zero`, arbitrary paths, etc.
  if (!ALLOWED_PORT_PATTERN.test(parsed.data.port)) {
    set.status = 400
    return { error: `Invalid port: ${parsed.data.port}` }
  }

  try {
    await requireRateLimit("compile", ownerId, auth?.isHosted)
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
      log.info(`queue full — rejecting flash (active=${stats.active}, queued=${stats.queued})`)
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
  const { port, code, customLibraries } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = join(tmpdir(), `arduino-flash-${sketchId}`)
  const sketchFile = join(sketchDir, "sketch", "sketch.ino")
  const outputDir = join(sketchDir, "output")

  void auditLog({
    userId: ownerId,
    action: "flash.start",
    extra: { sketchId, fqbn, port },
  })

  const { stream, writer } = createNdjsonStream()
  const signal = request.signal

  ;(async () => {
    try {
      let arduinoCli: string
      try {
        arduinoCli = await resolveArduinoCli({ install: process.env.BREADBOX_AUTO_INSTALL === "1" })
        await ensureArduinoCliCore(coreFamilyForFqbn(fqbn), writer)
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
        compileResult = await streamCompile(arduinoCli, sketchDir, fqbn, libsDir, writer, signal)
      }

      if (compileResult.aborted !== null) {
        writer.write({
          kind: "error",
          stage: "compile",
          message: abortMessage("compile", compileResult.aborted, COMPILE_TIMEOUT_MS),
        })
        return
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

      const artifact = await findFirmwareArtifactPath(outputDir, fqbn)
      if (!artifact) {
        writer.write({
          kind: "error",
          stage: "compile",
          message:
            `Compilation succeeded but firmware artifact not found (${expectedFirmwareArtifactNameForFqbn(fqbn)}).`,
        })
        return
      }
      const uploadResult = await streamProc(
        buildFlashUploadArgs({
          arduinoCli,
          port,
          fqbn,
          artifactPath: artifact.path,
        }),
        "upload",
        writer,
        signal,
        UPLOAD_TIMEOUT_MS,
      )

      if (uploadResult.aborted !== null) {
        writer.write({
          kind: "error",
          stage: "flash",
          message: abortMessage("flash", uploadResult.aborted, UPLOAD_TIMEOUT_MS),
        })
        return
      }

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
      release()
      rm(sketchDir, { recursive: true, force: true }).catch(() => {})
    }
  })()

  set.headers["content-type"] = "application/x-ndjson"
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson" },
  })
})
