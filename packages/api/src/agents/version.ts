/**
 * Agent architecture version.
 *
 * Bump this whenever a change would alter the decision-flow diagram —
 * i.e. any change to routing logic, tool availability, step limits,
 * delegation rules, stop conditions, or model-selection thresholds.
 *
 * Every run record stores this value so the debug visualizer can
 * flag runs that were produced by a different agent layout.
 *
 * Patch bumps (x.y.Z): parameter tweaks that don't change the shape
 *   of the diagram (e.g. adjusting a token threshold, changing a prompt).
 * Minor bumps (x.Y.0): new branches or tools added to existing paths.
 * Major bumps (X.0.0): structural rewrites — new agents, removed paths,
 *   fundamentally different routing logic.
 */
export const AGENT_VERSION = "1.1.1";

/**
 * Snapshot version controls which frozen agent behavior profile is used at
 * runtime (prompts/config). Defaults to the current agent version, but can be
 * overridden per-request or via AGENT_SNAPSHOT_VERSION.
 */
export const DEFAULT_AGENT_SNAPSHOT_VERSION =
  process.env.AGENT_SNAPSHOT_VERSION ?? AGENT_VERSION;

/**
 * Explicitly listed snapshots that can be selected safely. Add a new entry
 * whenever introducing a new behavior profile.
 */
export const SUPPORTED_AGENT_SNAPSHOTS = ["1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5", "1.0.6", "1.0.7", "1.0.8", "1.1.0", "1.1.1"] as const;

export type AgentSnapshotVersion = (typeof SUPPORTED_AGENT_SNAPSHOTS)[number];

export function resolveAgentSnapshotVersion(
  requested?: string,
): AgentSnapshotVersion {
  if (
    requested &&
    (SUPPORTED_AGENT_SNAPSHOTS as readonly string[]).includes(requested)
  ) {
    return requested as AgentSnapshotVersion;
  }
  if (
    (SUPPORTED_AGENT_SNAPSHOTS as readonly string[]).includes(
      DEFAULT_AGENT_SNAPSHOT_VERSION,
    )
  ) {
    return DEFAULT_AGENT_SNAPSHOT_VERSION as AgentSnapshotVersion;
  }
  return AGENT_VERSION as AgentSnapshotVersion;
}

/**
 * Changelog — newest entry first.
 *
 * Each entry documents what changed and why, so the diagram maintainer
 * knows what to update when the version is bumped.
 */
export const AGENT_CHANGELOG: Array<{
  version: string;
  date: string;
  changes: string[];
}> = [
  {
    version: "1.1.1",
    date: "2026-04-15",
    changes: [
      "Added propose_fix tool — atomic batch editor for edit mode (add/remove/move components, add/remove wires, update sketch in one call).",
      "Auto-positioning, wire resolution, series routing, LED+resistor pairing, fanout distribution — same engine as propose_circuit.",
      "Max 3 attempts per run with full rollback on validation, electrical, or sketch failures.",
      "Edit-mode prompt updated to prefer propose_fix for multi-step changes, granular tools as fallback.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-04-15",
    changes: [
      "Removed circuit and graph specialist agents — all work now handled by the core agent directly.",
      "Removed delegation tools (delegate_to_circuit_agent, delegate_to_graph_agent) and CIRCUIT_MODE.",
      "Tool modes simplified to build / edit / all (was build / edit / circuit / all).",
      "Agent kind reduced to 'core' only.",
    ],
  },
  {
    version: "1.0.8",
    date: "2026-04-15",
    changes: [
      "Added button wiring convention to COMMON_PROMPT: buttons are always wired pin-A→signal, pin-B→GND; sketch MUST use INPUT_PULLUP with active-LOW detection (lastButtonState=HIGH).",
      "Updated build-mode example sketch to show INPUT_PULLUP + active-LOW pattern explicitly.",
      "Wire color now required on every wire: all prompt examples include explicit color fields (red=#ef4444 power, black=#1e293b GND, distinct colors per signal).",
      "Fixed component overlap: seven_segment and lcd_16x2 now placed on right strip (col 5) so series resistors (cols 3/6) don't visually overlap the display body.",
    ],
  },
  {
    version: "1.0.7",
    date: "2026-04-14",
    changes: [
      "Added wire color convention to system prompt and wiring guide: red=#ef4444 for power, black=#1e293b for GND, distinct colors for each signal line.",
      "Added response style rule: agent must not quote full sketch code in chat replies — describe behavior in plain language instead.",
    ],
  },
  {
    version: "1.0.6",
    date: "2026-04-14",
    changes: [
      "Compaction: get_board_overview now drops to a stub in older steps (board summary is already in system prompt), eliminating redundant re-sends.",
      "Compaction: KEEP_RECENT window narrows from 4 to 2 messages after step 4, cutting per-step accumulation for longer runs.",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-04-14",
    changes: [
      "Fixed layout_overflow false rejection: series intermediates (throughComponent) now excluded from row estimate since they share their target's row.",
      "Added board row budget guidance to system prompt so agent can pre-check fit before calling propose_circuit.",
      "Fixed frontend button pin B coordinate (was row y+1, now row y) in power-budget analyzer — eliminated false BUTTON_REFERENCE_MISSING errors.",
      "Fixed bus-short false positive: wires landing on power/ground rails (col<0 or col>9) no longer classified as main-strip shorts.",
      "Token breakdown: unattributed steps now tracked as named rows ([prompt/system], [reasoning], [final_response]) instead of a single opaque bucket.",
      "Dashboard trace: per-step and cumulative token cost shown next to each trace event.",
    ],
  },
  {
    version: "1.0.4",
    date: "2026-04-14",
    changes: [
      "propose_circuit now requires pinRoles for every component pin (no optional fallback).",
      "Added strict pin-role validation (coverage + role-to-wire compatibility for signal/power/ground references).",
      "Updated build-mode prompt examples to include required pinRoles payloads.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-04-14",
    changes: [
      "Increased propose_circuit layout separation using larger row gaps to reduce accidental shared-net collisions.",
      "Updated component footprint height assumptions for seven-segment and LCD placement to avoid overly dense packing.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-04-14",
    changes: [
      "propose_circuit now runs a final electrical validation gate and fails fast on power-budget errors instead of returning a successful build.",
      "Series-intermediate placement now avoids reusing breadboard bus rows that collide with existing unrelated component pins (prevents button/segment net collisions).",
      "Eval resistor lead check aligned with Dreamer resistor footprint (3/6 columns) to reduce false-positive unconnected resistor issues.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-04-14",
    changes: [
      "Added snapshot-version pinning support for runs (agentSnapshotVersion) so behavior profiles can be selected per request and reproduced later.",
      "Core agent now reads prompt/config snapshots by version, with safe fallback to current defaults.",
      "Delegated child runs inherit parent snapshot version for consistent behavior within a turn.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-04-14",
    changes: [
      "Initial versioned baseline.",
      "Core agent: max 10 steps (stepCountIs(10)), Sonnet for complex/debug, Haiku for simple.",
      "Circuit specialist: max 8 steps, 30s timeout, no recursion.",
      "Graph specialist: max 8 steps, 30s timeout, Haiku.",
      "Tool modes: build (empty board), edit (populated), all (rebuild).",
      "Delegation: max 1 circuit + 1 graph per turn, 2 retries with backoff.",
      "Sketch recovery: max 2 consecutive failures before hard abort.",
      "Post-stream: policy engine → power budget + routing checks; reflection with confidence threshold 0.5.",
      "Message compaction starts after step 2, keeps last 4 messages.",
    ],
  },
];
