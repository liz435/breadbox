import type { ModelMessage } from "ai";
import type { ProjectFile, AgentKind } from "../db/schemas";
import type { BoardOp, BoardState } from "@dreamer/schemas";
import type { Logger } from "../logger";

export type AgentContext = {
  prompt: string;
  project: ProjectFile;
  sceneId: string;
  runId: string;
  threadId: string;
  projectId: string;
  sessionId: string;
  /** Frozen behavior profile version (prompt/config snapshot) for this run. */
  snapshotVersion?: string;
  parentLog: Logger;
  /** Pre-built conversation history for the agent (core agent only). */
  history?: ModelMessage[];
  /**
   * Recent completed runs on this thread — used by the router to detect
   * retry-after-failure situations and escalate the model accordingly.
   * Core agent only. Specialists don't need this.
   */
  priorRuns?: import("../db/schemas").AgentRunFile[];
  /**
   * Shared working board from the parent agent. When present, the specialist
   * uses it directly so both parent and child mutate the same tentative state
   * and all edits land on the same `ops` array. When absent, the specialist
   * creates its own isolated working copy.
   */
  sharedWorkingBoard?: BoardState;
  /**
   * Shared ops sink from the parent agent. When present, the specialist
   * appends directly to it; otherwise it uses a local array.
   */
  sharedOps?: BoardOp[];
};

export type ChildTokenUsage = {
  agent: AgentKind;
  runId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  error?: string;
};

export type OverheadUsage = {
  kind: "summarizer_live" | "summarizer_background";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

export type TokenUsage = {
  /** Parent-only input tokens. */
  inputTokens: number;
  /** Parent-only output tokens. */
  outputTokens: number;
  /** End-to-end total: parent + rolled-up child runs + overhead. */
  totalTokens: number;
  model: string;
  /** Prompt caching breakdown — how many input tokens were cache hits vs writes. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Breakdown of child-run costs when specialists were delegated. */
  children?: ChildTokenUsage[];
  /** Overhead calls (summarizer, etc.) attributed to this run. */
  overhead?: OverheadUsage[];
};

export type AgentResult = {
  assistantText: string;
  proposedOps: BoardOp[];
  /** Full model messages from the agent conversation, for persistence/replay. */
  messages: ModelMessage[];
  tokenUsage: TokenUsage;
};

/**
 * Signature shared by all agent runner functions.
 * Core, circuit, and graph agents all conform to this interface.
 */
export type AgentRunner = (ctx: AgentContext) => Promise<AgentResult>;

/**
 * Context passed to delegation tools so they can spawn child agent runs.
 *
 * `childUsage` is a shared sink that every delegation tool pushes into when
 * its child completes (or errors). The parent agent's `collectResult` rolls
 * this up into the final `tokenUsage.children` and recomputes `totalTokens`.
 *
 * `getWorkingProject` returns a snapshot of the project with the parent's
 * tentative in-turn ops applied. Specialists read from this instead of the
 * stale original `ProjectFile` so they see mutations the parent has already
 * proposed during the current turn.
 */
export type DelegationContext = {
  project: ProjectFile;
  sceneId: string;
  threadId: string;
  projectId: string;
  sessionId: string;
  /** Snapshot profile inherited from the parent run. */
  snapshotVersion?: string;
  parentRunId: string;
  parentLog: Logger;
  childUsage: ChildTokenUsage[];
  getWorkingProject: () => ProjectFile;
};
