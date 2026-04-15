import type { ModelMessage } from "ai";
import type { ProjectFile } from "../db/schemas";
import type { BoardOp } from "@dreamer/schemas";
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
   */
  priorRuns?: import("../db/schemas").AgentRunFile[];
};

export type OverheadUsage = {
  kind: "summarizer_live" | "summarizer_background";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

export type WorkflowToolTokenUsage = {
  tool: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type WorkflowTokenUsage = {
  /** Derived from per-step usage reported by the model stream. */
  attribution: "step_usage_allocation";
  byTool: WorkflowToolTokenUsage[];
  /** Parent-step tokens that occurred without a tool call. */
  unattributedTokens: number;
};

export type TokenUsage = {
  /** Input tokens. */
  inputTokens: number;
  /** Output tokens. */
  outputTokens: number;
  /** End-to-end total: agent + overhead. */
  totalTokens: number;
  model: string;
  /** Prompt caching breakdown — how many input tokens were cache hits vs writes. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Overhead calls (summarizer, etc.) attributed to this run. */
  overhead?: OverheadUsage[];
  /** Token attribution across the workflow, by tool. */
  workflow?: WorkflowTokenUsage;
};

export type AgentResult = {
  assistantText: string;
  proposedOps: BoardOp[];
  /** Full model messages from the agent conversation, for persistence/replay. */
  messages: ModelMessage[];
  tokenUsage: TokenUsage;
};
