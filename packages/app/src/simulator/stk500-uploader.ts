// ── STK500v1 Uploader over WebSerial ──────────────────────────────────────
//
// In-browser implementation of the avrdude/STK500v1 upload protocol used by
// the Arduino Uno bootloader (Optiboot). Hosted Breadbox has no USB on the
// server, so the browser must drive the upload directly. We deliberately
// don't depend on `stk500-v1` or `avrgirl-arduino`: both are node-flavored,
// pull in a serialport polyfill, and fight Vite's tree-shaking. Six
// opcodes are easier to write than to bundle around.
//
// Wire protocol cheat sheet (host → device, device → host responses are
// always INSYNC + payload + OK):
//
//   GET_SYNC        0x30 0x20                       (handshake / ping)
//   ENTER_PROGMODE  0x50 0x20
//   LOAD_ADDRESS    0x55 lo hi 0x20                 (lo/hi are WORD address)
//   PROG_PAGE       0x64 sz_hi sz_lo 0x46 ...data... 0x20
//   READ_PAGE       0x74 sz_hi sz_lo 0x46 0x20
//   LEAVE_PROGMODE  0x51 0x20
//
// Constants: INSYNC=0x14, OK=0x10, EOP=0x20, MEMTYPE_FLASH=0x46.

import { openFlashSession, type FlashSession } from "./web-serial-port-store"

const CMD_GET_SYNC = 0x30
const CMD_ENTER_PROGMODE = 0x50
const CMD_LOAD_ADDRESS = 0x55
const CMD_PROG_PAGE = 0x64
const CMD_LEAVE_PROGMODE = 0x51

const EOP = 0x20
const RESP_INSYNC = 0x14
const RESP_OK = 0x10
const MEMTYPE_FLASH = 0x46

const SYNC_RETRIES = 10
/** Default read timeout for prog / verify steps (each page can be slow). */
const READ_TIMEOUT_MS = 1_000
/**
 * Read timeout for sync attempts specifically. Optiboot's window is ~500ms;
 * a slow timeout means the first failed retry burns through that window
 * before retry 2 starts. 200ms × 10 retries fits inside the window AND
 * recovers cleanly from transient bus noise.
 */
const SYNC_READ_TIMEOUT_MS = 200
/** Settle time before pulsing DTR — let the initial signal state stabilize. */
const PRE_RESET_SETTLE_MS = 50
/** ms to hold DTR asserted (RESET LOW). Long enough for cap to charge fully. */
const RESET_PULSE_MS = 100
/** ms to wait after release before talking to the bootloader. Optiboot is fast. */
const BOOTLOADER_SETTLE_MS = 50

export type FlashPhase = "reset" | "sync" | "writing" | "verifying" | "done"

export type FlashProgress = {
  phase: FlashPhase
  bytesWritten?: number
  bytesTotal?: number
}

export type FlashOptions = {
  /** Raw Intel HEX text returned from `/api/compile`. */
  hexText: string
  /** Upload baud rate. Optiboot on Uno R3 uses 115200. */
  baudRate: number
  /** Flash page size in bytes. atmega328p = 128. */
  pageSize: number
  signal?: AbortSignal
  onLog: (line: string) => void
  onProgress: (p: FlashProgress) => void
}

// ── Intel HEX → flat byte image ──────────────────────────────────────────

/**
 * Decode an Intel HEX file to a contiguous byte image starting at the
 * lowest address. We ignore extended-linear-address records: the Uno's
 * 32KB flash fits in 16-bit address space, and Optiboot starts at 0x0000.
 */
export function intelHexToBytes(hex: string): { data: Uint8Array; startAddress: number } {
  const lines = hex.split(/\r?\n/).filter((l) => l.startsWith(":"))
  const chunks: { addr: number; bytes: Uint8Array }[] = []
  let minAddr = Number.MAX_SAFE_INTEGER
  let maxAddr = 0

  for (const line of lines) {
    if (line.length < 11) continue
    const byteCount = parseInt(line.substring(1, 3), 16)
    const addr = parseInt(line.substring(3, 7), 16)
    const recordType = parseInt(line.substring(7, 9), 16)
    if (recordType === 0x01) break // EOF
    if (recordType !== 0x00) continue // skip extended-address / start-address
    const data = new Uint8Array(byteCount)
    for (let i = 0; i < byteCount; i++) {
      data[i] = parseInt(line.substring(9 + i * 2, 11 + i * 2), 16)
    }
    chunks.push({ addr, bytes: data })
    if (addr < minAddr) minAddr = addr
    if (addr + byteCount > maxAddr) maxAddr = addr + byteCount
  }

  if (chunks.length === 0) {
    return { data: new Uint8Array(0), startAddress: 0 }
  }
  const length = maxAddr - minAddr
  const flat = new Uint8Array(length)
  // 0xFF is the AVR's erased state; using it as the fill value means any
  // gaps in the HEX (unused flash) won't be programmed to 0x00, which
  // matches what avrdude does.
  flat.fill(0xff)
  for (const { addr, bytes } of chunks) {
    flat.set(bytes, addr - minAddr)
  }
  return { data: flat, startAddress: minAddr }
}

