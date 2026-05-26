// ── Supabase log sink ───────────────────────────────────────────────────
//
// Third sink for the runtime logger, alongside stderr and the local
// JSONL file. Active only when DREAMER_MODE=hosted; otherwise every
// entry path is a no-op and the function returns immediately.
//
// Design constraints (from PR3 plan, Q16):
//
//   1. Failure-isolated. A Supabase outage must never propagate back
//      into the request that emitted the log. All writes are wrapped
//      in try/catch and a "currently flushing" guard short-circuits
//      log-of-the-log recursion.
//
//   2. Buffered. The hot path pushes onto an in-memory ring buffer
//      with no IO. A flusher (interval + size threshold) batches into
//      one Postgres insert. The buffer is bounded — drop-oldest on
//      overflow with a stderr warning at most once per minute.
//
//   3. Level-gated. DREAMER_LOG_SUPABASE_LEVEL (default `warn`)
//      determines the floor. Full request tracing (debug+) is a
//      capability of the sink, but the default keeps cost low.
//
//   4. Redacted. Every payload passes through redactSensitive before
//      it enters the buffer, so even an in-memory crash dump doesn't
//      contain raw secrets.
//
//   5. Threaded. `user_id` / `request_id` are read from the per-
//      request AsyncLocalStorage at push time. Boot-time logs and
//      background workers without a request context get nulls.

import { getSupabaseAdmin } from "./supabase/admin-client"
import { IS_HOSTED_MODE } from "./supabase/env"
import { getRequestContext } from "./request-context"
import { redactSensitive } from "./logging-redact"

type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// ── Config ─────────────────────────────────────────────────────────────

function configuredFloor(): LogLevel {
  const raw = (process.env.DREAMER_LOG_SUPABASE_LEVEL ?? "warn").toLowerCase()
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw
  }
  return "warn"
}

const BUFFER_LIMIT = 200
const FLUSH_INTERVAL_MS = 1_000
const DROP_WARNING_THROTTLE_MS = 60_000
const FAILURE_WARNING_THROTTLE_MS = 60_000

// ── State ──────────────────────────────────────────────────────────────

type Entry = {
  ts: string
  level: LogLevel
  tag: string
  message: string
  data: unknown | null
  user_id: string | null
  request_id: string | null
}

const buffer: Entry[] = []
let flushing = false
let flushTimer: ReturnType<typeof setInterval> | null = null
let lastDropWarning = 0
let lastFailureWarning = 0
let droppedSinceLastWarning = 0

function ensureFlushTimer(): void {
  if (flushTimer != null) return
  flushTimer = setInterval(() => {
    void flush()
  }, FLUSH_INTERVAL_MS)
  // Don't keep the process alive solely for the log flusher.
  if (typeof flushTimer === "object" && "unref" in flushTimer) {
    ;(flushTimer as { unref(): void }).unref()
  }
}

// ── Public surface ─────────────────────────────────────────────────────

/**
 * Buffer one log entry for shipment to `public.app_logs`. Returns
 * synchronously after a level check + push; the actual insert is
 * batched. Safe to call in CLI mode (no-op) and during a failing
 * flush (the `flushing` guard short-circuits to prevent recursion).
 */
export function emitToSupabase(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown,
): void {
  if (!IS_HOSTED_MODE) return
  if (flushing) return // recursion guard — flush errors must not re-enter
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredFloor()]) return

  const ctx = getRequestContext()
  const safeData =
    data !== undefined ? (redactSensitive(data) as unknown) : null

  const entry: Entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    message,
    data: safeData,
    user_id: ctx?.userId ?? null,
    request_id: ctx?.requestId ?? null,
  }

  if (buffer.length >= BUFFER_LIMIT) {
    buffer.shift() // drop-oldest
    droppedSinceLastWarning += 1
    const now = Date.now()
    if (now - lastDropWarning > DROP_WARNING_THROTTLE_MS) {
      lastDropWarning = now
      // eslint-disable-next-line no-console -- intentional fallback
      console.error(
        `[log-sink] buffer overflow: dropped ${droppedSinceLastWarning} entries since last warning`,
      )
      droppedSinceLastWarning = 0
    }
  }

  buffer.push(entry)
  ensureFlushTimer()
  if (buffer.length >= BUFFER_LIMIT) {
    // Don't await: fire and forget. The recursion guard means a flush
    // error path can't re-enter this function.
    void flush()
  }
}

/**
 * Drain the buffer into one Postgres insert. Exported for tests and
 * the graceful-shutdown hook (PR-future); production traffic goes
 * through the interval timer.
 */
export async function flush(): Promise<void> {
  if (!IS_HOSTED_MODE) return
  if (flushing) return
  if (buffer.length === 0) return

  flushing = true
  const batch = buffer.splice(0, buffer.length)
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from("app_logs").insert(batch)
    if (error) throw new Error(error.message)
  } catch (err) {
    const now = Date.now()
    if (now - lastFailureWarning > FAILURE_WARNING_THROTTLE_MS) {
      lastFailureWarning = now
      // eslint-disable-next-line no-console -- intentional fallback
      console.error(
        `[log-sink] flush failed (next warning in 60s): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    // Don't requeue: keeping a failed batch around risks an infinite
    // loop if the underlying cause is structural (e.g., schema drift).
    // The stderr fallback above is the operator's signal.
  } finally {
    flushing = false
  }
}

/** Test-only escape hatches. */
export const _logSinkInternals = {
  bufferSnapshot(): Entry[] {
    return [...buffer]
  },
  clear(): void {
    buffer.length = 0
    droppedSinceLastWarning = 0
    lastDropWarning = 0
    lastFailureWarning = 0
  },
  stopTimer(): void {
    if (flushTimer != null) {
      clearInterval(flushTimer)
      flushTimer = null
    }
  },
}
