// ── Agent Router ─────────────────────────────────────────────────────────
//
// Decides which model and tool mode to use for a turn. Replaces the old
// regex-only heuristic with a multi-dimensional router that considers:
//
//   1. Domain          — is this a breadboard, graph, or mixed request?
//   2. State complexity — how populated are the breadboard and graph right now?
//   3. Request type    — additive, surgical, or full rebuild?
//   4. Recent failures — did the previous turn fail? Escalate if so.
//
// The final decision is recorded on the run file via RoutingDecision so
// eval/router-quality can be measured directly instead of being lost in
// per-turn logs.

import type { ProjectFile } from "../db/schemas";
import type { AgentRunFile } from "../db/schemas";
import type { ToolMode } from "./core/tools";
import { classifyComplexity } from "./intent-classifier";

export type Domain = "breadboard" | "graph" | "mixed" | "ambiguous";
export type RequestType = "additive" | "surgical" | "rebuild" | "debug" | "question";

export type RoutingDecision = {
  model: "claude-sonnet-4-6" | "claude-haiku-4-5-20251001";
  toolMode: ToolMode;
  domain: Domain;
  requestType: RequestType;
  complexity: "simple" | "complex";
  /** Why this model was chosen — for post-hoc router quality analysis. */
  reasons: string[];
  /** Signals the router considered. */
  signals: {
    boardComponentCount: number;
    graphNodeCount: number;
    promptLength: number;
    recentFailures: number;
    componentsMentioned: number;
  };
};

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ── Domain detection ────────────────────────────────────────────────────

const BREADBOARD_KEYWORDS =
  /\bled\b|\bbutton\b|\bservo\b|\bwire\b|\bresistor\b|\bcapacitor\b|\bsensor\b|\bbuzzer\b|\bbreadboard\b|\bpin\b|\bcomponent\b|\bgnd\b|\b5v\b|\bcircuit\b|\bpot(?:entiometer)?\b|\bneopixel\b|\blcd\b|\boled\b/i;

const GRAPH_KEYWORDS =
  /\bgraph\b|\bnode\b|\bblock\b|\bvisual\b|\bedge\b|\bconnect\b|\bvisually\b|\bflow\s*(?:chart|diagram)\b/i;

function detectDomain(
  prompt: string,
  boardComponents: number,
  graphNodes: number
): Domain {
  const hasBoard = BREADBOARD_KEYWORDS.test(prompt);
  const hasGraph = GRAPH_KEYWORDS.test(prompt);

  if (hasBoard && hasGraph) return "mixed";
  if (hasGraph && !hasBoard) return "graph";
  if (hasBoard && !hasGraph) return "breadboard";

  // No keywords — fall back to state: whichever surface has more content
  if (boardComponents === 0 && graphNodes === 0) return "ambiguous";
  if (graphNodes > boardComponents * 2) return "graph";
  if (boardComponents > graphNodes * 2) return "breadboard";
  return "mixed";
}

// ── Request type ────────────────────────────────────────────────────────

const ADDITIVE_TRIGGERS =
  /\b(?:add|also|another|more|extra|include|attach|put\s+(?:in|on)|insert)\b/i;
const SURGICAL_TRIGGERS =
  /\b(?:remove|delete|change|update|fix|rename|move|swap|replace\s+the\b)\b/i;
const REBUILD_TRIGGERS =
  /\b(?:rebuild|redesign|start\s+over|from\s+scratch|replace\s+with\s+(?:a\s+)?(?:new|different|another)|different\s+(?:circuit|design|version))\b/i;
