// ── NDJSON line-streaming helpers for compile / flash routes ──────────────
//
// Both `/api/compile` and `/api/flash` used to buffer the full stdout+stderr
// of `arduino-cli` / `avrdude`, then return a single JSON blob. The Code
// Output panel in the app now wants to surface those logs live (Arduino-IDE
// style), so these endpoints now emit newline-delimited JSON — one event
// per line — over a chunked `application/x-ndjson` response.
//
// Event shapes on the wire:
//   {"kind":"log","tag":"compiler"|"upload","line":"…","ts":1730000000000}
//   {"kind":"heartbeat","ts":1730000000000}
//   {"kind":"done", ...payload}
//   {"kind":"error", "message":"…", ...}
//
// `heartbeat` exists to keep upstream proxies (Railway, Cloudflare, anything
// that enforces idle-connection timeouts) from dropping the connection
// during long silent operations like `arduino-cli core install`. The
// frontend ignores heartbeat events.
//
// Keep this module framework-agnostic — it only deals with streams and
// child-process output. Elysia routes wrap the returned ReadableStream in a
// Response.

export type LogTag = "compiler" | "upload"

export type StreamEvent =
  | { kind: "log"; tag: LogTag; line: string; ts: number }
  | { kind: "heartbeat"; ts: number }
  | { kind: "done"; [key: string]: unknown }
  | { kind: "error"; message: string; [key: string]: unknown }

export type StreamWriter = {
  /** Write one JSON event to the response stream, followed by a newline. */
  write: (event: StreamEvent) => void
  /** Close the stream — after this, no further events can be written. */
  close: () => void
}

/** How long the stream can stay silent before we inject a heartbeat. */
const HEARTBEAT_INTERVAL_MS = 10_000

/**
 * Create a `ReadableStream<Uint8Array>` paired with a `StreamWriter` that
 * route handlers call to push events. The Response that wraps the stream
 * should set `content-type: application/x-ndjson`. A `heartbeat` event is
 * automatically injected every 10s of silence so idle proxies don't close
 * the connection mid-operation.
 */
export function createNdjsonStream(): { stream: ReadableStream<Uint8Array>; writer: StreamWriter } {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let lastEmitAt = Date.now()

  function emit(event: StreamEvent): void {
    if (!controller) return
    try {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
      lastEmitAt = Date.now()
    } catch {
      // client disconnected — ignore
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      heartbeatTimer = setInterval(() => {
        if (Date.now() - lastEmitAt >= HEARTBEAT_INTERVAL_MS) {
          emit({ kind: "heartbeat", ts: Date.now() })
        }
      }, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = null
      controller = null
    },
  })

  const writer: StreamWriter = {
    write: emit,
    close() {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = null
      if (!controller) return
      try {
        controller.close()
      } catch {
        // already closed — ignore
      }
      controller = null
    },
  }

  return { stream, writer }
}

/**
 * Read a byte stream (typically `proc.stdout` or `proc.stderr` from
 * `Bun.spawn`) line-by-line, forwarding each completed line to the writer
 * tagged appropriately, and accumulating everything into a buffer for
 * post-run regex extraction (e.g. the `sizeInfo` scrape). Handles partial
 * trailing lines by flushing on close.
 */
export async function pumpProcessStream(
  readable: ReadableStream<Uint8Array>,
  tag: LogTag,
  writer: StreamWriter,
  sink: { buffer: string },
): Promise<void> {
  const reader = readable.getReader()
  const decoder = new TextDecoder()
  let carry = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      sink.buffer += chunk
      carry += chunk
      let idx: number
      while ((idx = carry.indexOf("\n")) !== -1) {
        const line = carry.slice(0, idx).replace(/\r$/, "")
        carry = carry.slice(idx + 1)
        if (line.length === 0) continue
        writer.write({ kind: "log", tag, line, ts: Date.now() })
      }
    }
    // Flush any trailing partial line (no newline at EOF).
    const tail = carry.trim()
    if (tail.length > 0) {
      writer.write({ kind: "log", tag, line: tail, ts: Date.now() })
    }
  } finally {
    reader.releaseLock()
  }
}
