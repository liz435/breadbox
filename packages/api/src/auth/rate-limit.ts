// ── Per-user rate limiter ───────────────────────────────────────────────
//
// Token-bucket per (family, userId). Three named families cover the
// three expensive surfaces — compile/flash, chat/agent, and eval — each
// with its own burst capacity and refill rate so a user draining chat
// tokens doesn't block their own compiles and vice versa.
//
// In-memory only. A single Railway replica is the current target; when
// we scale out we'll need a shared store (Redis / Postgres). Until then,
// per-process buckets plus the process-level `_compile-limiter` are
// sufficient.
//
// Size-bound the map at MAX_BUCKETS so a churn of synthetic userIds
// can't balloon memory: on overflow we drop the whole map and rebuild
// from scratch. 10k entries is far larger than our expected concurrent
// user count — if we ever hit it, something is wrong anyway.

// ── Config ────────────────────────────────────────────────────────────

/** A named family defines bucket capacity + refill rate. */
export type RateLimitFamily = "compile" | "chat" | "eval"

type FamilyConfig = {
  /** Max tokens the bucket can hold (= burst capacity). */
  capacity: number
  /** Tokens added per second. */
  refillPerSec: number
}

const FAMILIES: Record<RateLimitFamily, FamilyConfig> = {
  // /api/compile + /api/flash — arduino-cli is CPU+disk heavy
  compile: { capacity: 6, refillPerSec: 1 },
  // /api/chat + /agent/run — Anthropic credits are the scarce resource
  chat: { capacity: 30, refillPerSec: 0.5 },
  // /api/eval/refresh — re-runs the whole batch evaluator
  eval: { capacity: 2, refillPerSec: 1 / 60 },
}

const MAX_BUCKETS = 10_000

// ── State ─────────────────────────────────────────────────────────────

type Bucket = {
  tokens: number
  updatedAt: number
}

const buckets = new Map<string, Bucket>()

function bucketKey(family: RateLimitFamily, userId: string): string {
  return `${family}:${userId}`
}

// ── Errors ────────────────────────────────────────────────────────────

/**
 * Thrown when a caller overdraws their bucket. `retryAfterSec` is
 * already rounded up so route handlers can drop it directly into the
 * `Retry-After` header.
 */
export class RateLimitError extends Error {
  readonly family: RateLimitFamily
  readonly retryAfterSec: number

  constructor(family: RateLimitFamily, retryAfterSec: number) {
    super(`rate limit exceeded for ${family}; retry after ${retryAfterSec}s`)
    this.name = "RateLimitError"
    this.family = family
    this.retryAfterSec = retryAfterSec
  }
}

// ── Core ──────────────────────────────────────────────────────────────

/**
 * Consume one token from (family, userId). Throws RateLimitError if the
 * bucket can't spot a token. Skip entirely in the NODE_ENV=test + dev
 * auth-mode combination — test suites slam endpoints in tight loops and
 * should not flap on this limiter.
 */
export async function requireRateLimit(
  family: RateLimitFamily,
  userId: string,
  authMode?: "hosted" | "local" | "dev",
): Promise<void> {
  if (authMode === "dev" && process.env.NODE_ENV === "test") return

  const cfg = FAMILIES[family]
  const now = Date.now()
  const key = bucketKey(family, userId)

  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    // Soft cap: nuke the whole map on overflow rather than tracking LRU
    // order. The refill rate restores capacity within seconds, and this
    // path should be cold in practice (10k is far above legitimate
    // concurrency).
    buckets.clear()
  }

  const existing = buckets.get(key)
  const bucket: Bucket = existing
    ? refill(existing, cfg, now)
    : { tokens: cfg.capacity, updatedAt: now }

  if (bucket.tokens < 1) {
    buckets.set(key, bucket)
    const deficit = 1 - bucket.tokens
    const retryAfterSec = Math.max(1, Math.ceil(deficit / cfg.refillPerSec))
    throw new RateLimitError(family, retryAfterSec)
  }

  bucket.tokens -= 1
  buckets.set(key, bucket)
}

function refill(b: Bucket, cfg: FamilyConfig, now: number): Bucket {
  const elapsedSec = Math.max(0, (now - b.updatedAt) / 1000)
  const added = elapsedSec * cfg.refillPerSec
  return {
    tokens: Math.min(cfg.capacity, b.tokens + added),
    updatedAt: now,
  }
}

/**
 * Test-only helper: clears all buckets. Exported under a guard so
 * production code can't accidentally reset live state.
 */
export function _resetRateLimitBucketsForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_resetRateLimitBucketsForTests called outside test env")
  }
  buckets.clear()
}
