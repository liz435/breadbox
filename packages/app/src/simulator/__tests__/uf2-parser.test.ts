// ── UF2 parser tests ────────────────────────────────────────────────────────
//
// Builds synthetic UF2 files (the format arduino-cli emits for the Pico) and
// verifies parsing, gap-padding, the RP2040 flash-offset math, and the byte
// layout the runner's boot handoff depends on (vector table at flash+0x100).
// Exercising this without arduino-cli keeps the firmware path covered in CI.

import { describe, expect, test } from "bun:test"
import { parseUf2, uf2BlocksToFlashImage, parseRp2040Uf2 } from "../uf2-parser"

const BLOCK = 512
const MAGIC0 = 0x0a324655
const MAGIC1 = 0x9e5d5157
const MAGIC_END = 0x0ab16f30
const FLASH_ORIGIN = 0x10000000

function makeBlock(opts: {
  targetAddr: number
  payload: Uint8Array
  blockNo?: number
  numBlocks?: number
  magic0?: number
  magic1?: number
  magicEnd?: number
}): Uint8Array {
  const b = new Uint8Array(BLOCK)
  const v = new DataView(b.buffer)
  v.setUint32(0, opts.magic0 ?? MAGIC0, true)
  v.setUint32(4, opts.magic1 ?? MAGIC1, true)
  v.setUint32(8, 0, true) // flags
  v.setUint32(12, opts.targetAddr, true)
  v.setUint32(16, opts.payload.byteLength, true)
  v.setUint32(20, opts.blockNo ?? 0, true)
  v.setUint32(24, opts.numBlocks ?? 1, true)
  v.setUint32(28, 0, true) // fileSize/familyID
  b.set(opts.payload.subarray(0, 476), 32)
  v.setUint32(BLOCK - 4, opts.magicEnd ?? MAGIC_END, true)
  return b
}

function concat(...blocks: Uint8Array[]): Uint8Array {
  const total = blocks.reduce((n, x) => n + x.byteLength, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const x of blocks) {
    out.set(x, o)
    o += x.byteLength
  }
  return out
}

describe("parseUf2", () => {
  test("decodes a single block's targetAddr + payload", () => {
    const payload = new Uint8Array([1, 2, 3, 4])
    const image = parseUf2(makeBlock({ targetAddr: FLASH_ORIGIN, payload }))
    expect(image.blocks).toHaveLength(1)
    expect(image.baseAddr).toBe(FLASH_ORIGIN)
    expect(image.totalBytes).toBe(4)
    expect(Array.from(image.blocks[0].payload)).toEqual([1, 2, 3, 4])
  })

  test("baseAddr is the lowest targetAddr across out-of-order blocks", () => {
    const hi = makeBlock({ targetAddr: FLASH_ORIGIN + 0x100, payload: new Uint8Array([9]), blockNo: 0 })
    const lo = makeBlock({ targetAddr: FLASH_ORIGIN, payload: new Uint8Array([8]), blockNo: 1 })
    const image = parseUf2(concat(hi, lo))
    expect(image.baseAddr).toBe(FLASH_ORIGIN)
  })

  test("throws on bad magic", () => {
    expect(() =>
      parseUf2(makeBlock({ targetAddr: FLASH_ORIGIN, payload: new Uint8Array([1]), magic0: 0xdeadbeef })),
    ).toThrow(/bad magic/)
  })

  test("throws when size is not a multiple of 512", () => {
    expect(() => parseUf2(new Uint8Array(500))).toThrow(/not a multiple/)
  })

  test("throws on empty input", () => {
    expect(() => parseUf2(new Uint8Array(0))).toThrow(/empty/)
  })
})

describe("uf2BlocksToFlashImage", () => {
  test("pads gaps between blocks with 0xFF and places payloads by address", () => {
    const a = makeBlock({ targetAddr: FLASH_ORIGIN, payload: new Uint8Array([0xaa, 0xbb]) })
    const b = makeBlock({ targetAddr: FLASH_ORIGIN + 0x10, payload: new Uint8Array([0xcc]) })
    const flash = uf2BlocksToFlashImage(parseUf2(concat(a, b)))
    expect(flash.byteLength).toBe(0x11) // 0x10 + 1 byte
    expect(flash[0]).toBe(0xaa)
    expect(flash[1]).toBe(0xbb)
    expect(flash[2]).toBe(0xff) // gap
    expect(flash[0x0f]).toBe(0xff) // gap
    expect(flash[0x10]).toBe(0xcc)
  })
})

describe("parseRp2040Uf2", () => {
  test("returns flash image + offset relative to the XIP origin", () => {
    const payload = new Uint8Array([1, 2, 3, 4])
    const { flash, flashOffset } = parseRp2040Uf2(
      makeBlock({ targetAddr: FLASH_ORIGIN + 0x1000, payload }),
    )
    expect(flashOffset).toBe(0x1000)
    expect(Array.from(flash)).toEqual([1, 2, 3, 4])
  })

  test("throws when the image lands below the RP2040 flash origin", () => {
    // 0x08000000 is below the 0x10000000 XIP origin (e.g. an STM32-targeted
    // UF2) — must be rejected rather than written at a negative offset.
    expect(() =>
      parseRp2040Uf2(makeBlock({ targetAddr: 0x08000000, payload: new Uint8Array([1]) })),
    ).toThrow(/below RP2040 flash origin/)
  })

  test("preserves the Arduino-Pico vector table at flash+0x100 (boot handoff)", () => {
    // The runner's synthesised boot reads SP from flash+0x100 and the reset
    // vector from flash+0x104. Build an image with a known vector table there
    // and confirm the flattened flash exposes those words intact.
    const SP = 0x20041000
    const RESET = 0x10000349 // odd (Thumb) on purpose; runner clears bit0
    const payload = new Uint8Array(0x108)
    const pv = new DataView(payload.buffer)
    pv.setUint32(0x100, SP, true)
    pv.setUint32(0x104, RESET, true)

    const { flash, flashOffset } = parseRp2040Uf2(makeBlock({ targetAddr: FLASH_ORIGIN, payload }))
    expect(flashOffset).toBe(0)
    const fv = new DataView(flash.buffer, flash.byteOffset, flash.byteLength)
    expect(fv.getUint32(0x100, true)).toBe(SP)
    expect(fv.getUint32(0x104, true)).toBe(RESET)
  })
})
