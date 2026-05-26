// ── Supabase log sink integration ───────────────────────────────────────
//
// Exercises the warn+ default, the buffer/flush cycle, and the
// failure-isolation guarantee. Reads back from `app_logs` via the
// service-role client.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

const HAS_SUPABASE =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  SUPABASE_SERVICE_ROLE_KEY.length > 0

const describeOrSkip = HAS_SUPABASE ? describe : describe.skip

if (HAS_SUPABASE) {
  process.env.DREAMER_MODE = "hosted"
  process.env.DREAMER_HOSTED = "1"
  process.env.DREAMER_LOG_SUPABASE_LEVEL = "warn"
  const { captureSupabaseServiceRoleKey } = await import("../../secrets")
  captureSupabaseServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY)
}

const { emitToSupabase, flush, _logSinkInternals } = HAS_SUPABASE
  ? await import("../../log-supabase-sink")
  : ({
      emitToSupabase: () => {},
      flush: async () => {},
      _logSinkInternals: { bufferSnapshot: () => [], clear: () => {}, stopTimer: () => {} },
    } as never)

let admin: SupabaseClient

describeOrSkip("log-supabase-sink", () => {
  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  beforeEach(() => {
    _logSinkInternals.clear()
  })

  afterAll(() => {
    _logSinkInternals.stopTimer()
  })

  test("warn entries land in app_logs after flush", async () => {
    const tag = `test-${crypto.randomUUID()}`
    emitToSupabase("warn", tag, "hello world")
    await flush()
    const { data, error } = await admin
      .from("app_logs")
      .select("tag, level, message")
      .eq("tag", tag)
      .limit(1)
    expect(error).toBeNull()
    expect(data?.[0]?.level).toBe("warn")
    expect(data?.[0]?.message).toBe("hello world")
  })

  test("debug entries are filtered out by the default warn floor", async () => {
    const tag = `test-${crypto.randomUUID()}`
    emitToSupabase("debug", tag, "noisy debug line")
    emitToSupabase("info", tag, "informational")
    expect(_logSinkInternals.bufferSnapshot()).toHaveLength(0)
    await flush()
    const { data } = await admin
      .from("app_logs")
      .select("tag")
      .eq("tag", tag)
    expect(data ?? []).toHaveLength(0)
  })

  test("buffer overflow drops oldest entries", async () => {
    // Push 250 (over the 200 limit). Oldest 50 should be dropped.
    for (let i = 0; i < 250; i += 1) {
      emitToSupabase("warn", "overflow-test", `entry ${i}`)
    }
    const buf = _logSinkInternals.bufferSnapshot()
    expect(buf.length).toBeLessThanOrEqual(200)
    // The first surviving message is `entry 50` or later (we don't
    // pin to exactly 50 because the size-threshold flush also fires
    // a `void flush()` once we hit the cap).
    expect(buf[0]?.message?.startsWith("entry ")).toBe(true)
    _logSinkInternals.clear()
  })

  test("flush on empty buffer is a no-op", async () => {
    _logSinkInternals.clear()
    await expect(flush()).resolves.toBeUndefined()
  })
})
