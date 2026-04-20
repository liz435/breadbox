// ── Session garbage collection ──────────────────────────────────────────
//
// Sessions are JSON files under `$DREAMER_HOME/sessions/` with an
// `expiresAt` timestamp. Expired files aren't actively harmful —
// `readSession()` already returns null for them — but they accumulate and
// make the sessions dir slower to scan. GC runs on boot and every 6h.
//
// Bounded: if more than 10k files exist we process 1k per tick sorted by
// mtime. Real deployments will never hit this; it's a defensive cap so a
// runaway attacker creating sessions can't wedge the GC under its own
// workload.
//
// The interval is `.unref()`'d so tests and short-lived CLI invocations
// can exit without waiting for the next tick.

import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { sessionsDir } from "../paths"
import { deleteSession } from "./session-store"
import { createLogger } from "../logger"

const log = createLogger("session-gc")

const GC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const MAX_SESSIONS_BEFORE_PAGINATION = 10_000
const MAX_PER_TICK = 1_000

let gcTimer: ReturnType<typeof setInterval> | null = null

type SessionProbe = {
  sid: string
  path: string
  mtimeMs: number
  expiresAt: number | null
}

async function listSessionProbes(dir: string): Promise<SessionProbe[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const probes: SessionProbe[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue
    const sid = entry.slice(0, -".json".length)
    const path = join(dir, entry)
    try {
      const s = await stat(path)
      probes.push({ sid, path, mtimeMs: s.mtimeMs, expiresAt: null })
    } catch {
      // stat failure → skip; a later tick will pick it up or the file is
      // already gone.
    }
  }
  return probes
}

async function probeExpiry(probe: SessionProbe): Promise<number | null> {
  try {
    const file = Bun.file(probe.path)
    if (!(await file.exists())) return null
    const raw = (await file.json()) as { expiresAt?: unknown }
    if (typeof raw.expiresAt === "number") return raw.expiresAt
    return null
  } catch {
    return null
  }
}

async function sweepOnce(): Promise<{ scanned: number; deleted: number }> {
  const dir = sessionsDir()
  const all = await listSessionProbes(dir)
  // When over the cap, process the oldest-mtime slice this tick. Fresh
  // sessions are unlikely to be expired so aging first is safe.
  const paged =
    all.length > MAX_SESSIONS_BEFORE_PAGINATION
      ? [...all].sort((a, b) => a.mtimeMs - b.mtimeMs).slice(0, MAX_PER_TICK)
      : all

  const now = Date.now()
  let deleted = 0
  for (const probe of paged) {
    const expiresAt = await probeExpiry(probe)
    // If the file is unreadable/corrupt, skip rather than delete — a
    // bad file today should be visible in logs, not quietly evicted.
    if (expiresAt == null) continue
    if (expiresAt >= now) continue
    await deleteSession(probe.sid)
    deleted += 1
  }
  return { scanned: paged.length, deleted }
}

export async function runSessionGcOnce(): Promise<{ scanned: number; deleted: number }> {
  try {
    const result = await sweepOnce()
    if (result.deleted > 0 || result.scanned > 0) {
      log.info(
        `gc tick scanned=${result.scanned} deleted=${result.deleted}`,
      )
    }
    return result
  } catch (err) {
    log.warn(
      `gc tick failed: ${err instanceof Error ? err.message : err}`,
    )
    return { scanned: 0, deleted: 0 }
  }
}

export function startSessionGc(): void {
  if (gcTimer) return
  // Kick an initial sweep on boot — fire-and-forget.
  void runSessionGcOnce()
  gcTimer = setInterval(() => {
    void runSessionGcOnce()
  }, GC_INTERVAL_MS)
  gcTimer.unref?.()
}

export function stopSessionGc(): void {
  if (gcTimer) {
    clearInterval(gcTimer)
    gcTimer = null
  }
}
