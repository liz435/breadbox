// ── Agent Eval Types ────────────────────────────────────────────────────

export type TraceStep = {
  step: number
  type: "tool_call" | "tool_result" | "text"
  toolName?: string
  toolCallId?: string
  toolInput?: unknown        // full input, not truncated
  toolResult?: unknown       // full result, not truncated
  succeeded?: boolean
  error?: string
  text?: string
}

export type PathAnalysis = {
  stepCount: number
  stepLimit: number
  retryCount: number
  hallucinations: string[]
  usedProposeCircuit: boolean
  delegations: string[]
  trace: TraceStep[]
}

export type TokenAnalysis = {
  model: string
  inputTokens: number
  outputTokens: number
  /** End-to-end total: parent stream + child runs + overhead. */
  totalTokens: number
  /** Sum of delegated child-run tokens, if any. */
  childTokens: number
  /** Sum of overhead calls (summarizer, etc.). */
  overheadTokens: number
  estimatedCost: number
  wastedTokens: number
  wasteDetails: string[]
  toolBreakdown?: {
    source: "workflow" | "estimate"
    attribution?: "step_usage_allocation"
    parentTokens: number
    unattributed: number
    rows: Array<{
      tool: string
      calls: number
      tokens: number
      inputTokens?: number
      outputTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    }>
  }
}

export type ToolDetail = {
  tool: string
  input: Record<string, unknown>
  result: "success" | "error" | "hallucination"
  issue?: string
}

export type ToolAnalysis = {
  totalCalls: number
  errors: number
  errorRate: number
  /** Fabricated / unresolvable IDs across any domain (components, graph nodes, edges). */
  hallucinatedIds: number
  /** Wrong pin names passed to a breadboard tool (breadboard domain only). */
  wrongPinNames: number
  /** Breadboard positions that fall outside the board grid (breadboard only). */
  invalidPositions: number
  /** Graph edges that reference unknown nodes / ports (graph domain only). */
  invalidGraphConnections: number
  details: ToolDetail[]
}

export type PlacedComponent = {
  id: string
  type: string
  name: string
  x: number
  y: number
  pins: Record<string, unknown>
  properties: Record<string, unknown>
}

export type PlacedWire = {
  id: string
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  color: string
  fromLabel: string  // human-readable: "Arduino D13" or "(5,2)"
  toLabel: string
}

export type CircuitAnalysis = {
  componentsPlaced: number
  wiresCreated: number
  floatingComponents: number
  busShorts: number
  missingResistors: number
  sketchPinMatch: boolean
  sketchCompiles: boolean
  issues: string[]
  // Full output — what was actually placed
  components: PlacedComponent[]
  wires: PlacedWire[]
  sketch: string
} | null

// ── Graph Analysis ──────────────────────────────────────────────────────

export type PlacedGraphNode = {
  id: string
  type: string
  name: string
  x: number
  y: number
}

