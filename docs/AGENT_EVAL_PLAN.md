# Agent Eval System — Implementation Plan

## Architecture

```
packages/api/
  data/
    runs/           ← existing: raw agent run data
    tests/           ← NEW: per-run eval results
      {runId}.json   ← eval for each run
      summary.json   ← aggregate stats across all runs
  src/
    eval/
      analyzers/
        path-analyzer.ts       ← step count, retries, hallucinations, decision tree
        token-analyzer.ts      ← cost, waste, model breakdown
        tool-analyzer.ts       ← error rate, accuracy, hallucinated IDs
        circuit-analyzer.ts    ← SPICE validation, bus shorts, floating nodes
      run-evaluator.ts         ← orchestrator: runs all analyzers on a single run
      batch-evaluator.ts       ← runs evaluator on all runs, builds summary
      types.ts                 ← eval result types
    routes/
      eval.ts                  ← NEW: GET /api/eval/dashboard (HTML), GET /api/eval/run/:id (JSON)
```

## Data Model

### Per-run eval: `data/tests/{runId}.json`

```ts
type RunEval = {
  runId: string
  evaluatedAt: string  // ISO timestamp
  agent: string        // "core" | "circuit" | "graph"
  prompt: string

  // Path analysis — full execution trace
  path: {
    stepCount: number
    stepLimit: number
    retryCount: number
    hallucinations: string[]
    usedProposeCircuit: boolean
    delegations: string[]

    // Full ordered trace of every step the agent took
    trace: Array<{
      step: number
      type: "thinking" | "tool_call" | "tool_result" | "text"
      // For tool_call:
      toolName?: string
      toolInput?: Record<string, unknown>
      // For tool_result:
      toolResult?: unknown
      succeeded?: boolean
      error?: string
      // For text:
      text?: string
      // Timing
      timestamp?: string
    }>
  }

  // Token analysis
  tokens: {
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCost: number        // USD
    wastedTokens: number         // tokens on unnecessary get_board_state, retries
    wasteDetails: string[]
  }

  // Tool accuracy
  tools: {
    totalCalls: number
    errors: number
    errorRate: number            // 0-1
    hallucatedIds: number        // used non-existent component/wire IDs
    wrongPinNames: number
    invalidPositions: number
    details: Array<{
      tool: string
      input: Record<string, unknown>
      result: "success" | "error" | "hallucination"
      issue?: string
    }>
  }

  // Circuit quality (only for runs that placed components)
  circuit: {
    componentsPlaced: number
    wiresCreated: number
    floatingComponents: number   // not connected to any net
    busShorts: number            // multiple signals on same row/strip
    missingResistors: number     // LEDs without series resistor in path
    sketchPinMatch: boolean      // sketch pin numbers match wired pins
    issues: string[]
  } | null

  // Overall score
  score: {
    total: number                // 0-100
    breakdown: {
      accuracy: number           // tool call success rate (0-25)
      efficiency: number         // token waste (0-25)
      quality: number            // circuit correctness (0-25)
      completeness: number       // did the agent finish the task? (0-25)
    }
  }
}
```

### Summary: `data/tests/summary.json`

```ts
type EvalSummary = {
  generatedAt: string
  totalRuns: number
  byModel: Record<string, { runs: number; avgScore: number; totalTokens: number; totalCost: number }>
  avgScore: number
  avgToolErrorRate: number
  avgTokensPerRun: number
  hallucationRate: number       // % of runs with at least one hallucination
  proposeCircuitAdoption: number // % of circuit-building runs using propose_circuit
  topIssues: Array<{ issue: string; count: number }>
  worstRuns: Array<{ runId: string; score: number; issue: string }>
}
```

## Implementation Checklist

### Phase 1 — Core Analyzers + Per-Run Eval

