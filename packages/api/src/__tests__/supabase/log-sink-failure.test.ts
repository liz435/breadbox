// ── Log sink failure-path tests ─────────────────────────────────────────
//
// Pins the failure-isolation contract: when the Supabase insert throws,
// the sink must (1) not propagate the error, (2) emit a throttled stderr
// warning, and (3) not block subsequent log calls. Also covers the
// swap-buffer behavior — emits from outside the flush's async chain land
// on the new buffer instead of getting dropped.
//
// Lives in __tests__/supabase/ and is gated on the same env flags as the
// integration tests, even though the test itself MOCKS the admin client
// (no real Supabase calls). Reason: we mutate BREADBOX_MODE=hosted to
// drive the sink, and that mutation is captured at module-init in
// supabase/env.ts — if we ran this in the default test path, the env
// would leak into other test files that import storage/audit modules and
// break them. The gating keeps the failure tests opt-in via the same
// SUPABASE_* env that the integration tests already require.

import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test"

const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

const HAS_SUPABASE =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  SUPABASE_SERVICE_ROLE_KEY.length > 0

const describeOrSkip = HAS_SUPABASE ? describe : describe.skip

if (HAS_SUPABASE) {
  process.env.BREADBOX_MODE = "hosted"
  process.env.BREADBOX_HOSTED = "1"
  process.env.BREADBOX_LOG_SUPABASE_LEVEL = "warn"
  const { captureSupabaseServiceRoleKey } = await import("../../secrets")
  captureSupabaseServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY)
}

// ── Mock state ─────────────────────────────────────────────────────────

type InsertCall = { table: string; rows: unknown[] }
const insertCalls: InsertCall[] = []
let nextInsertResult: { error: { message: string } | null } = { error: null }

function makeStubClient() {
  return {
    from(table: string) {
      return {
        insert(rows: unknown[]) {
          insertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
          return Promise.resolve(nextInsertResult)
        },
      }
    },
  }
}

if (HAS_SUPABASE) {
  mock.module("../../supabase/admin-client", () => ({
    getSupabaseAdmin: () => makeStubClient(),
  }))
}

// Import the sink AFTER the mock is registered.
const { emitToSupabase, flush, _logSinkInternals } = HAS_SUPABASE
  ? await import("../../log-supabase-sink")
  : ({
      emitToSupabase: () => {},
      flush: async () => {},
      _logSinkInternals: {
        clear: () => {},
        bufferSnapshot: () => [],
        stopTimer: () => {},
        setFloor: () => {},
        getFloor: () => "warn",
      },
    } as never)

// ── stderr capture ─────────────────────────────────────────────────────

const stderrCalls: string[] = []
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    stderrCalls.push(args.map((a) => String(a)).join(" "))
  }
})
afterAll(() => {
  console.error = originalConsoleError
  _logSinkInternals.stopTimer()
})

beforeEach(() => {
  _logSinkInternals.clear()
  insertCalls.length = 0
  stderrCalls.length = 0
  nextInsertResult = { error: null }
})

// ── Tests ───────────────────────────────────────────────────────────────

describeOrSkip("log-sink failure isolation", () => {
  test("Supabase error from insert is swallowed (doesn't throw)", async () => {
    emitToSupabase("warn", "test-tag", "first message")
    nextInsertResult = { error: { message: "simulated outage" } }
    await expect(flush()).resolves.toBeUndefined()
  })

  test("error path writes one throttled stderr warning", async () => {
    emitToSupabase("warn", "test-tag", "boom")
    nextInsertResult = { error: { message: "simulated outage" } }
    await flush()
    const warning = stderrCalls.find((s) => s.includes("[log-sink] flush failed"))
    expect(warning).toBeDefined()
    expect(warning).toContain("simulated outage")
  })

  test("failure-warning is throttled — second failure within window is silent", async () => {
    emitToSupabase("warn", "tag", "msg-a")
    nextInsertResult = { error: { message: "first-fail" } }
    await flush()
    emitToSupabase("warn", "tag", "msg-b")
    nextInsertResult = { error: { message: "second-fail" } }
    await flush()
    const failureWarnings = stderrCalls.filter((s) =>
      s.includes("[log-sink] flush failed"),
    )
    expect(failureWarnings.length).toBe(1)
    expect(failureWarnings[0]).toContain("first-fail")
    // The second failure did not produce a stderr line — but the batch
    // was still claimed (not requeued, per design).
    expect(_logSinkInternals.bufferSnapshot()).toHaveLength(0)
  })

  test("after a failed flush, the next emit still works", async () => {
    emitToSupabase("warn", "tag", "before-failure")
    nextInsertResult = { error: { message: "boom" } }
    await flush()
    // Failed batch is discarded (per design — no requeue).
    expect(_logSinkInternals.bufferSnapshot()).toHaveLength(0)

    // Subsequent emit lands on a fresh buffer and ships cleanly.
    nextInsertResult = { error: null }
    emitToSupabase("warn", "tag", "after-failure")
    await flush()
    const successful = insertCalls.filter((c) => c.table === "app_logs")
    // 2 calls total: the failing one + the recovery one.
    expect(successful.length).toBe(2)
  })

  test("level floor filters debug below the configured warn floor", () => {
    emitToSupabase("debug", "tag", "noisy")
    emitToSupabase("info", "tag", "informational")
    expect(_logSinkInternals.bufferSnapshot()).toHaveLength(0)
  })

  test("flush on empty buffer is a no-op (no insert call)", async () => {
    await flush()
    expect(insertCalls).toHaveLength(0)
  })
})

describeOrSkip("log-sink concurrent emission during flush", () => {
  test("emits from OUTSIDE the flush's async chain land in the new buffer", async () => {
    // The point of swap-buffer + ALS-scoped recursion guard: emits made
    // from a different async context (e.g., a parallel request handler)
    // during an in-flight flush are NOT dropped. They land on the fresh
    // active buffer and ship on the next flush.

    emitToSupabase("warn", "tag", "seed-a")
    emitToSupabase("warn", "tag", "seed-b")

    // Hold the insert open until we say so.
    let resolveInsert: (v: { error: null }) => void = () => {}
    const insertHeld = new Promise<{ error: null }>((r) => {
      resolveInsert = r
    })
    mock.module("../../supabase/admin-client", () => ({
      getSupabaseAdmin: () => ({
        from(table: string) {
          return {
            insert(rows: unknown[]) {
              insertCalls.push({
                table,
                rows: Array.isArray(rows) ? rows : [rows],
              })
              return insertHeld
            },
          }
        },
      }),
    }))
    const { flush: freshFlush, emitToSupabase: freshEmit, _logSinkInternals: fresh } =
      await import("../../log-supabase-sink")

    // Kick off the flush but don't await it yet.
    const flushPromise = freshFlush()
    // Yield one tick so flush() can swap the buffer and enter the await.
    await new Promise((r) => setTimeout(r, 0))

    // Now emit from OUTSIDE the flush's ALS scope. The recursion guard
    // doesn't trigger here — this call simulates a concurrent request
    // handler logging while the previous batch is in flight.
    freshEmit("warn", "tag", "during-flush")

    // Resolve the held insert and let flush finish.
    resolveInsert({ error: null })
    await flushPromise

    // The in-flight batch must have shipped the two seeded entries only.
    const appLogsInsert = insertCalls.find((c) => c.table === "app_logs")
    expect(appLogsInsert).toBeDefined()
    expect(appLogsInsert!.rows).toHaveLength(2)

    // The "during-flush" entry survives in the new buffer.
    const remaining = fresh.bufferSnapshot()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.message).toBe("during-flush")
  })
})
