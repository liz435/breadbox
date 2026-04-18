// ── AVR Compiler ──────────────────────────────────────────────────────────
//
// Compiles Arduino sketches to AVR machine code via a backend endpoint
// that wraps arduino-cli. Includes Intel HEX parsing and a fallback path
// to the JS transpiler when the server is unavailable.

import { API_ORIGIN, PREFER_AVR } from "@dreamer/config"
import type { CustomLibrary } from "@dreamer/schemas"

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
  | { success: true; hex: Uint16Array; sizeInfo?: SketchSizeInfo }
  | { success: false; error: string }

export type CompileOptions = {
  fqbn?: string
  /**
   * User-authored custom libraries keyed by library name. The backend writes
   * each to `<sketchDir>/libs/<Name>/<Name>.h` and passes `--libraries` to
   * arduino-cli so `#include "<Name>.h"` resolves.
   */
  customLibraries?: Record<string, CustomLibrary>
}

/**
 * Parse an Intel HEX file string into a Uint16Array suitable for loading
 * into the avr8js CPU's progMem.
 *
 * Intel HEX format (each line):
 *   :LLAAAATT[DD...]CC
 *   LL   = byte count
 *   AAAA = 16-bit address
 *   TT   = record type (00=data, 01=EOF, 02=ext segment, 04=ext linear)
 *   DD   = data bytes
 *   CC   = checksum (two's complement of sum of all bytes)
 */
export function parseIntelHex(hex: string): Uint16Array {
  const lines = hex.split("\n").filter((l) => l.startsWith(":"))
  if (lines.length === 0) {
    throw new Error("Invalid Intel HEX: no records found")
  }

  // First pass: determine the maximum address to size the output buffer
  let maxAddr = 0
  let baseAddress = 0

  for (const line of lines) {
    const byteCount = parseInt(line.slice(1, 3), 16)
    const address = parseInt(line.slice(3, 7), 16)
    const recordType = parseInt(line.slice(7, 9), 16)

    if (recordType === 0x02) {
      // Extended segment address
      baseAddress = parseInt(line.slice(9, 13), 16) << 4
    } else if (recordType === 0x04) {
      // Extended linear address
      baseAddress = parseInt(line.slice(9, 13), 16) << 16
    } else if (recordType === 0x00) {
      const endAddr = baseAddress + address + byteCount
      if (endAddr > maxAddr) {
        maxAddr = endAddr
      }
    }
  }

  // ATmega328P has 32KB flash = 16K 16-bit words
  const progBytes = new Uint8Array(Math.max(maxAddr, 0x8000))
  baseAddress = 0

  // Second pass: fill the byte buffer
  for (const line of lines) {
    const byteCount = parseInt(line.slice(1, 3), 16)
    const address = parseInt(line.slice(3, 7), 16)
    const recordType = parseInt(line.slice(7, 9), 16)

    // Verify checksum
    let sum = 0
    for (let i = 0; i < byteCount + 4 + 1; i++) {
      sum += parseInt(line.slice(1 + i * 2, 3 + i * 2), 16)
    }
    if ((sum & 0xff) !== 0) {
      throw new Error(`Invalid Intel HEX checksum at line: ${line.slice(0, 20)}...`)
    }

    if (recordType === 0x02) {
      baseAddress = parseInt(line.slice(9, 13), 16) << 4
    } else if (recordType === 0x04) {
      baseAddress = parseInt(line.slice(9, 13), 16) << 16
    } else if (recordType === 0x00) {
      for (let i = 0; i < byteCount; i++) {
        const byteVal = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16)
        progBytes[baseAddress + address + i] = byteVal
      }
    } else if (recordType === 0x01) {
      // EOF
      break
    }
  }

  // Convert byte array to 16-bit word array (little-endian, as AVR uses)
  const wordCount = Math.ceil(progBytes.length / 2)
  const progMem = new Uint16Array(wordCount)
  for (let i = 0; i < wordCount; i++) {
    progMem[i] = progBytes[i * 2] | (progBytes[i * 2 + 1] << 8)
  }

  return progMem
}

/**
 * Compile an Arduino sketch by sending it to the backend compile endpoint.
 * Returns the parsed program memory on success, or an error message on failure.
 */
export async function compileSketch(code: string, options: CompileOptions = {}): Promise<CompileResult> {
  try {
    const fqbn = options.fqbn ?? "arduino:avr:uno"
    const response = await fetch(COMPILE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        fqbn,
        customLibraries: options.customLibraries ?? {},
      }),
    })

    if (!response.ok) {
      const body = (await response.json()) as { error?: string }
      return {
        success: false,
        error: body.error ?? `Compilation server returned ${response.status}`,
      }
    }

    const body = (await response.json()) as { hex?: string; error?: string; sizeInfo?: SketchSizeInfo }
    if (body.error) {
      return { success: false, error: body.error }
    }
    if (!body.hex) {
      return { success: false, error: "Server returned no hex data" }
    }

    const progMem = parseIntelHex(body.hex)
    return { success: true, hex: progMem, sizeInfo: body.sizeInfo ?? undefined }
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
