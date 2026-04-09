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

export const evalRoutes = new Elysia()
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
    return result.evals.sort((a, b) => b.score.total - a.score.total)
  })

  .post("/api/eval/refresh", async () => {
    const result = await runBatchEval()
    return {
      evaluated: result.evals.length,
      avgScore: result.summary.avgScore,
    }
  })
