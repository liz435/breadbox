// ── DWARF decoded-line parser tests ─────────────────────────────────────────
//
// Verifies `parseDecodedLineOutput` against representative `avr-objdump
// --dwarf=decodedline` output: byte→word address conversion, the arduino-cli
// `#line` offset correction, library-file rows skipped, end-of-sequence ("-")
// rows ignored, dedup-by-address, and ascending address ordering.

import { describe, expect, test } from "bun:test"
import { parseDecodedLineOutput } from "../line-table"
import { breakpointAddressForLine, lineForAddress } from "@dreamer/schemas"

// Trimmed but format-accurate sample. Note: line numbers here are the RAW
// values DWARF reports (arduino-cli's +1 shift); the parser subtracts the
// offset we pass in to map back to editor lines.
const SAMPLE = `
Contents of the .debug_line section:

CU: sketch.ino:
File name                            Line number    Starting address    View    Stmt
sketch.ino                                     7              0x80               x
sketch.ino                                     8              0x84               x
sketch.ino                                    11              0x9a               x
sketch.ino                                     -              0xb2
sketch.ino                                    12              0xb4               x

CU: /home/user/Arduino/libraries/Servo/Servo.cpp:
File name                            Line number    Starting address    View    Stmt
Servo.cpp                                     42              0x120              x
`

describe("parseDecodedLineOutput", () => {
  test("maps sketch lines to word addresses with the line offset applied", () => {
    const table = parseDecodedLineOutput(SAMPLE, { lineOffset: 1 })
    expect(table).toEqual([
      { line: 6, address: 0x40 }, // raw line 7 → 6; byte 0x80 → word 0x40
      { line: 7, address: 0x42 }, // raw line 8 → 7; byte 0x84 → word 0x42
      { line: 10, address: 0x4d }, // raw line 11 → 10; byte 0x9a → word 0x4d
      { line: 11, address: 0x5a }, // raw line 12 → 11; byte 0xb4 → word 0x5a
    ])
  })

  test("skips library-file rows (only the user's sketch.ino)", () => {
    const table = parseDecodedLineOutput(SAMPLE, { lineOffset: 1 })
    expect(table.some((e) => e.address === 0x120 >> 1)).toBe(false)
  })

  test("ignores end-of-sequence rows where the line is '-'", () => {
    const table = parseDecodedLineOutput(SAMPLE, { lineOffset: 1 })
    // 0xb2 >> 1 = 0x59 must not appear (it was an end-of-sequence marker).
    expect(table.some((e) => e.address === 0x59)).toBe(false)
  })

  test("dedupes by address and returns ascending order", () => {
    const dup = `
sketch.ino   5   0x10   x
sketch.ino   5   0x10   x
sketch.ino   4   0x08   x
`
    const table = parseDecodedLineOutput(dup, { lineOffset: 0 })
    expect(table).toEqual([
      { line: 4, address: 0x04 },
      { line: 5, address: 0x08 },
    ])
  })

  test("clamps corrected line numbers to >= 1", () => {
    const table = parseDecodedLineOutput("sketch.ino   1   0x00   x", { lineOffset: 1 })
    expect(table[0]).toEqual({ line: 1, address: 0 })
  })

  test("returns empty when no addressed sketch rows are present", () => {
    expect(parseDecodedLineOutput("Contents of the .debug_line section:\n", {})).toEqual([])
  })

  test("keeps raw BYTE addresses for ARM/RP2040 (wordAddresses: false)", () => {
    // Cortex-M0 core.PC is a byte address, so the RP2040 path must NOT halve
    // the DWARF address the way the AVR (word-indexed) path does.
    const table = parseDecodedLineOutput(SAMPLE, { lineOffset: 1, wordAddresses: false })
    expect(table).toEqual([
      { line: 6, address: 0x80 },
      { line: 7, address: 0x84 },
      { line: 10, address: 0x9a },
      { line: 11, address: 0xb4 },
    ])
  })
})

describe("line-table lookups (shared helpers)", () => {
  const table = parseDecodedLineOutput(SAMPLE, { lineOffset: 1 })

  test("breakpointAddressForLine picks the lowest address for a line", () => {
    expect(breakpointAddressForLine(table, 6)).toBe(0x40)
    expect(breakpointAddressForLine(table, 99)).toBeNull()
  })

  test("lineForAddress finds the line whose range contains a pc", () => {
    expect(lineForAddress(table, 0x40)).toBe(6)
    expect(lineForAddress(table, 0x41)).toBe(6) // mid-instruction stays on line 6
    expect(lineForAddress(table, 0x42)).toBe(7)
    expect(lineForAddress(table, 0x5b)).toBe(11) // past last entry → last line
    expect(lineForAddress(table, 0x00)).toBeNull() // before first mapped pc
  })
})
