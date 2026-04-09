// ── Run Evaluator ───────────────────────────────────────────────────────
//
// Runs all analyzers on a single run file and produces a RunEval result.

import type { RunFile, RunEval } from "./types"
import { analyzePath } from "./analyzers/path-analyzer"
import { analyzeTokens } from "./analyzers/token-analyzer"
import { analyzeTools } from "./analyzers/tool-analyzer"
import { analyzeCircuit } from "./analyzers/circuit-analyzer"

function computeScore(eval_: Omit<RunEval, "score">): RunEval["score"] {
  // Accuracy (0-25): based on tool error rate
  const accuracy = Math.round(25 * (1 - eval_.tools.errorRate))

  // Efficiency (0-25): based on token waste
  const totalTokens = eval_.tokens.totalTokens || 1
  const wasteRatio = eval_.tokens.wastedTokens / totalTokens
  const efficiency = Math.round(25 * Math.max(0, 1 - wasteRatio * 2))

  // Quality (0-25): based on circuit issues and sketch compilation
  let quality = 25
  if (eval_.circuit) {
    const issueCount = eval_.circuit.floatingComponents + eval_.circuit.busShorts + eval_.circuit.missingResistors
    quality = Math.max(0, 25 - issueCount * 5)
    if (!eval_.circuit.sketchPinMatch) quality = Math.max(0, quality - 5)
    if (!eval_.circuit.sketchCompiles) quality = Math.max(0, quality - 10) // major penalty
  } else if (eval_.tools.totalCalls === 0) {
    quality = 0 // no work done
  }

  // Completeness (0-25): did the agent produce ops?
  let completeness = 0
  const opsCount = eval_.path.trace.filter(s => s.type === "tool_call").length
  if (opsCount > 0) completeness = 10
  if (eval_.circuit && eval_.circuit.componentsPlaced > 0) completeness = 15
  if (eval_.circuit && eval_.circuit.wiresCreated > 0) completeness = 20
  if (eval_.circuit && eval_.circuit.floatingComponents === 0 && eval_.circuit.componentsPlaced > 0) completeness = 25
  if (eval_.path.hallucinations.length > 0) completeness = Math.max(0, completeness - 10)

  const total = accuracy + efficiency + quality + completeness

  return {
    total,
    breakdown: { accuracy, efficiency, quality, completeness },
  }
}

export function evaluateRun(run: RunFile): RunEval {
  const path = analyzePath(run)
  const tokens = analyzeTokens(run)
  const tools = analyzeTools(run)
  const circuit = analyzeCircuit(run)

  const partial = {
    runId: run.run.id,
    evaluatedAt: new Date().toISOString(),
    agent: run.run.agent,
    prompt: run.prompt ?? "",
    status: run.run.status,
    path,
    tokens,
    tools,
    circuit,
  }

  return {
    ...partial,
    score: computeScore(partial),
  }
}
