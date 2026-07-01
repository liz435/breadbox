// ── UF2 parser ────────────────────────────────────────────────────────────
//
// Microsoft's "USB Flashing Format" — a sequence of 512-byte blocks where
// each block holds up to 476 bytes of payload plus a 32-byte header that
// records where the payload should land in the target's flash. arduino-cli
// emits `.uf2` files by default for `rp2040:rp2040:rpipico` (and other
// RP2040 boards).
//
// Spec: https://github.com/microsoft/uf2
//
// Block layout (little-endian):
//
//   offset  size  field
//   ------  ----  ------------------------
//   0       4     magicStart0   (0x0A324655, 'UF2\n')
//   4       4     magicStart1   (0x9E5D5157)
//   8       4     flags
//   12      4     targetAddr    — where in flash this chunk belongs
//   16      4     payloadSize   — 1..476
//   20      4     blockNo
//   24      4     numBlocks
//   28      4     fileSize | familyID
//   32    476     data
//   508     4     magicEnd      (0x0AB16F30)
//
// We only care about `targetAddr` + `payloadSize` + `data`. Everything else
// is validated for sanity but otherwise ignored.

const UF2_BLOCK_SIZE = 512
const UF2_MAGIC_START_0 = 0x0a324655
const UF2_MAGIC_START_1 = 0x9e5d5157
const UF2_MAGIC_END = 0x0ab16f30
const UF2_HEADER_SIZE = 32
const UF2_MAX_PAYLOAD = 476

// RP2040 flash is mapped at 0x10000000 (XIP region).
const RP2040_FLASH_ORIGIN = 0x10000000

type Uf2Block = {
  targetAddr: number
  payload: Uint8Array
}

export type Uf2Image = {
  blocks: Uf2Block[]
  /** Lowest targetAddr observed — the flash base for the decoded firmware. */
  baseAddr: number
  /** Total payload bytes across all blocks. */
  totalBytes: number
}

/** Parse a UF2 file (as raw bytes) into ordered blocks. Throws on malformed input. */
export function parseUf2(bytes: Uint8Array): Uf2Image {
  if (bytes.byteLength === 0) {
    throw new Error("UF2 parse error: empty input")
  }
  if (bytes.byteLength % UF2_BLOCK_SIZE !== 0) {
    throw new Error(
      `UF2 parse error: file size ${bytes.byteLength} is not a multiple of ${UF2_BLOCK_SIZE}`,
    )
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const blocks: Uf2Block[] = []
  let baseAddr = Number.MAX_SAFE_INTEGER
  let totalBytes = 0

  for (let offset = 0; offset < bytes.byteLength; offset += UF2_BLOCK_SIZE) {
    const magicStart0 = view.getUint32(offset + 0, true)
    const magicStart1 = view.getUint32(offset + 4, true)
    const magicEnd = view.getUint32(offset + UF2_BLOCK_SIZE - 4, true)

    if (
      magicStart0 !== UF2_MAGIC_START_0 ||
      magicStart1 !== UF2_MAGIC_START_1 ||
      magicEnd !== UF2_MAGIC_END
    ) {
      throw new Error(
        `UF2 parse error: bad magic at block offset 0x${offset.toString(16)}`,
      )
    }

    const targetAddr = view.getUint32(offset + 12, true)
    const payloadSize = view.getUint32(offset + 16, true)

    if (payloadSize === 0 || payloadSize > UF2_MAX_PAYLOAD) {
      throw new Error(
        `UF2 parse error: invalid payloadSize ${payloadSize} at block offset 0x${offset.toString(16)}`,
      )
    }

    const payload = bytes.slice(
      offset + UF2_HEADER_SIZE,
      offset + UF2_HEADER_SIZE + payloadSize,
    )
    blocks.push({ targetAddr, payload })
    if (targetAddr < baseAddr) baseAddr = targetAddr
    totalBytes += payloadSize
  }

  if (blocks.length === 0) {
    throw new Error("UF2 parse error: no blocks decoded")
  }

  return { blocks, baseAddr, totalBytes }
}

/**
 * Flatten UF2 blocks into a single flash image ready to copy into
 * `mcu.flash`. Pads any gaps between blocks with 0xFF (erased-flash value).
 * Addresses are normalised relative to the image's `baseAddr` (so the
 * returned buffer starts at offset 0 in the RP2040's XIP region).
 */
export function uf2BlocksToFlashImage(image: Uf2Image): Uint8Array {
  const { blocks, baseAddr } = image

  let highWater = baseAddr
  for (const { targetAddr, payload } of blocks) {
    const end = targetAddr + payload.byteLength
    if (end > highWater) highWater = end
  }
  const size = highWater - baseAddr
  if (size <= 0) return new Uint8Array(0)

  const flash = new Uint8Array(size)
  flash.fill(0xff)
  for (const { targetAddr, payload } of blocks) {
    flash.set(payload, targetAddr - baseAddr)
  }
  return flash
}

/**
 * RP2040-specific convenience wrapper. Parses the UF2 bytes, validates that
 * the image lands in the RP2040 flash region (0x10000000+), and returns a
 * flattened buffer that can be written directly to `RP2040.flash` starting
 * at offset `(image.baseAddr - 0x10000000)`.
 */
export function parseRp2040Uf2(bytes: Uint8Array): {
  flash: Uint8Array
  flashOffset: number
} {
  const image = parseUf2(bytes)
  if (image.baseAddr < RP2040_FLASH_ORIGIN) {
    throw new Error(
      `UF2 targetAddr 0x${image.baseAddr.toString(16)} is below RP2040 flash origin 0x${RP2040_FLASH_ORIGIN.toString(16)}`,
    )
  }
  return {
    flash: uf2BlocksToFlashImage(image),
    flashOffset: image.baseAddr - RP2040_FLASH_ORIGIN,
  }
}
