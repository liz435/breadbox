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
  totalTokens: number
  estimatedCost: number
  wastedTokens: number
  wasteDetails: string[]
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
  hallucatedIds: number
  wrongPinNames: number
  invalidPositions: number
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

export type ScoreBreakdown = {
  accuracy: number
  efficiency: number
  quality: number
  completeness: number
}

export type RunEval = {
  runId: string
  evaluatedAt: string
  agent: string
  prompt: string
  status: string
  path: PathAnalysis
  tokens: TokenAnalysis
  tools: ToolAnalysis
  circuit: CircuitAnalysis
  score: {
    total: number
    breakdown: ScoreBreakdown
  }
}

export type EvalSummary = {
  generatedAt: string
  totalRuns: number
  byModel: Record<string, {
    runs: number
    avgScore: number
    totalTokens: number
    totalCost: number
  }>
  avgScore: number
  avgToolErrorRate: number
  avgTokensPerRun: number
  hallucationRate: number
  proposeCircuitAdoption: number
  topIssues: Array<{ issue: string; count: number }>
  worstRuns: Array<{ runId: string; score: number; issue: string }>
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
    updatedAt: string
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
  }
  error?: string
}
