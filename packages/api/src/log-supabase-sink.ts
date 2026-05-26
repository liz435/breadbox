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
//      in try/catch and an ALS-scoped recursion guard prevents the
//      Supabase client's own log emissions from re-entering the sink.
//
//   2. Buffered (swap-buffer). The hot path pushes onto an active
//      buffer with no IO. flush() atomically swaps the active buffer
//      for an empty one and ships the swapped batch — so concurrent
//      emitToSupabase calls during a flush are NOT dropped; they land
//      in the fresh active buffer. The buffer is bounded — drop-oldest
//      on overflow with a stderr warning at most once per minute.
//
//   3. Level-gated. DREAMER_LOG_SUPABASE_LEVEL (default `warn`)
//      determines the floor. Read once at module load — flipping the
//      env at runtime requires a restart, which matches every other
//      Dreamer config knob.
//
//   4. Redacted. Every payload passes through redactSensitive before
//      it enters the buffer, so even an in-memory crash dump doesn't
//      contain raw secrets.
//
//   5. Threaded. `user_id` / `request_id` are read from the per-
//      request AsyncLocalStorage at push time. Boot-time logs and
//      background workers without a request context get nulls.

import { AsyncLocalStorage } from "node:async_hooks"
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

function parseFloor(raw: string): LogLevel {
  const lower = raw.toLowerCase()
  if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error") {
    return lower
  }
  return "warn"
}

// Cached at module load — runtime env mutation isn't a supported feature
// (matches every other DREAMER_* knob). Tests that need to flip the level
// use `_logSinkInternals.setFloor`.
let floor: LogLevel = parseFloor(process.env.DREAMER_LOG_SUPABASE_LEVEL ?? "warn")

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

// Active buffer for incoming entries. flush() swaps this for an empty
// array and ships the swapped reference. Concurrent emitToSupabase calls
// during a flush land here, not in the in-flight batch.
let buffer: Entry[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let lastDropWarning = 0
let lastFailureWarning = 0
let droppedSinceLastWarning = 0

// ALS-scoped recursion guard: only emissions made *inside* the async
// chain of flush() short-circuit. Unrelated request handlers logging
// during an overlapping flush are unaffected — they land on the active
// buffer and ship on the next interval.
const insideFlush = new AsyncLocalStorage<true>()

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
 * batched. Safe to call in CLI mode (no-op).
 *
 * Recursion guard: only skips when the caller is itself inside the
 * Supabase insert's async chain (e.g., the SDK emitting its own logs).
 * Concurrent request handlers logging during a flush land in the swapped
 * buffer and ship on the next interval.
 */
export function emitToSupabase(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown,
): void {
  if (!IS_HOSTED_MODE) return
  if (insideFlush.getStore()) return // ALS-scoped recursion guard
  if (LEVEL_ORDER[level] < LEVEL_ORDER[floor]) return

  // Try to drain a full buffer before resorting to drop-oldest. The
  // swap-buffer means flush() doesn't block this call; if it succeeds,
  // the next push lands on a fresh buffer with room to spare.
  if (buffer.length >= BUFFER_LIMIT) {
    void flush()
  }
  if (buffer.length >= BUFFER_LIMIT) {
    buffer.shift() // drop-oldest only after flush had its chance
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

  const ctx = getRequestContext()
  const safeData =
    data !== undefined ? (redactSensitive(data) as unknown) : null

  buffer.push({
    ts: new Date().toISOString(),
    level,
    tag,
    message,
    data: safeData,
    user_id: ctx?.userId ?? null,
    request_id: ctx?.requestId ?? null,
  })
  ensureFlushTimer()
}

/**
 * Drain the buffer into one Postgres insert. Exported for tests and
 * the SIGTERM shutdown hook in index.ts; production traffic goes
 * through the interval timer.
 *
 * Uses swap-buffer semantics: the active buffer is replaced with an
 * empty array up front, so concurrent emitToSupabase calls during the
 * insert land safely on the new buffer.
 */
export async function flush(): Promise<void> {
  if (!IS_HOSTED_MODE) return
  if (buffer.length === 0) return

  // Swap-buffer: claim the current entries by reassigning the reference.
  // Any concurrent emitToSupabase calls land on the new buffer.
  const batch = buffer
  buffer = []

  await insideFlush.run(true, async () => {
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
    }
  })
}

/** Test-only escape hatches. */
export const _logSinkInternals = {
  bufferSnapshot(): Entry[] {
    return [...buffer]
  },
  clear(): void {
    buffer = []
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
  setFloor(level: LogLevel): void {
    floor = level
  },
  getFloor(): LogLevel {
    return floor
  },
}
