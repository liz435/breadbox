// ── Run Evaluator ───────────────────────────────────────────────────────
//
// Dispatches to domain-specific analyzers and produces a RunEval result.
// Runs are classified into a domain first (breadboard / graph / mixed /
// template / chat_only / unknown); domains drive which analyzers run and
// whether a numeric score is even meaningful.

import type { RunFile, RunEval, RunDomain, RunCategory } from "./types"
import { analyzePath } from "./analyzers/path-analyzer"
import { analyzeTokens } from "./analyzers/token-analyzer"
import { analyzeTools } from "./analyzers/tool-analyzer"
import { analyzeCircuit } from "./analyzers/circuit-analyzer"
import { analyzeGraph } from "./analyzers/graph-analyzer"
import { analyzeElectrical } from "./analyzers/electrical-analyzer"

// ── Op kind classification ───────────────────────────────────────────────

const BOARD_OP_KINDS = new Set([
  "place_component", "remove_component", "move_component",
  "update_component", "connect_wire", "remove_wire", "update_wire",
  "wire_component_to_pin", "set_pin_mode", "update_sketch",
  "patch_sketch", "update_board_settings",
])

const GRAPH_OP_KINDS = new Set([
  "create_graph_node", "delete_graph_node", "move_graph_node",
  "update_graph_node_data", "create_edge", "delete_edge",
])

function classifyDomain(run: RunFile): RunDomain {
  if (run.tokenUsage?.model === "template") return "template"

  const kinds = new Set(run.proposedOps.map((op) => op.kind))
  const hasBoard = [...kinds].some((k) => BOARD_OP_KINDS.has(k))
  const hasGraph = [...kinds].some((k) => GRAPH_OP_KINDS.has(k))

  if (hasBoard && hasGraph) return "mixed"
  if (hasBoard) return "breadboard"
  if (hasGraph) return "graph"

  // No ops produced — could be a conversational turn or a failed run
  if (run.proposedOps.length === 0) return "chat_only"

  return "unknown"
}

function classifyCategory(run: RunFile): RunCategory {
  if (run.tokenUsage?.model === "template") return "template"
  if (run.run.parentRunId) return "delegated"
  if (run.run.agent === "core") return "top_level"
  // Non-core agent with no parent — rare but possible
  return "specialist"
}

function computeScore(
  partial: Omit<RunEval, "score"> & { assistantText?: string }
): RunEval["score"] {
  const { circuit, graph, domain, tools } = partial

  // Runs that aren't evaluable don't get a score
  if (!partial.evaluable) return null

  // Accuracy (0-25): based on tool error rate
  const accuracy = Math.round(25 * (1 - tools.errorRate))

  // Efficiency (0-25): based on token waste (no change)
  const totalTokens = partial.tokens.totalTokens || 1
  const wasteRatio = partial.tokens.wastedTokens / totalTokens
  const efficiency = Math.round(25 * Math.max(0, 1 - wasteRatio * 2))

  // Quality (0-25): domain-specific
  let quality = 25
  if (domain === "breadboard" || domain === "mixed") {
    if (circuit) {
      const issueCount = circuit.floatingComponents + circuit.busShorts + circuit.missingResistors
      quality = Math.max(0, 25 - issueCount * 5)
      if (!circuit.sketchPinMatch) quality = Math.max(0, quality - 5)
      if (!circuit.sketchCompiles) quality = Math.max(0, quality - 10)
    } else if (tools.totalCalls === 0) {
      quality = 0
    }
  } else if (domain === "graph") {
    if (graph) {
      quality = 25
      if (graph.danglingEdges > 0) quality -= graph.danglingEdges * 5
      if (graph.orphanNodes > 0) quality -= graph.orphanNodes * 3
      if (!graph.hasSetup) quality -= 5
      if (!graph.hasLoop) quality -= 5
      if (graph.hasSetup && !graph.setupReachesAction) quality -= 5
      if (graph.hasLoop && !graph.loopReachesAction) quality -= 5
      quality = Math.max(0, quality)
    } else {
      quality = 0
    }
  } else if (domain === "template") {
    // Templates are deterministic — perfect quality unless they somehow error
    quality = tools.errors > 0 ? 15 : 25
  } else if (domain === "chat_only") {
    // Conversational — no quality signal, give a neutral score
    quality = 15
  }

  if (partial.electrical) {
    quality = Math.max(
      0,
      quality - partial.electrical.errors * 6 - partial.electrical.warnings * 2
    )
  }

  // Completeness (0-25): did the agent produce work?
  let completeness = 0
  const opsCount = partial.path.trace.filter((s) => s.type === "tool_call").length

  if (domain === "breadboard" || domain === "mixed") {
    if (opsCount > 0) completeness = 10
    if (circuit && circuit.componentsPlaced > 0) completeness = 15
    if (circuit && circuit.wiresCreated > 0) completeness = 20
    if (circuit && circuit.floatingComponents === 0 && circuit.componentsPlaced > 0) completeness = 25
  } else if (domain === "graph") {
    if (graph && graph.nodesPlaced > 0) completeness = 10
    if (graph && graph.edgesCreated > 0) completeness = 15
    if (graph && graph.hasSetup && graph.hasLoop) completeness = 20
    if (graph && graph.setupReachesAction && graph.loopReachesAction) completeness = 25
  } else if (domain === "template") {
    completeness = 25
  } else if (domain === "chat_only") {
    // Conversational runs — just having a response is "complete"
    completeness = partial.assistantText ? 20 : 0
  }

  if (partial.path.hallucinations.length > 0) {
    completeness = Math.max(0, completeness - 10)
  }

  const total = accuracy + efficiency + quality + completeness

  return {
    total,
    breakdown: { accuracy, efficiency, quality, completeness },
  }
}

export function evaluateRun(run: RunFile): RunEval {
  const domain = classifyDomain(run)
  const category = classifyCategory(run)

  const path = analyzePath(run)
  const tokens = analyzeTokens(run)
  const tools = analyzeTools(run)

  // Domain-gated analyzers
  const circuit = (domain === "breadboard" || domain === "mixed")
    ? analyzeCircuit(run)
    : null
  const graph = (domain === "graph" || domain === "mixed")
    ? analyzeGraph(run)
    : null
  const electrical = (domain === "breadboard" || domain === "mixed" || domain === "template")
    ? analyzeElectrical(run)
    : null

  // Not-evaluable gate: "unknown" domain has no analyzer we trust.
  // Chat-only runs and template runs are still evaluable but scored differently.
  const evaluable = domain !== "unknown"
  const notEvaluableReason = evaluable
    ? undefined
    : `Domain "${domain}" has no analyzer — the run did work outside breadboard/graph and cannot be scored with the current rubric.`

  const partial: Omit<RunEval, "score"> & { assistantText?: string } = {
    runId: run.run.id,
    evaluatedAt: new Date().toISOString(),
    agent: run.run.agent,
    prompt: run.prompt ?? "",
    status: run.run.status,
    evaluable,
    notEvaluableReason,
    domain,
    category,
    routing: run.routing,
    path,
    tokens,
    tools,
    circuit,
    graph,
    electrical,
    // Not part of RunEval but used in computeScore for chat-only runs
    assistantText: run.assistantText,
  }

  const score = computeScore(partial)

  // Strip the transient assistantText before returning
  const { assistantText: _assistantText, ...clean } = partial

  return { ...clean, score } as RunEval
}
