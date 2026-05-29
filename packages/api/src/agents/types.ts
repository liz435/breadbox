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
  /**
   * Called once per step when the in-loop sanitizer drops malformed
   * tool-call blocks before sending the conversation back to Anthropic.
   * Delta semantics — each call carries only that step's contribution.
   * The route layer aggregates and emits a single SSE event at end of
   * stream. See packages/api/src/agents/sanitize-messages.ts.
   */
  onHistorySanitized?: (
    report: import("./sanitize-messages").SanitizationReport,
  ) => void;
  /**
   * Snapshot of the Serial Monitor buffer at request time, sent by the
   * client when the user invokes the agent. The board snapshot persisted
   * on disk is stale (only updates on project save), so the live tail is
   * piped in via the request body. Consumed by `read_serial_monitor` —
   * agent.ts splices it onto workingBoard.serialOutput before tool
   * creation. Bounded (max 1000 entries) to keep request size sane.
   */
  recentSerial?: Array<{
    text: string;
    ts: number;
  }>;
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
