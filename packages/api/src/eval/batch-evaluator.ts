// ── Batch Evaluator ─────────────────────────────────────────────────────
//
// Evaluates all runs in data/runs/, writes per-run evals to data/tests/,
// and generates a summary.

import { readdir, readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"
import type { RunFile, RunEval, EvalSummary } from "./types"
import { evaluateRun } from "./run-evaluator"

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, "../../data")
const RUNS_DIR = join(DATA_DIR, "runs")
const TESTS_DIR = join(DATA_DIR, "tests")

export async function runBatchEval(): Promise<{ evals: RunEval[]; summary: EvalSummary }> {
  await mkdir(TESTS_DIR, { recursive: true })

  // Read all run files
  const files = await readdir(RUNS_DIR).catch(() => [] as string[])
  const runFiles = files.filter(f => f.endsWith(".json"))

  const evals: RunEval[] = []

  for (const file of runFiles) {
    try {
      const raw = await readFile(join(RUNS_DIR, file), "utf-8")
      const run = JSON.parse(raw) as RunFile
      if (run.run.status !== "completed") continue

      const eval_ = evaluateRun(run)
      evals.push(eval_)

      // Write per-run eval
      await writeFile(
        join(TESTS_DIR, `${eval_.runId}.json`),
        JSON.stringify(eval_, null, 2),
      )
    } catch {
      // Skip malformed run files
    }
  }

  // Build summary
  const summary = buildSummary(evals)
  await writeFile(
    join(TESTS_DIR, "summary.json"),
    JSON.stringify(summary, null, 2),
  )

  return { evals, summary }
}

export async function evaluateSingleRun(runId: string): Promise<RunEval | null> {
  await mkdir(TESTS_DIR, { recursive: true })

  try {
    const raw = await readFile(join(RUNS_DIR, `${runId}.json`), "utf-8")
    const run = JSON.parse(raw) as RunFile
    const eval_ = evaluateRun(run)

    await writeFile(
      join(TESTS_DIR, `${eval_.runId}.json`),
      JSON.stringify(eval_, null, 2),
    )

    return eval_
  } catch {
    return null
  }
}

export async function readEvalSummary(): Promise<EvalSummary | null> {
  try {
    const raw = await readFile(join(TESTS_DIR, "summary.json"), "utf-8")
    return JSON.parse(raw) as EvalSummary
  } catch {
    return null
  }
}

export async function readRunEval(runId: string): Promise<RunEval | null> {
  try {
    const raw = await readFile(join(TESTS_DIR, `${runId}.json`), "utf-8")
    return JSON.parse(raw) as RunEval
  } catch {
    return null
  }
}

function buildSummary(evals: RunEval[]): EvalSummary {
  const byModel: EvalSummary["byModel"] = {}
  const issueCounts = new Map<string, number>()

  for (const e of evals) {
    const model = e.tokens.model
    if (!byModel[model]) {
      byModel[model] = { runs: 0, avgScore: 0, totalTokens: 0, totalCost: 0 }
    }
    byModel[model].runs++
    byModel[model].avgScore += e.score.total
    byModel[model].totalTokens += e.tokens.totalTokens
    byModel[model].totalCost += e.tokens.estimatedCost

    // Collect issues
    for (const h of e.path.hallucinations) {
      issueCounts.set("Hallucination", (issueCounts.get("Hallucination") ?? 0) + 1)
    }
    if (e.tools.errors > 0) {
      issueCounts.set("Tool errors", (issueCounts.get("Tool errors") ?? 0) + e.tools.errors)
    }
    if (e.circuit?.busShorts) {
      issueCounts.set("Bus shorts", (issueCounts.get("Bus shorts") ?? 0) + e.circuit.busShorts)
    }
    if (e.circuit?.floatingComponents) {
      issueCounts.set("Floating components", (issueCounts.get("Floating components") ?? 0) + e.circuit.floatingComponents)
    }
    if (e.circuit?.missingResistors) {
      issueCounts.set("Missing resistors", (issueCounts.get("Missing resistors") ?? 0) + e.circuit.missingResistors)
    }
  }

  // Finalize model averages
  for (const m of Object.values(byModel)) {
    if (m.runs > 0) m.avgScore = Math.round(m.avgScore / m.runs)
    m.totalCost = Math.round(m.totalCost * 10000) / 10000
  }

  const totalRuns = evals.length
  const avgScore = totalRuns > 0 ? Math.round(evals.reduce((s, e) => s + e.score.total, 0) / totalRuns) : 0
  const avgToolErrorRate = totalRuns > 0
    ? Math.round(evals.reduce((s, e) => s + e.tools.errorRate, 0) / totalRuns * 100) / 100
    : 0
  const avgTokensPerRun = totalRuns > 0
    ? Math.round(evals.reduce((s, e) => s + e.tokens.totalTokens, 0) / totalRuns)
    : 0
  const hallucationRate = totalRuns > 0
    ? Math.round(evals.filter(e => e.path.hallucinations.length > 0).length / totalRuns * 100)
    : 0
  const proposeCircuitAdoption = totalRuns > 0
    ? Math.round(evals.filter(e => e.path.usedProposeCircuit).length / totalRuns * 100)
    : 0

  const topIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }))

  const worstRuns = [...evals]
    .sort((a, b) => a.score.total - b.score.total)
    .slice(0, 5)
    .map(e => ({
      runId: e.runId,
      score: e.score.total,
      issue: e.path.hallucinations[0] ?? e.tools.details.find(d => d.issue)?.issue ?? "Low score",
    }))

  return {
    generatedAt: new Date().toISOString(),
    totalRuns,
    byModel,
    avgScore,
    avgToolErrorRate,
    avgTokensPerRun,
    hallucationRate,
    proposeCircuitAdoption,
    topIssues,
    worstRuns,
  }
}
