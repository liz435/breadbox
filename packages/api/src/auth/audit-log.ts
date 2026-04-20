// ── Audit log ───────────────────────────────────────────────────────────
//
// Append-only JSONL, rotated per calendar day. Lives under
// `$DREAMER_HOME/audit/{YYYY-MM-DD}.jsonl`. The operator is responsible
// for rotation/archival beyond that — Dreamer does not delete or
// compress its own audit trail.
//
// Writes are fire-and-forget: the caller does `void auditLog(evt)` and
// never awaits. An audit failure (disk full, permission denied, etc.)
// must not fail the user's request, so we log-warn locally and swallow.
//
// Concurrency: `fs.appendFile` + a single `\n`-terminated line per call
// is atomic on POSIX up to PIPE_BUF (4 KiB on Linux, 512 B on macOS) for
// our typical event sizes. Much larger than our events, so concurrent
// writers can't interleave partial lines.

import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { dreamerHome } from "../paths"
import { createLogger } from "../logger"

const log = createLogger("audit")

/** Closed set of actions — adding here is a deliberate change. */
export type AuditAction =
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.rename"
  | "asset.upload"
  | "asset.delete"
  | "agent.run"
  | "compile.start"
  | "flash.start"
  | "admin.claim-project"

const auditActionSchema = z.enum([
  "project.create",
  "project.update",
  "project.delete",
  "project.rename",
  "asset.upload",
  "asset.delete",
  "agent.run",
  "compile.start",
  "flash.start",
  "admin.claim-project",
])

export const auditEventSchema = z.object({
  ts: z.number(),
  userId: z.string(),
  action: auditActionSchema,
  projectId: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
})

export type AuditEvent = z.infer<typeof auditEventSchema>

export type AuditEventInput = {
  userId: string
  action: AuditAction
  projectId?: string
  extra?: Record<string, unknown>
}

// ── Paths ─────────────────────────────────────────────────────────────

function auditDir(): string {
  return join(dreamerHome(), "audit")
}

function dayKey(ts: number): string {
  // UTC so file rollover is deterministic across machine timezones.
  return new Date(ts).toISOString().slice(0, 10)
}

function auditFilePath(ts: number): string {
  return join(auditDir(), `${dayKey(ts)}.jsonl`)
}

// ── Directory init ────────────────────────────────────────────────────
//
// `mkdir -p` is a cheap syscall (µs-scale) when the dir already exists,
// and DREAMER_HOME can change between test runs via DATA_DIR. We run
// it unconditionally before each append rather than memoizing — a
// memoized promise would be bound to whichever path was resolved
// first, making tests that switch DATA_DIR flake on append.

async function ensureDir(): Promise<void> {
  await mkdir(auditDir(), { recursive: true })
}

// ── API ───────────────────────────────────────────────────────────────

/**
 * Append an event to today's audit file. Fire-and-forget: returns a
 * promise that never rejects. Callers should `void auditLog(...)` and
 * not await unless they specifically want to sequence against the
 * write (which should be rare).
 */
export async function auditLog(input: AuditEventInput): Promise<void> {
  try {
    const event: AuditEvent = {
      ts: Date.now(),
      userId: input.userId,
      action: input.action,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.extra !== undefined ? { extra: input.extra } : {}),
    }
    // Validate before write; if the input was malformed, drop it here
    // rather than writing a bogus line.
    const parsed = auditEventSchema.safeParse(event)
    if (!parsed.success) {
      log.warn(`audit event failed schema: ${parsed.error.message}`)
      return
    }
    await ensureDir()
    await appendFile(auditFilePath(event.ts), JSON.stringify(parsed.data) + "\n")
  } catch (err) {
    // Swallow: audit must never fail a request.
    log.warn(`audit append failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Exposed for tests — file path for a given timestamp. */
export function _auditFilePathForTests(ts: number): string {
  return auditFilePath(ts)
}
