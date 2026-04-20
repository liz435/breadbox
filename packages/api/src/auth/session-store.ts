// ── Opaque session store ────────────────────────────────────────────────
//
// Each session is a JSON blob on disk at $DREAMER_HOME/sessions/{sid}.json.
// The session ID is opaque and generated server-side; it is the full
// capability — anyone with the value can act as the owner. Treat it
// accordingly in logs and wire protocols.
//
// Sliding TTL: every authed request refreshes `expiresAt` so an active
// user never gets kicked mid-session. We debounce to once-per-60s per
// session so a chatty client can't generate a write storm against the
// disk. The debounce state is in-process only — after a restart every
// session is eligible for one refresh, which is acceptable for a
// single-replica deployment.

import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { sessionsDir } from "../paths"

const sessionFileSchema = z.object({
  userId: z.string(),
  githubLogin: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
})

export type SessionFile = z.infer<typeof sessionFileSchema>

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const REFRESH_DEBOUNCE_MS = 60 * 1000

const lastRefreshAt = new Map<string, number>()

function sessionPath(sid: string): string {
  return join(sessionsDir(), `${sid}.json`)
}

function newSid(): string {
  return crypto.randomUUID().replaceAll("-", "") + randomSuffix()
}

function randomSuffix(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

export async function createSession(params: {
  userId: string
  githubLogin: string
  ttlMs?: number
}): Promise<{ sid: string; session: SessionFile }> {
  const now = Date.now()
  const ttl = params.ttlMs ?? DEFAULT_TTL_MS
  const session: SessionFile = {
    userId: params.userId,
    githubLogin: params.githubLogin,
    createdAt: now,
    expiresAt: now + ttl,
  }
  await mkdir(sessionsDir(), { recursive: true })
  const sid = newSid()
  await Bun.write(sessionPath(sid), JSON.stringify(session))
  return { sid, session }
}

export async function readSession(sid: string): Promise<SessionFile | null> {
  if (!isValidSid(sid)) return null
  const file = Bun.file(sessionPath(sid))
  if (!(await file.exists())) return null
  try {
    const parsed = sessionFileSchema.safeParse(await file.json())
    if (!parsed.success) return null
    if (parsed.data.expiresAt < Date.now()) return null
    return parsed.data
  } catch {
    return null
  }
}

export async function refreshSession(
  sid: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  if (!isValidSid(sid)) return
  const now = Date.now()
  const last = lastRefreshAt.get(sid) ?? 0
  if (now - last < REFRESH_DEBOUNCE_MS) return
  const existing = await readSession(sid)
  if (!existing) return
  const next: SessionFile = { ...existing, expiresAt: now + ttlMs }
  try {
    await Bun.write(sessionPath(sid), JSON.stringify(next))
    lastRefreshAt.set(sid, now)
  } catch {
    // best-effort — a failed refresh just means the session expires on schedule
  }
}

export async function deleteSession(sid: string): Promise<void> {
  if (!isValidSid(sid)) return
  lastRefreshAt.delete(sid)
  try {
    await Bun.file(sessionPath(sid)).delete()
  } catch {
    // already gone
  }
}

// Defense against path traversal via cookie value. SIDs we mint are
// hex+base64url; reject anything with path separators or `.` up front.
function isValidSid(sid: string): boolean {
  return /^[A-Za-z0-9_-]{16,}$/.test(sid)
}
