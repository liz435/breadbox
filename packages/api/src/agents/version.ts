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
export const AGENT_VERSION = "1.0.1";

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
export const SUPPORTED_AGENT_SNAPSHOTS = ["1.0.0"] as const;

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
