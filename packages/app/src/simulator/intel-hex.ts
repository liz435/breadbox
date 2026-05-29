// ── Intel HEX parser (zero-dep) ─────────────────────────────────────────
//
// Extracted from avr-compiler.ts so the Bun test suite can import the
// parser without transitively pulling in the API client (which uses Vite
// path aliases and only works in the browser bundle).

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
      baseAddress = parseInt(line.slice(9, 13), 16) << 4
    } else if (recordType === 0x04) {
      baseAddress = parseInt(line.slice(9, 13), 16) << 16
    } else if (recordType === 0x00) {
      const endAddr = baseAddress + address + byteCount
      if (endAddr > maxAddr) {
        maxAddr = endAddr
      }
    }
  }

  const progBytes = new Uint8Array(Math.max(maxAddr, 0x8000))
  baseAddress = 0

  for (const line of lines) {
    const byteCount = parseInt(line.slice(1, 3), 16)
    const address = parseInt(line.slice(3, 7), 16)
    const recordType = parseInt(line.slice(7, 9), 16)

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