// ── Low-level read/write helpers ─────────────────────────────────────────

class FlashError extends Error {}

async function readByte(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  signal: AbortSignal | undefined,
  timeoutMs: number = READ_TIMEOUT_MS,
): Promise<number> {
  if (buffer.offset < buffer.tail.length) {
    const b = buffer.tail[buffer.offset]
    buffer.offset++
    return b
  }
  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      const id = setTimeout(() => reject(new FlashError("read timeout")), timeoutMs)
      signal?.addEventListener("abort", () => {
        clearTimeout(id)
        reject(new FlashError("aborted"))
      })
    }),
  ])
  if (result.done || !result.value || result.value.length === 0) {
    throw new FlashError("port closed mid-read")
  }
  buffer.tail = result.value
  buffer.offset = 1
  return result.value[0]
}

async function readExpect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  expected: number,
  signal: AbortSignal | undefined,
  label: string,
  timeoutMs?: number,
): Promise<void> {
  const b = await readByte(reader, buffer, signal, timeoutMs)
  if (b !== expected) {
    throw new FlashError(`expected ${label} (0x${expected.toString(16)}) but got 0x${b.toString(16)}`)
  }
}

async function write(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  bytes: number[] | Uint8Array,
): Promise<void> {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  await writer.write(u8)
}

/**
 * Drain any banner / stale bytes from the bootloader so the first real
 * GET_SYNC starts on a clean slate.
 */
async function drainStale(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
): Promise<void> {
  // Best-effort: try to read with a very short timeout; whatever comes back
  // gets thrown away. We don't care if there's nothing.
  const drainOnce = async (): Promise<boolean> => {
    try {
      await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("none")), 50),
        ),
      ])
      return true
    } catch {
      return false
    }
  }
  for (let i = 0; i < 3; i++) {
    if (!(await drainOnce())) break
  }
  buffer.tail = new Uint8Array(0)
  buffer.offset = 0
}

// ── Protocol steps ───────────────────────────────────────────────────────

async function sync(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  signal: AbortSignal | undefined,
  onLog: (line: string) => void,
): Promise<void> {
  for (let attempt = 1; attempt <= SYNC_RETRIES; attempt++) {
    try {
      await write(writer, [CMD_GET_SYNC, EOP])
      // Use the short sync timeout — full SYNC_RETRIES × 200ms = 2s,
      // well within the Optiboot ~500ms window for the early retries
      // and recovering noise-induced misses without burning the whole
      // window on the first failure.
      await readExpect(reader, buffer, RESP_INSYNC, signal, "INSYNC", SYNC_READ_TIMEOUT_MS)
      await readExpect(reader, buffer, RESP_OK, signal, "OK", SYNC_READ_TIMEOUT_MS)
      onLog(`[stk500] sync ok (attempt ${attempt})`)
      return
    } catch (err) {
      onLog(`[stk500] sync attempt ${attempt} failed: ${(err as Error).message}`)
      // Drain any stale bytes that might've come from a previous
      // garbled write — clears the read pointer for the next attempt
      // without consuming additional time. No setTimeout pause: the
      // bootloader keeps listening; we want to retry IMMEDIATELY.
      buffer.tail = new Uint8Array(0)
      buffer.offset = 0
      if (attempt === SYNC_RETRIES) throw err
    }
  }
}

async function enterProgmode(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  signal: AbortSignal | undefined,
): Promise<void> {
  await write(writer, [CMD_ENTER_PROGMODE, EOP])
  await readExpect(reader, buffer, RESP_INSYNC, signal, "INSYNC")
  await readExpect(reader, buffer, RESP_OK, signal, "OK")
}

async function leaveProgmode(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  signal: AbortSignal | undefined,
): Promise<void> {
  await write(writer, [CMD_LEAVE_PROGMODE, EOP])
  await readExpect(reader, buffer, RESP_INSYNC, signal, "INSYNC")
  await readExpect(reader, buffer, RESP_OK, signal, "OK")
}

async function loadAddress(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  signal: AbortSignal | undefined,
  wordAddress: number,
): Promise<void> {
  await write(writer, [CMD_LOAD_ADDRESS, wordAddress & 0xff, (wordAddress >> 8) & 0xff, EOP])
  await readExpect(reader, buffer, RESP_INSYNC, signal, "INSYNC")
  await readExpect(reader, buffer, RESP_OK, signal, "OK")
}

