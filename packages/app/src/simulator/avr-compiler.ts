// ── Sketch Compiler ───────────────────────────────────────────────────────
//
// Compiles Arduino sketches via a backend endpoint that wraps arduino-cli.
// AVR fqbns return Intel HEX (parsed into a Uint16Array for avr8js). RP2040
// fqbns return base64-encoded UF2 (parsed into raw flash bytes for rp2040js).

import { API_ORIGIN, PREFER_AVR } from "@dreamer/config"
import type { CustomLibrary, LineTableEntry } from "@dreamer/schemas"
import { parseRp2040Uf2 } from "./uf2-parser"
import { resolveFetchOptions } from "@/project/api-client"
import { isAnonymousPreview } from "@/auth/use-current-user"
import { toast } from "@/components/ui/toast"

const COMPILE_ENDPOINT = `${API_ORIGIN}/api/compile`

export type SketchSizeInfo = {
  flashUsed: number
  flashMax: number
  flashPercent: number
  ramUsed: number
  ramMax: number
  ramPercent: number
}

export type CompileResult =
  | {
      success: true
      format: "hex"
      hex: Uint16Array
      /**
       * Raw Intel HEX text as returned by arduino-cli. The simulator reads
       * `hex` (word-packed); the hosted WebSerial flasher reads `hexText`
       * to avoid round-tripping word data back to bytes.
       */
      hexText: string
      sizeInfo?: SketchSizeInfo
      /**
       * Source-line → word-address map for the debugger (AVR only). Absent
       * when the backend couldn't produce it (no avr-objdump / older core);
       * the debugger then falls back to address-only breakpoints.
       */
      lineTable?: LineTableEntry[]
    }
  | {
      success: true
      format: "uf2"
      /** Flattened flash image, 0xFF-padded across gaps. */
      flash: Uint8Array
      /** Offset into the chip's flash region where `flash` should be written. */
      flashOffset: number
      sizeInfo?: SketchSizeInfo
    }
  | { success: false; error: string }

export type BuildLogTag = "compiler" | "upload"

export type CompileOptions = {
  fqbn?: string
  /**
   * User-authored custom libraries keyed by library name. The backend writes
   * each to `<sketchDir>/libs/<Name>/<Name>.h` and passes `--libraries` to
   * arduino-cli so `#include "<Name>.h"` resolves.
   */
  customLibraries?: Record<string, CustomLibrary>
  /**
   * Called once per line streamed back from arduino-cli (stdout + stderr
   * interleaved) so the Code Output panel can render the compile log live.
   * Fires before the returned promise resolves.
   */
  onLog?: (tag: BuildLogTag, line: string, ts: number) => void
}

/**
 * Read a `fetch()` body as an NDJSON stream and yield each parsed event.
 * Tolerates partial trailing lines and malformed JSON (logs + continues)
 * so one bad chunk can't kill the whole compile.
 */
