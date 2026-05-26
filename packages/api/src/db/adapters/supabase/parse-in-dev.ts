// ── parseInDev ──────────────────────────────────────────────────────────
//
// Asymmetric zod validation: parse in dev (catches schema drift, helps
// during PR2 bring-up); type-cast in prod (saves ~5-20ms per project on
// the hot path). Trade-off accepted in Q14 — we accept production-only
// schema bugs in exchange for read latency on a hot path.

import type { ZodType } from "zod"

const IS_DEV = process.env.NODE_ENV !== "production"

export function parseInDev<T>(schema: ZodType<T>, value: unknown): T {
  if (IS_DEV) return schema.parse(value)
  return value as T
}
