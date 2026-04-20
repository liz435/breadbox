// ── Eval Routes ─────────────────────────────────────────────────────────
//
// GET  /api/eval/dashboard  → HTML dashboard
// GET  /api/eval/summary    → summary JSON
// GET  /api/eval/run/:id    → per-run eval JSON
// GET  /api/eval/all        → all run evals as JSON array
// POST /api/eval/refresh    → re-run batch evaluator

import { Elysia } from "elysia"
import { runBatchEval, readEvalSummary, readRunEval } from "../eval/batch-evaluator"
import { generateDashboardHTML } from "../eval/dashboard"
import type { AuthContext } from "../auth/context"
import { authPlugin } from "../auth/middleware"
import { requireRateLimit, RateLimitError } from "../auth/rate-limit"

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route")
  return auth.userId
}

export const evalRoutes = new Elysia().use(authPlugin)
  .get("/api/eval/dashboard", ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8"
    return generateDashboardHTML()
  })

  .get("/api/eval/summary", async ({ set }) => {
    const summary = await readEvalSummary()
    if (!summary) {
      set.status = 404
      return { error: "No eval data. POST /api/eval/refresh to generate." }
    }
    return summary
  })

  .get("/api/eval/run/:id", async ({ params, set }) => {
    const eval_ = await readRunEval(params.id)
    if (!eval_) {
      set.status = 404
      return { error: `No eval for run ${params.id}` }
    }
    return eval_
  })

  .get("/api/eval/all", async () => {
    const result = await runBatchEval()
    return result.evals.sort((a, b) => {
      const ta = Date.parse(a.runCompletedAt ?? a.runCreatedAt ?? a.evaluatedAt ?? "")
      const tb = Date.parse(b.runCompletedAt ?? b.runCreatedAt ?? b.evaluatedAt ?? "")
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta)
    })
  })

  .post("/api/eval/refresh", async ({ auth, set }) => {
    const ownerId = requireOwnerId(auth)
    try {
      await requireRateLimit("eval", ownerId, auth?.mode)
    } catch (err) {
      if (err instanceof RateLimitError) {
        set.status = 429
        set.headers["Retry-After"] = String(err.retryAfterSec)
        return { error: err.message, retryAfterSec: err.retryAfterSec }
      }
      throw err
    }
    const result = await runBatchEval()
    return {
      evaluated: result.evals.length,
      avgScore: result.summary.avgScore,
    }
  })
