// ── Agent state machines (v2.0.0) ───────────────────────────────────────
//
// Pure module. Each sub-agent has a state machine that maps
// (currentState, lastToolResult) → next allowed tool set. The result is
// passed to streamText's prepareStep callback as `activeTools`, narrowing
// the visible tool surface per step.
//
// Why state machines: the old single-agent loop let the model pick any of
// 7-21 tools at every step. Eval traces showed this drove three problems —
// repeated tool calls, chaotic step ordering, and propose_fix being called
// in contexts where another tool was clearly correct. The state machine
// makes the workflow explicit and forces the right tool at the right step.
//
// Why pure functions: testable without mocking the AI SDK. The integration
// test surface (does streamText respect activeTools?) is the SDK's job;
// our job is to map state correctly.

// ── Tool result shape we care about ─────────────────────────────────────
//
// Only a few fields drive transitions: success/ok flag, failureKind (for
// budget exhaustion), and verify_circuit's specific issue kinds.

export type ToolOutcome = {
  toolName: string
  success: boolean
  failureKind?: string
  /** verify_circuit-only: pin-consistency issue kinds. */
  verifyIssues?: Array<{ kind: "unwired_pin_referenced" | "wired_pin_unused" }>
}

// ── Build state machine ─────────────────────────────────────────────────

export type BuildState =
  | "start"
  | "after_propose_circuit_ok"
  | "after_verify_ok"
  | "after_verify_unwired"
  | "after_propose_circuit_fail"
  | "after_propose_fix_ok"
  | "after_propose_fix_fail"
  | "terminated"

/** Allowed tools per state. `[]` means "no tools — model must produce text and stop". */
const BUILD_TRANSITIONS: Record<BuildState, readonly string[]> = {
  start: ["propose_circuit"],
  after_propose_circuit_ok: ["verify_circuit"],
  after_verify_ok: [],
  after_verify_unwired: ["propose_fix", "update_sketch"],
  after_propose_circuit_fail: ["propose_circuit", "update_sketch"],
  after_propose_fix_ok: ["verify_circuit"],
  after_propose_fix_fail: ["propose_fix", "list_components", "list_wires"],
  terminated: [],
}

export function nextBuildState(state: BuildState, outcome: ToolOutcome | null): BuildState {
  if (state === "terminated") return "terminated"
  if (outcome === null) return state

  // Budget exhaustion → terminate regardless of which tool reported it.
  if (outcome.failureKind === "attempt_limit") return "terminated"

  switch (outcome.toolName) {
    case "propose_circuit":
      return outcome.success ? "after_propose_circuit_ok" : "after_propose_circuit_fail"
    case "verify_circuit": {
      if (outcome.success) return "after_verify_ok"
      const hasUnwired = outcome.verifyIssues?.some((i) => i.kind === "unwired_pin_referenced")
      return hasUnwired ? "after_verify_unwired" : "terminated"
    }
    case "propose_fix":
      return outcome.success ? "after_propose_fix_ok" : "after_propose_fix_fail"
    case "update_sketch":
      // update_sketch is a sub-step within recovery; the success path
      // returns to whatever recovery state we were in (re-allow propose_fix).
      return outcome.success ? "after_verify_unwired" : state
    case "list_components":
    case "list_wires":
      // Reads don't change state; the agent gets info and continues.
      return state
    default:
      // Unknown tool / unexpected path → terminate (default-deny).
      return "terminated"
  }
}

export function buildActiveTools(state: BuildState): readonly string[] {
  return BUILD_TRANSITIONS[state]
}

// ── Fix state machine ───────────────────────────────────────────────────

export type FixState =
  | "start"
  | "after_propose_fix_ok"
  | "after_verify_ok"
  | "after_verify_unwired"
  | "after_propose_fix_fail"
  | "after_apply_design_ok"
  | "terminated"

const FIX_TRANSITIONS: Record<FixState, readonly string[]> = {
  start: [
    "propose_fix",
    "list_components",
    "list_wires",
    "get_component_details",
    "get_board_overview",
    "get_sketch_code",
    "get_board_state",
    "get_wiring_guide",
    "analyze_power_budget",
    "validate_design",
    "apply_design",
    "patch_sketch",
    "update_sketch",
  ],
  after_propose_fix_ok: ["verify_circuit"],
  after_verify_ok: [],
  after_verify_unwired: ["propose_fix", "update_sketch"],
  after_propose_fix_fail: [
    "propose_fix",
    "list_components",
    "list_wires",
    "get_component_details",
    "get_sketch_code",
  ],
  after_apply_design_ok: ["verify_circuit"],
  terminated: [],
}

export function nextFixState(state: FixState, outcome: ToolOutcome | null): FixState {
  if (state === "terminated") return "terminated"
  if (outcome === null) return state
  if (outcome.failureKind === "attempt_limit") return "terminated"

  switch (outcome.toolName) {
    case "propose_fix":
      return outcome.success ? "after_propose_fix_ok" : "after_propose_fix_fail"
    case "verify_circuit": {
      if (outcome.success) return "after_verify_ok"
      const hasUnwired = outcome.verifyIssues?.some((i) => i.kind === "unwired_pin_referenced")
      return hasUnwired ? "after_verify_unwired" : "terminated"
    }
    case "apply_design":
      return outcome.success ? "after_apply_design_ok" : state
    case "update_sketch":
      return outcome.success ? "after_verify_unwired" : state
    case "list_components":
    case "list_wires":
    case "get_component_details":
    case "get_board_overview":
    case "get_sketch_code":
    case "get_board_state":
    case "get_wiring_guide":
    case "analyze_power_budget":
    case "validate_design":
    case "patch_sketch":
      // Reads + auxiliary writes don't drive state. Stay where we are.
      return state
    default:
      // Unknown tool — default-deny terminate.
      return "terminated"
  }
}

export function fixActiveTools(state: FixState): readonly string[] {
  return FIX_TRANSITIONS[state]
}

// ── Generic agent-state-machine interface ───────────────────────────────
//
// The streamCoreAgentInternal entry point takes any state machine that
// satisfies this shape. Build and Fix above are the two concrete impls.

export type AgentStateMachine<S extends string> = {
  initialState: S
  next(state: S, outcome: ToolOutcome | null): S
  activeTools(state: S): readonly string[]
}

export const BUILD_STATE_MACHINE: AgentStateMachine<BuildState> = {
  initialState: "start",
  next: nextBuildState,
  activeTools: buildActiveTools,
}

export const FIX_STATE_MACHINE: AgentStateMachine<FixState> = {
  initialState: "start",
  next: nextFixState,
  activeTools: fixActiveTools,
}
