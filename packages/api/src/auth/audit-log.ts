// ── Audit log ───────────────────────────────────────────────────────────
//
// Two backends, picked by BREADBOX_MODE:
//
//   • CLI (default): append-only JSONL rotated per calendar day under
//     `$BREADBOX_HOME/audit/{YYYY-MM-DD}.jsonl`. Operator handles
//     rotation/archival.
//
//   • Hosted: one row per event in `public.audit_events`. Indexed on
//     (user_id, ts desc) and (project_id, ts desc). RLS is intentionally
//     empty — service-role only.
//
// Writes are fire-and-forget in both modes: callers do `void auditLog(evt)`
// and never await. An audit failure (disk full, network blip, Supabase
// outage) must not fail the user's request — we log-warn locally and
// swallow.
//
// CLI concurrency: `fs.appendFile` + a single `\n`-terminated line per call
// is atomic on POSIX up to PIPE_BUF (4 KiB on Linux, 512 B on macOS) for
// our typical event sizes, so concurrent writers can't interleave partial
// lines.

import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { dreamerHome } from "../paths"
import { createLogger } from "../logger"
import { IS_HOSTED_MODE } from "../supabase/env"
import { getSupabaseAdmin } from "../supabase/admin-client"

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
// and BREADBOX_HOME can change between test runs via DATA_DIR. We run
// it unconditionally before each append rather than memoizing — a
// memoized promise would be bound to whichever path was resolved
// first, making tests that switch DATA_DIR flake on append.

async function ensureDir(): Promise<void> {
  await mkdir(auditDir(), { recursive: true })
}

// ── API ───────────────────────────────────────────────────────────────

// userId field arrives as either a Supabase UUID (hosted) or the fixed
// CLI local user UUID. The Postgres column is `uuid`-typed but
// historically we accepted the literal string "local" for legacy CLI
// callers. Pre-screen for the UUID shape; if the input doesn't match,
// we still write the JSONL row (CLI) but pass null into Postgres so
// the schema constraint isn't violated.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Append an event to today's audit file (CLI) or insert one row into
 * public.audit_events (hosted). Fire-and-forget: returns a promise that
 * never rejects. Callers should `void auditLog(...)` and not await
 * unless they specifically want to sequence against the write (rare).
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
    // rather than writing a bogus record.
    const parsed = auditEventSchema.safeParse(event)
    if (!parsed.success) {
      log.warn(`audit event failed schema: ${parsed.error.message}`)
      return
    }

    if (IS_HOSTED_MODE) {
      await writeToPostgres(parsed.data)
    } else {
      await writeToJsonl(parsed.data)
    }
  } catch (err) {
    // Swallow: audit must never fail a request.
    log.warn(`audit append failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function writeToJsonl(event: AuditEvent): Promise<void> {
  await ensureDir()
  await appendFile(auditFilePath(event.ts), JSON.stringify(event) + "\n")
}

async function writeToPostgres(event: AuditEvent): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("audit_events").insert({
    ts: new Date(event.ts).toISOString(),
    user_id: looksLikeUuid(event.userId) ? event.userId : null,
    action: event.action,
    project_id: event.projectId ?? null,
    extra: event.extra ?? null,
  })
  if (error) throw new Error(error.message)
}

/** Exposed for tests — file path for a given timestamp. */
export function _auditFilePathForTests(ts: number): string {
  return auditFilePath(ts)
}