export async function* readNdjsonStream<T = unknown>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      carry += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = carry.indexOf("\n")) !== -1) {
        const line = carry.slice(0, idx).trim()
        carry = carry.slice(idx + 1)
        if (line.length === 0) continue
        try {
          yield JSON.parse(line) as T
        } catch {
          // ignore malformed line
        }
      }
    }
    const tail = carry.trim()
    if (tail.length > 0) {
      try {
        yield JSON.parse(tail) as T
      } catch {
        // ignore malformed trailing line
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Re-exported from `./intel-hex` (extracted to a zero-dep module so the
 * bun test suite can use it without pulling in the API client). Kept here
 * for backwards-compat with the many callers of `simulator/avr-compiler`.
 */
import { parseIntelHex } from "./intel-hex"
export { parseIntelHex } from "./intel-hex"


/** Event shapes on the wire from `/api/compile` (see routes/_stream-lines.ts). */
type CompileStreamEvent =
  | { kind: "log"; tag: BuildLogTag; line: string; ts: number }
  // Idle-connection keep-alive. The backend emits one every ~10s while an
  // arduino-cli core install is downloading, otherwise upstream proxies
  // (Railway's especially) would close the stream after a minute of silence.
  | { kind: "heartbeat"; ts: number }
  | {
      kind: "done"
      format?: "hex" | "uf2"
      data?: string
      sizeInfo?: SketchSizeInfo
      lineTable?: LineTableEntry[]
      autoInstalled?: string[]
    }
  | { kind: "error"; message: string; autoInstalled?: string[] }

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeFirmware(
  format: "hex" | "uf2",
  data: string,
  sizeInfo: SketchSizeInfo | undefined,
  lineTable?: LineTableEntry[],
): CompileResult {
  if (format === "hex") {
    return { success: true, format: "hex", hex: parseIntelHex(data), hexText: data, sizeInfo, lineTable }
  }
  const { flash, flashOffset } = parseRp2040Uf2(base64ToBytes(data))
  return { success: true, format: "uf2", flash, flashOffset, sizeInfo }
}

/**
 * Compile an Arduino sketch by sending it to the backend compile endpoint.
 * The endpoint streams NDJSON — each `log` event is forwarded to
 * `options.onLog` so callers can render a live compile log. Resolves with
 * the parsed program memory once the terminal `done` event arrives, or
 * with an error message on `error`.
 */
export async function compileSketch(code: string, options: CompileOptions = {}): Promise<CompileResult> {
  // Anonymous preview: compile runs arduino-cli on the server, which is
  // auth-gated. Short-circuit with a sign-in prompt rather than posting
  // and unwrapping a 401 the user can't meaningfully resolve inline.
  if (isAnonymousPreview()) {
    toast.info("Sign in with GitHub to compile sketches.")
    return { success: false, error: "Sign in with GitHub to compile sketches." }
  }

  try {
    const fqbn = options.fqbn ?? "arduino:avr:uno"
    const response = await fetch(
      COMPILE_ENDPOINT,
      resolveFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          fqbn,
          customLibraries: options.customLibraries ?? {},
        }),
      }),
    )

    // Non-streaming error responses (e.g. 400 from schema validation) still
    // come back as plain JSON; fall through to the legacy path for them.
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("ndjson")) {
      if (!response.ok) {
        // Error bodies aren't always JSON — e.g. Elysia's auth plugin
        // serializes thrown errors as plain text. Fall back to statusText
        // before .json() can throw "did not match the expected pattern".
        let message = `Compilation server returned ${response.status}`
        try {
          const text = await response.clone().text()
          if (text) {
            try {
              const parsed = JSON.parse(text) as { error?: string }
              if (parsed.error) message = parsed.error
              else message = text.slice(0, 200)
            } catch {
              message = text.slice(0, 200)
            }
          }
        } catch {
          /* fall through with the default message */
        }
        return { success: false, error: message }
      }
      const body = (await response.json()) as {
        format?: "hex" | "uf2"
        data?: string
        error?: string
        sizeInfo?: SketchSizeInfo
        lineTable?: LineTableEntry[]
      }
      if (body.error) return { success: false, error: body.error }
      if (!body.format || !body.data) {
        return { success: false, error: "Server returned no firmware data" }
      }
      return decodeFirmware(body.format, body.data, body.sizeInfo, body.lineTable)
    }

    if (!response.body) {
      return { success: false, error: "Compilation server returned empty body" }
    }

    let format: "hex" | "uf2" | undefined
    let data: string | undefined
    let sizeInfo: SketchSizeInfo | undefined
    let lineTable: LineTableEntry[] | undefined
    let errorMessage: string | undefined

    for await (const event of readNdjsonStream<CompileStreamEvent>(response.body)) {
      if (event.kind === "log") {
        options.onLog?.(event.tag, event.line, event.ts)
      } else if (event.kind === "done") {
        format = event.format
        data = event.data
        sizeInfo = event.sizeInfo
        lineTable = event.lineTable
      } else if (event.kind === "error") {
        errorMessage = event.message
      }
    }

    if (errorMessage) return { success: false, error: errorMessage }
    if (!format || !data) {
      return { success: false, error: "Server returned no firmware data" }
    }
    return decodeFirmware(format, data, sizeInfo, lineTable)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach compilation server"
    // In the standalone web app (preferAvr=false), the sketch can still run
    // via the JS transpiler if the user switches modes manually — hence the
    // historical suffix. In CLI-served mode (preferAvr=true) the simulator
    // is locked to AVR, so that suffix is a lie; surface the real arduino-cli
    // / fetch error verbatim instead.
    return {
      success: false,
      error: PREFER_AVR
        ? `Compilation failed: ${message}`
        : `Compilation server unavailable: ${message}. Falling back to transpile mode.`,
    }
  }
}
