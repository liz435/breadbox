// ── BuildAgent (v2.0.0) ─────────────────────────────────────────────────
//
// Specialized sub-agent for empty-board builds. State-machine-gated:
// step 1 forces propose_circuit, step 2 forces verify_circuit, and the
// agent terminates after a successful verify. See agent-states.ts.

import type { CoreAgentStream } from "./agent";
import { streamCoreAgentInternal, type SpecializedConfig } from "./agent";
import type { AgentContext } from "../types";
import { BUILD_STATE_MACHINE, type AgentStateMachine } from "./agent-states";
import { CORE_PROMPT_SNAPSHOTS, DEFAULT_CORE_PROMPT_SNAPSHOT } from "./prompts";
import { AGENT_VERSION } from "../version";

/** Tools BuildAgent exposes. Subset of createCoreTools output. */
const BUILD_AGENT_TOOLS: ReadonlyArray<string> = [
  "propose_circuit",
  "propose_fix",
  "verify_circuit",
  "update_sketch",
  "list_components",
  "list_wires",
  "analyze_power_budget",
];

function buildConfig(ctx: AgentContext): SpecializedConfig {
  const snap = ctx.snapshotVersion ?? AGENT_VERSION;
  const snapshotPrompts =
    CORE_PROMPT_SNAPSHOTS[snap] ?? DEFAULT_CORE_PROMPT_SNAPSHOT;
  return {
    name: "build",
    systemPrompt: snapshotPrompts.buildPrompt,
    toolNames: new Set(BUILD_AGENT_TOOLS),
    stateMachine: BUILD_STATE_MACHINE as AgentStateMachine<string>,
  };
}

export function streamBuildAgent(ctx: AgentContext): CoreAgentStream {
  return streamCoreAgentInternal(ctx, buildConfig(ctx));
}
