// ── RP2040 bootrom loader tests ─────────────────────────────────────────────
//
// Covers the base64 → Uint32Array decode (little-endian, zero-pad/truncate to
// the fixed 16 KB rp2040js expects) and the graceful "no bootrom vendored"
// fallback that keeps a fresh checkout running on the synthesised boot handoff.

import { describe, expect, test } from "bun:test"
import { decodeBootrom, loadRp2040Bootrom } from "../rp2040-bootrom"

const BOOTROM_WORDS = 0x4000 / 4 // 16 KB as 32-bit words

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}

describe("decodeBootrom", () => {
  test("decodes little-endian words and zero-pads to 16 KB", () => {
    const bytes = new Uint8Array([0x10, 0x32, 0x54, 0x76, 0x01, 0x00, 0x00, 0x00])
    const words = decodeBootrom(toBase64(bytes))
    expect(words.length).toBe(BOOTROM_WORDS)
    expect(words[0]).toBe(0x76543210)
    expect(words[1]).toBe(1)
    expect(words[2]).toBe(0) // zero-padded tail
    expect(words[BOOTROM_WORDS - 1]).toBe(0)
  })

  test("truncates a blob larger than 16 KB to exactly 4096 words", () => {
    const big = new Uint8Array((BOOTROM_WORDS + 16) * 4)
    big[0] = 0xaa
    const words = decodeBootrom(toBase64(big))
    expect(words.length).toBe(BOOTROM_WORDS)
    expect(words[0]).toBe(0xaa)
  })

  test("ignores a trailing partial word", () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x01, 0x02]) // 1 word + 2 stray bytes
    const words = decodeBootrom(toBase64(bytes))
    expect(words[0]).toBe(0xffffffff)
    expect(words[1]).toBe(0)
  })
})

describe("loadRp2040Bootrom", () => {
  test("returns null when no bootrom is vendored (default data file)", async () => {
    // rp2040-bootrom-data.ts ships RP2040_BOOTROM_BASE64 = null until
    // `bun run bootrom:fetch` populates it; the runner then falls back to the
    // synthesised boot handoff.
    expect(await loadRp2040Bootrom()).toBeNull()
  })
})