const DEBUG_TRIGGERS =
  /\b(?:debug|why|not\s+working|broken|wrong|doesn'?t\s+work|fails?|error|issue|problem|trace|diagnose)\b/i;
const QUESTION_TRIGGERS =
  /^(?:what|how|why|when|where|can\s+you|is\s+there|should\s+i|do\s+i|would\s+(?:this|it))\b/i;
const DIAGRAM_IMPORT_TRIGGERS =
  /\$schema\s*:\s*["']dreamer-diagram-v\d+["']|\b(?:paste|import)\s+(?:a\s+)?diagram\b|\bdreamer-diagram\b/i;

function detectRequestType(prompt: string): RequestType {
  const p = prompt.toLowerCase().trim();
  if (DEBUG_TRIGGERS.test(p)) return "debug";
  if (REBUILD_TRIGGERS.test(p)) return "rebuild";
  if (SURGICAL_TRIGGERS.test(p)) return "surgical";
  if (ADDITIVE_TRIGGERS.test(p)) return "additive";
  if (QUESTION_TRIGGERS.test(p.split(/[.!?\n]/)[0] ?? p)) return "question";
  // Default: additive if the prompt mentions a component, else question
  if (BREADBOARD_KEYWORDS.test(p) || GRAPH_KEYWORDS.test(p)) return "additive";
  return "question";
}

// ── Complexity signals ──────────────────────────────────────────────────

function countComponentsMentioned(prompt: string): number {
  const patterns = [
    /\bled\b/, /\bbutton\b/, /\bservo\b/, /\bmotor\b/, /\bbuzzer\b/,
    /\bpot\b|\bpotentiometer\b/, /\bsensor\b/, /\brelay\b/, /\bresistor\b/,
    /\bcapacitor\b/, /\bdisplay\b/, /\bneopixel\b/, /\blcd\b/, /\boled\b/,
  ];
  return patterns.filter((re) => re.test(prompt)).length;
}

function countRecentFailures(priorRuns: AgentRunFile[] | undefined): number {
  if (!priorRuns || priorRuns.length === 0) return 0;
  // Look at the last 3 core runs
  const recent = priorRuns
    .filter((r) => r.run.agent === "core")
    .slice(-3);
  return recent.filter(
    (r) => r.run.status === "failed" || (r.run.error != null && r.run.error !== "")
  ).length;
}

// ── Main router ─────────────────────────────────────────────────────────

export function routeRequest(params: {
  prompt: string;
  project: ProjectFile;
  priorRuns?: AgentRunFile[];
}): RoutingDecision {
  const { prompt, project, priorRuns } = params;
  const reasons: string[] = [];

  // Signals
  const boardComponents = project.boardState
    ? Object.values(project.boardState.components).filter(
        (c) => c.type !== "arduino_uno"
      ).length
    : 0;
  const graphNodes = project.graph
    ? Object.keys(project.graph.nodes).length
    : 0;
  const promptLength = prompt.length;
  const recentFailures = countRecentFailures(priorRuns);
  const componentsMentioned = countComponentsMentioned(prompt);
  const hasDiagramImportIntent = DIAGRAM_IMPORT_TRIGGERS.test(prompt);

  // Dimensions
  const domain = detectDomain(prompt, boardComponents, graphNodes);
  const requestType = detectRequestType(prompt);
  const complexity = classifyComplexity(prompt);

  if (hasDiagramImportIntent) {
    reasons.push("diagram import intent detected");
  }

  // ── Model selection ──────────────────────────────────────────────────
  //
  // Escalate to Sonnet when ANY of:
  //   - classifyComplexity returned "complex"
  //   - the previous turn failed (retry deserves the stronger model)
  //   - the request is a rebuild on a populated board (high-risk mutation)
  //   - the request is a debug (diagnosis needs reasoning)
  //   - the request mentions ≥3 components (multi-step wiring)
  //   - the prompt is long (>200 chars = lots of constraints)
  //   - it's a "mixed" domain (touches both surfaces)
  //
  // Otherwise use Haiku.

  // Experiment: force Haiku for all requests regardless of escalation signals.
  const model: RoutingDecision["model"] = HAIKU_MODEL;
  reasons.push("experiment: all-Haiku override");

  // ── Tool mode selection ──────────────────────────────────────────────
  //
  // build  — empty board + additive/ambiguous request (use propose_circuit)
  // edit   — populated board + surgical/additive/debug request
  // all    — rebuild request (grant everything)
  //
  // Graph-only domain bypasses core tools via delegation, so we still pick
  // a board mode here for the core agent's initial routing.

  let toolMode: ToolMode;
  if (requestType === "rebuild") {
    toolMode = "all";
    reasons.push("rebuild → all-tools mode");
  } else if (hasDiagramImportIntent) {
    toolMode = boardComponents === 0 ? "build" : "edit";
    reasons.push("diagram import → board mode with apply_design");
  } else if (boardComponents === 0) {
    toolMode = "build";
    reasons.push("empty board → build mode (propose_circuit)");
  } else {
    toolMode = "edit";
    reasons.push(`${boardComponents} components present → edit mode`);
  }

  return {
    model,
    toolMode,
    domain,
    requestType,
    complexity,
    reasons,
    signals: {
      boardComponentCount: boardComponents,
      graphNodeCount: graphNodes,
      promptLength,
      recentFailures,
      componentsMentioned,
    },
  };
}
