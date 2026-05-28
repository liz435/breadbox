// ── FixAgent (v2.0.0) ───────────────────────────────────────────────────
//
// Specialized sub-agent for populated-board edits. State-machine-gated:
// initial step exposes the full read + write surface; after a successful
// propose_fix or apply_design the only allowed next tool is verify_circuit.
// See agent-states.ts.

import type { CoreAgentStream } from "./agent";
import { streamCoreAgentInternal, type SpecializedConfig } from "./agent";
import type { AgentContext } from "../types";
import { FIX_STATE_MACHINE, type AgentStateMachine } from "./agent-states";
import { CORE_PROMPT_SNAPSHOTS, DEFAULT_CORE_PROMPT_SNAPSHOT } from "./prompts";
import { AGENT_VERSION } from "../version";

/** Tools FixAgent exposes. Same surface as v1.5.2 EDIT_MODE_TOOLS. */
const FIX_AGENT_TOOLS: ReadonlyArray<string> = [
  // Write paths
  "propose_fix",
  "verify_circuit",
  "apply_design",
  "validate_design",
  "update_sketch",
  "patch_sketch",
  // Reads
  "list_components",
  "list_wires",
  "get_component_details",
  "get_board_overview",
  "get_sketch_code",
  "get_board_state",
  "get_wiring_guide",
  "analyze_power_budget",
  // Granular CRUDs — kept for v2.0.0; trim later with data
  "place_component",
  "update_component",
  "move_component",
  "remove_component",
  "connect_wire",
  "wire_component_to_pin",
  "remove_wire",
  "update_wire",
];

function fixConfig(ctx: AgentContext): SpecializedConfig {
  const snap = ctx.snapshotVersion ?? AGENT_VERSION;
  const snapshotPrompts =
    CORE_PROMPT_SNAPSHOTS[snap] ?? DEFAULT_CORE_PROMPT_SNAPSHOT;
  return {
    name: "fix",
    systemPrompt: snapshotPrompts.editPrompt,
    toolNames: new Set(FIX_AGENT_TOOLS),
    stateMachine: FIX_STATE_MACHINE as AgentStateMachine<string>,
  };
}

export function streamFixAgent(ctx: AgentContext): CoreAgentStream {
  return streamCoreAgentInternal(ctx, fixConfig(ctx));
}