- [ ] **1.1** Create `packages/api/src/eval/types.ts` — RunEval and EvalSummary types
- [ ] **1.2** Create `packages/api/src/eval/analyzers/path-analyzer.ts`
  - Parse messages array, extract tool calls in order
  - Detect retries (same tool called twice, first returned error)
  - Detect hallucinations (agent references IDs not in working state)
  - Count steps, check against step limit
  - Flag whether propose_circuit was used
- [ ] **1.3** Create `packages/api/src/eval/analyzers/token-analyzer.ts`
  - Read tokenUsage from run data
  - Calculate cost (Haiku: $0.80/$4 per 1M in/out, Sonnet: $3/$15)
  - Detect waste: get_board_state called when board state was in system prompt
  - Detect waste: retried tool calls (same work done twice)
- [ ] **1.4** Create `packages/api/src/eval/analyzers/tool-analyzer.ts`
  - Parse all tool-call / tool-result pairs from messages
  - Count errors (result contains `error` field)
  - Detect hallucinated component IDs (ID not in board state at time of call)
  - Detect wrong pin names (compare against registry defaultPins)
  - Detect invalid positions (x > 9 or y > 29)
- [ ] **1.5** Create `packages/api/src/eval/analyzers/circuit-analyzer.ts`
  - Replay proposed ops to build final board state
  - Run resolveNets on the result — check for floating components
  - Check for bus shorts (signal + power/GND on same row strip)
  - Check LED circuits have resistors in the path
  - Compare sketch pin numbers to wired pins
- [ ] **1.6** Create `packages/api/src/eval/run-evaluator.ts`
  - Load run file, run all 4 analyzers, compute score, write to `data/tests/{runId}.json`
- [ ] **1.7** Create `packages/api/src/eval/batch-evaluator.ts`
  - Read all run files from `data/runs/`
  - Run evaluator on each (skip if test file already exists and run hasn't changed)
  - Aggregate into `data/tests/summary.json`

### Phase 2 — HTML Dashboard Route

- [ ] **2.1** Create `packages/api/src/routes/eval.ts` — Elysia route group
  - `GET /api/eval/dashboard` → serves HTML dashboard
  - `GET /api/eval/summary` → returns summary.json
  - `GET /api/eval/run/:id` → returns per-run eval JSON
  - `POST /api/eval/refresh` → re-runs batch evaluator
- [ ] **2.2** Create `packages/api/src/eval/dashboard.ts` — HTML generator
  - Single-file HTML with inline CSS + JS (no build step)
  - Sections: overview scores, token cost chart, tool error table, worst runs list
  - Per-run detail: full execution trace timeline
    - Each step rendered as a node: thinking → tool_call → tool_result → text
    - Color coded: green=success, red=error, orange=hallucination, gray=text
    - Tool inputs shown as collapsible JSON
    - Tool results shown inline with truncation
    - Arrows between steps showing the flow
    - Retries highlighted with "RETRY" badge
    - Child delegations shown as nested sub-traces
  - Fetches data from `/api/eval/summary` and `/api/eval/run/:id` via fetch()
- [ ] **2.3** Wire into `packages/api/src/index.ts`
  - `app.use(evalRoutes)`

### Phase 3 — Auto-Eval on Every Run

- [ ] **3.1** Hook into `agentRunRepo.completeRun()` — after a run completes, automatically evaluate it and write to `data/tests/`
- [ ] **3.2** Add eval trigger in chat.ts — after agent stream finishes, fire-and-forget eval
- [ ] **3.3** Dashboard auto-refreshes via polling (or SSE for live updates)

## File Count

| Phase | New Files | Lines (est.) |
|-------|----------|-------------|
| 1 | 7 files | ~600 lines |
| 2 | 2 files | ~400 lines (mostly HTML template) |
| 3 | 0 files (hooks into existing) | ~30 lines |
| **Total** | **9 files** | **~1,030 lines** |

## Dashboard URL

```
http://localhost:4111/api/eval/dashboard
```

Opens in any browser. No frontend build. Served directly by Elysia as HTML.