async function progPage(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  buffer: { tail: Uint8Array; offset: number },
  signal: AbortSignal | undefined,
  page: Uint8Array,
): Promise<void> {
  const header = new Uint8Array([
    CMD_PROG_PAGE,
    (page.length >> 8) & 0xff,
    page.length & 0xff,
    MEMTYPE_FLASH,
  ])
  const trailer = new Uint8Array([EOP])
  const frame = new Uint8Array(header.length + page.length + trailer.length)
  frame.set(header, 0)
  frame.set(page, header.length)
  frame.set(trailer, header.length + page.length)
  await write(writer, frame)
  await readExpect(reader, buffer, RESP_INSYNC, signal, "INSYNC")
  await readExpect(reader, buffer, RESP_OK, signal, "OK")
}

// ── Top-level flash ──────────────────────────────────────────────────────

export async function flashViaStk500v1(opts: FlashOptions): Promise<void> {
  const { hexText, baudRate, pageSize, signal, onLog, onProgress } = opts
  const { data, startAddress } = intelHexToBytes(hexText)
  if (data.length === 0) throw new FlashError("Empty firmware image")

  onLog(`[stk500] firmware ${data.length} bytes, page ${pageSize} bytes, baud ${baudRate}`)
  onProgress({ phase: "reset", bytesTotal: data.length })

  let session: FlashSession | null = null
  try {
    session = await openFlashSession(baudRate)

    // Auto-reset sequence. Web Serial signal convention:
    //   dataTerminalReady: true  → DTR asserted → LOW on USB-serial chip
    //                              → cap-coupled RESET pulse on the AVR
    //   dataTerminalReady: false → DTR deasserted → HIGH
    //
    // The reset must be a PULSE — assert briefly, then release. Some
    // USB-serial bridges (notably CH340 clones, common on cheap Uno
    // clones) hold the AVR in continuous reset while DTR stays asserted,
    // preventing the bootloader from running. The previous version of
    // this code left DTR asserted forever, which manifested as "all 5
    // sync attempts time out" on those boards. RTS is held quiet
    // throughout to avoid bootloaders that incidentally wire RTS to
    // something they shouldn't (rare but seen on early clones).
    onLog(`[stk500] resetting board via DTR pulse`)
    await session.setSignals({ dataTerminalReady: false, requestToSend: false })
    await new Promise((r) => setTimeout(r, PRE_RESET_SETTLE_MS))
    await session.setSignals({ dataTerminalReady: true, requestToSend: false })
    await new Promise((r) => setTimeout(r, RESET_PULSE_MS))
    await session.setSignals({ dataTerminalReady: false, requestToSend: false })
    await new Promise((r) => setTimeout(r, BOOTLOADER_SETTLE_MS))

    const buffer = { tail: new Uint8Array(0), offset: 0 }
    // Skip drainStale here — Optiboot doesn't emit a banner pre-sync, and
    // the drain wait (~150ms) was eating ~30% of the bootloader window.
    // If a board does send junk, the sync retry loop catches it: the
    // wrong-byte response throws "expected INSYNC but got 0xXX" and
    // attempt 2 starts immediately.
    onProgress({ phase: "sync", bytesTotal: data.length })
    await sync(session.reader, session.writer, buffer, signal, onLog)
    await enterProgmode(session.reader, session.writer, buffer, signal)
    onLog(`[stk500] entered programming mode`)

    onProgress({ phase: "writing", bytesWritten: 0, bytesTotal: data.length })
    for (let offset = 0; offset < data.length; offset += pageSize) {
      const page = data.subarray(offset, Math.min(offset + pageSize, data.length))
      // Address is the byte address divided by 2 because STK500 addresses
      // flash in words. The bootloader pads odd-sized final pages with 0xFF.
      const wordAddress = (startAddress + offset) >> 1
      await loadAddress(session.reader, session.writer, buffer, signal, wordAddress)
      await progPage(session.reader, session.writer, buffer, signal, page)
      onProgress({
        phase: "writing",
        bytesWritten: Math.min(offset + page.length, data.length),
        bytesTotal: data.length,
      })
    }
    onLog(`[stk500] wrote ${data.length} bytes`)

    await leaveProgmode(session.reader, session.writer, buffer, signal)
    onLog(`[stk500] left programming mode`)
    onProgress({ phase: "done", bytesWritten: data.length, bytesTotal: data.length })
  } finally {
    if (session) {
      await session.close().catch(() => {})
    }
  }
}