export type PlacedGraphEdge = {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

export type GraphAnalysis = {
  nodesPlaced: number
  edgesCreated: number
  /** Number of edges that reference nodes not present in the final graph. */
  danglingEdges: number
  /** Number of nodes with no connected edges. */
  orphanNodes: number
  /** True if setup node is present — required for any runnable Arduino graph. */
  hasSetup: boolean
  /** True if loop node is present. */
  hasLoop: boolean
  /** True if setup connects (directly or transitively) to an action node. */
  setupReachesAction: boolean
  /** True if loop connects (directly or transitively) to an action node. */
  loopReachesAction: boolean
  issues: string[]
  nodes: PlacedGraphNode[]
  edges: PlacedGraphEdge[]
} | null

// ── Electrical Analysis ─────────────────────────────────────────────────

export type ElectricalAnalysis = {
  pinOvercurrent: number
  railOvercurrent: number
  missingExternalSupply: number
  maxPinFanout: number
  pinsOverDirectFanout: number
  directGroundCount: number
  directPowerCount: number
  railDistributionViolations: number
  errors: number
  warnings: number
  issues: string[]
} | null

export type ScoreBreakdown = {
  accuracy: number
  efficiency: number
  quality: number
  completeness: number
}

/**
 * Classifies what domain this run was working in. Different domains get
 * different analyzers — forcing every run through circuit analysis
 * produces meaningless numbers for graph/scene/game runs.
 */
export type RunDomain =
  | "breadboard"       // core agent placed board ops, or circuit specialist
  | "graph"            // graph agent, or core agent placed graph ops
  | "mixed"            // core agent placed both board and graph ops
  | "template"         // deterministic template path (no LLM)
  | "chat_only"        // no ops, just text reply
  | "unknown"          // scene/game/other — not evaluable today

export type RunCategory =
  | "template"         // template short-circuit path
  | "top_level"        // core agent, no parent
  | "delegated"        // any run with a parentRunId
  | "specialist"       // top-level specialist (rare)

/**
 * Routing decision recorded by the router — surfaced here so eval can
 * measure router quality (were escalations warranted?).
 */
export type RoutingRecord = {
  model: string
  toolMode: string
  availableTools?: string[]
  domain: string
  requestType: string
  complexity: string
  reasons: string[]
  signals: {
    boardComponentCount: number
    graphNodeCount: number
    promptLength: number
    recentFailures: number
    componentsMentioned: number
  }
}

export type RunEval = {
  runId: string
  evaluatedAt: string
  runCreatedAt: string
  runCompletedAt?: string
  runDurationMs?: number
  agent: string
  /** Agent architecture version stamped at run creation time (from version.ts). */
  agentVersion: string
  prompt: string
  status: string
  /** Whether this run can be scored at all. */
  evaluable: boolean
  /** Populated when `evaluable === false` — human-readable reason. */
  notEvaluableReason?: string
  /** Domain classification — drives analyzer selection. */
  domain: RunDomain
  /** Category for summary bucketing — template / top_level / delegated. */
  category: RunCategory
  /** Copy of the router's decision, if this run was routed. */
  routing?: RoutingRecord
  path: PathAnalysis
  tokens: TokenAnalysis
  tools: ToolAnalysis
  /** Populated only when the domain is "breadboard" or "mixed". */
  circuit: CircuitAnalysis
  /** Populated only when the domain is "graph" or "mixed". */
  graph: GraphAnalysis
  /** Populated only when board ops exist (breadboard/template/mixed). */
  electrical: ElectricalAnalysis
  intent: {
    intentSatisfied: boolean
    repeatedToolFailureLoops: number
    partialSuccessWithoutIntent: boolean
  }
  /** Null when not evaluable — callers should skip null scores in aggregates. */
  score: {
    total: number
    breakdown: ScoreBreakdown
  } | null
}

/**
 * Per-category aggregate so top-level / template / delegated runs don't
 * inflate or deflate each other's averages.
 */
export type CategoryAggregate = {
  runs: number
  /** Number of runs where `evaluable === true` and we computed a score. */
  scored: number
  /** Averaged only across scored runs. */
  avgScore: number
  avgToolErrorRate: number
  avgTokensPerRun: number
  hallucinationRate: number
  /** Sum of estimated cost across all runs in this bucket. */
  totalCost: number
  byModel: Record<string, {
    runs: number
    avgScore: number
    totalTokens: number
    totalCost: number
  }>
}

export type EvalSummary = {
  generatedAt: string
  totalRuns: number
  /** Runs that could not be scored (unknown domain). */
  notEvaluable: number
  /** Per-category breakdown. */
  categories: {
    template: CategoryAggregate
    topLevel: CategoryAggregate
    delegated: CategoryAggregate
    specialist: CategoryAggregate
  }
  /** Domain split across all runs. */
  byDomain: Record<string, number>
  /** Top issues pooled across all runs. */
  topIssues: Array<{ issue: string; count: number }>
  /** Worst-scoring top-level runs (templates/delegated hidden from this list). */
  worstRuns: Array<{ runId: string; score: number; issue: string; category: RunCategory }>

  // ── Legacy / top-level rollup ──────────────────────────────────────────
  // Kept for backward-compat with the dashboard. These aggregate ONLY
  // top-level runs (excluding templates and delegated children) so the
  // headline number isn't inflated by cheap or duplicated work.
  avgScore: number
  avgToolErrorRate: number
  avgTokensPerRun: number
  hallucinationRate: number
  proposeCircuitAdoption: number
  byModel: Record<string, {
    runs: number
    avgScore: number
    totalTokens: number
    totalCost: number
  }>
}

// ── Run file shape (from agent-run-repo) ────────────────────────────────

export type RunFile = {
  run: {
    id: string
    threadId: string
    projectId: string
    sceneId: string
    sessionId: string
    agent: string
    status: string
    parentRunId?: string
    createdAt: string
    updatedAt?: string
    completedAt?: string
  }
  prompt: string
  messages: Array<{
    role: string
    content: unknown
  }>
  proposedOps: Array<{ kind: string; payload: Record<string, unknown>; [k: string]: unknown }>
  appliedOps: Array<{ kind: string; payload: Record<string, unknown>; [k: string]: unknown }>
  assistantText: string
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    model: string
    children?: Array<{
      agent: string
      runId: string
      inputTokens: number
      outputTokens: number
      totalTokens: number
      model: string
      error?: string
    }>
    overhead?: Array<{
      kind: "summarizer_live" | "summarizer_background"
      inputTokens: number
      outputTokens: number
      totalTokens: number
      model: string
    }>
    workflow?: {
      attribution: "step_usage_allocation"
      byTool: Array<{
        tool: string
        calls: number
        inputTokens: number
        outputTokens: number
        totalTokens: number
        cacheReadTokens?: number
        cacheWriteTokens?: number
      }>
      unattributedTokens: number
    }
  }
  routing?: RoutingRecord
  error?: string
}
