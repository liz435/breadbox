// ── Batch Evaluator ─────────────────────────────────────────────────────
//
// Evaluates all runs in data/runs/, writes per-run evals to data/tests/,
// and generates a summary.

import { readdir, readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"
import type { RunFile, RunEval, EvalSummary, CategoryAggregate, RunCategory } from "./types"
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

function emptyAggregate(): CategoryAggregate {
  return {
    runs: 0,
    scored: 0,
    avgScore: 0,
    avgToolErrorRate: 0,
    avgTokensPerRun: 0,
    hallucinationRate: 0,
    totalCost: 0,
    byModel: {},
  }
}

function accumulate(agg: CategoryAggregate, e: RunEval): void {
  agg.runs++
  agg.totalCost += e.tokens.estimatedCost

  const model = e.tokens.model
  if (!agg.byModel[model]) {
    agg.byModel[model] = { runs: 0, avgScore: 0, totalTokens: 0, totalCost: 0 }
  }
  agg.byModel[model].runs++
  agg.byModel[model].totalTokens += e.tokens.totalTokens
  agg.byModel[model].totalCost += e.tokens.estimatedCost

  if (e.score) {
    agg.scored++
    agg.avgScore += e.score.total
    agg.byModel[model].avgScore += e.score.total
  }

  agg.avgToolErrorRate += e.tools.errorRate
  agg.avgTokensPerRun += e.tokens.totalTokens
  if (e.path.hallucinations.length > 0) agg.hallucinationRate++
}

function finalizeAggregate(agg: CategoryAggregate): void {
  if (agg.scored > 0) {
    agg.avgScore = Math.round(agg.avgScore / agg.scored)
  }
  if (agg.runs > 0) {
    agg.avgToolErrorRate = Math.round((agg.avgToolErrorRate / agg.runs) * 100) / 100
    agg.avgTokensPerRun = Math.round(agg.avgTokensPerRun / agg.runs)
    agg.hallucinationRate = Math.round((agg.hallucinationRate / agg.runs) * 100)
  }
  agg.totalCost = Math.round(agg.totalCost * 10000) / 10000

  for (const m of Object.values(agg.byModel)) {
    if (m.runs > 0) m.avgScore = Math.round(m.avgScore / m.runs)
    m.totalCost = Math.round(m.totalCost * 10000) / 10000
  }
}

function buildSummary(evals: RunEval[]): EvalSummary {
  const issueCounts = new Map<string, number>()
  const byDomain: Record<string, number> = {}
  let notEvaluable = 0

  const categories = {
    template: emptyAggregate(),
    topLevel: emptyAggregate(),
    delegated: emptyAggregate(),
    specialist: emptyAggregate(),
  }

  for (const e of evals) {
    if (!e.evaluable) notEvaluable++

    byDomain[e.domain] = (byDomain[e.domain] ?? 0) + 1

    // Route into category bucket
    const bucket: RunCategory = e.category
    if (bucket === "template") accumulate(categories.template, e)
    else if (bucket === "top_level") accumulate(categories.topLevel, e)
    else if (bucket === "delegated") accumulate(categories.delegated, e)
    else accumulate(categories.specialist, e)

    // Collect issues (pooled across all runs for top-line debugging)
    if (e.path.hallucinations.length > 0) {
      issueCounts.set("Hallucination", (issueCounts.get("Hallucination") ?? 0) + e.path.hallucinations.length)
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
    if (e.graph?.danglingEdges) {
      issueCounts.set("Dangling edges", (issueCounts.get("Dangling edges") ?? 0) + e.graph.danglingEdges)
    }
    if (e.graph?.orphanNodes) {
      issueCounts.set("Orphan nodes", (issueCounts.get("Orphan nodes") ?? 0) + e.graph.orphanNodes)
    }
    if (e.electrical?.pinOvercurrent) {
      issueCounts.set("Pin overcurrent", (issueCounts.get("Pin overcurrent") ?? 0) + e.electrical.pinOvercurrent)
    }
    if (e.electrical?.railOvercurrent) {
      issueCounts.set("Rail overcurrent", (issueCounts.get("Rail overcurrent") ?? 0) + e.electrical.railOvercurrent)
    }
    if (e.electrical?.missingExternalSupply) {
      issueCounts.set("Missing external supply", (issueCounts.get("Missing external supply") ?? 0) + e.electrical.missingExternalSupply)
    }
    if (e.electrical?.railDistributionViolations) {
      issueCounts.set(
        "Pin fan-out / rail distribution violations",
        (issueCounts.get("Pin fan-out / rail distribution violations") ?? 0) + e.electrical.railDistributionViolations
      )
    }
  }

  for (const agg of Object.values(categories)) finalizeAggregate(agg)

  const topIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }))

  // Worst runs — only top-level runs count for this list so the dashboard
  // shows the runs a user would actually notice.
  const worstRuns = evals
    .filter((e) => e.category === "top_level" && e.score !== null)
    .sort((a, b) => (a.score!.total - b.score!.total))
    .slice(0, 5)
    .map((e) => ({
      runId: e.runId,
      score: e.score!.total,
      issue:
        e.path.hallucinations[0] ??
        e.tools.details.find((d) => d.issue)?.issue ??
        (e.circuit?.issues[0]) ??
        (e.graph?.issues[0]) ??
        "Low score",
      category: e.category,
    }))

  // Legacy top-level rollup (headline numbers)
  const tl = categories.topLevel

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: evals.length,
    notEvaluable,
    categories,
    byDomain,
    topIssues,
    worstRuns,
    avgScore: tl.avgScore,
    avgToolErrorRate: tl.avgToolErrorRate,
    avgTokensPerRun: tl.avgTokensPerRun,
    hallucinationRate: tl.hallucinationRate,
    proposeCircuitAdoption: evals.length > 0
      ? Math.round(
          evals.filter((e) => e.category === "top_level" && e.path.usedProposeCircuit).length /
            Math.max(1, tl.runs) *
            100
        )
      : 0,
    byModel: tl.byModel,
  }
}
