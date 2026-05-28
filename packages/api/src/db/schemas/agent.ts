import { z } from "zod";
import { nonEmptyStringSchema, timestampSchema } from "./project";
import { boardOpSchema } from "@dreamer/schemas";

// ── Agent Kind z──────────────────────────────────────────────────────────────

export const agentKindSchema = z.enum(["core"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

// ── Project Thread ──────────────────────────────────────────────────────────

export const projectThreadSchema = z.object({
  id: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ProjectThread = z.infer<typeof projectThreadSchema>;

export const cachedSummarySchema = z.object({
  /** The summarized text covering older runs. */
  text: z.string(),
  /** Number of completed core runs this summary covers. */
  runCount: z.number().int().nonnegative(),
});

export type CachedSummary = z.infer<typeof cachedSummarySchema>;

export const projectThreadFileSchema = z.object({
  thread: projectThreadSchema,
  runIds: z.array(nonEmptyStringSchema),
  cachedSummary: cachedSummarySchema.optional(),
});

export type ProjectThreadFile = z.infer<typeof projectThreadFileSchema>;

// ── Agent Run ───────────────────────────────────────────────────────────────

export const agentRunRecordSchema = z.object({
  id: nonEmptyStringSchema,
  threadId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  sceneId: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema,
  agent: agentKindSchema,
  parentRunId: nonEmptyStringSchema.optional(),
  status: z.enum(["running", "completed", "failed"]),
  createdAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  error: z.string().optional(),
  /**
   * Agent architecture version at the time the run was created.
   * Used by the debug visualizer to detect when a run was produced
   * by a different version of the agent flow diagram.
   * Optional so existing run files without this field remain valid.
   */
  agentVersion: z.string().optional(),
  /**
   * Frozen snapshot profile used by the run (prompt/config bundle).
   * Optional for backward compatibility with older run files.
   */
  agentSnapshotVersion: z.string().optional(),
  /**
   * v2.0.0+: which specialized sub-agent the dispatcher picked.
   * Absent on 1.x runs (single-agent codepath).
   */
  subAgent: z.enum(["build", "fix"]).optional(),
});

export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

/**
 * Breakdown of a single delegated child-run's token cost. The parent rolls
 * these up so evals and dashboards see the full end-to-end spend.
 */
export const childTokenUsageSchema = z.object({
  agent: agentKindSchema,
  runId: nonEmptyStringSchema,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  model: z.string(),
  error: z.string().optional(),
});

export type ChildTokenUsageRecord = z.infer<typeof childTokenUsageSchema>;

/**
 * Overhead costs outside the main stream and delegated specialists —
 * e.g. history summarization calls. Attributed to the run that triggered
 * them so evals see the true per-turn cost.
 */
export const overheadUsageSchema = z.object({
  kind: z.enum(["summarizer_live", "summarizer_background"]),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  model: z.string(),
});

export type OverheadUsageRecord = z.infer<typeof overheadUsageSchema>;

export const workflowToolTokenUsageSchema = z.object({
  tool: z.string(),
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});

export const workflowTokenUsageSchema = z.object({
  attribution: z.literal("step_usage_allocation"),
  byTool: z.array(workflowToolTokenUsageSchema),
  unattributedTokens: z.number().int().nonnegative(),
});

export const tokenUsageSchema = z.object({
  /** Parent-only input tokens (the top-level stream). */
  inputTokens: z.number().int().nonnegative(),
  /** Parent-only output tokens. */
  outputTokens: z.number().int().nonnegative(),
  /**
   * End-to-end total — parent tokens + every delegated child-run's total +
   * all overhead calls attributed to this run. This is what
   * eval/token-analyzer should score.
   */
  totalTokens: z.number().int().nonnegative(),
  model: z.string(),
  /** Individual child-run breakdowns, if this run spawned any specialists. */
  children: z.array(childTokenUsageSchema).optional(),
  /** Overhead calls (summarizer, etc.) attributed to this run. */
  overhead: z.array(overheadUsageSchema).optional(),
  /** Token attribution across the parent workflow, by tool. */
  workflow: workflowTokenUsageSchema.optional(),
});

export type TokenUsageRecord = z.infer<typeof tokenUsageSchema>;

/**
 * Routing decision recorded on each run so post-hoc eval can measure router
 * quality (were escalations warranted? were cheap runs stable?).
 */
export const routingDecisionSchema = z.object({
  model: z.string(),
  toolMode: z.enum(["build", "edit", "circuit", "all"]),
  /** Concrete tool inventory exposed to the run (post tool-mode filtering). */
  availableTools: z.array(z.string()).optional(),
  domain: z.enum(["breadboard", "graph", "mixed", "ambiguous"]),
  requestType: z.enum(["additive", "surgical", "rebuild", "debug", "question"]),
  complexity: z.enum(["simple", "complex"]),
  reasons: z.array(z.string()),
  signals: z.object({
    boardComponentCount: z.number(),
    graphNodeCount: z.number(),
    promptLength: z.number(),
    recentFailures: z.number(),
    componentsMentioned: z.number(),
  }),
});

export type RoutingDecisionRecord = z.infer<typeof routingDecisionSchema>;

export const agentRunFileSchema = z.object({
  run: agentRunRecordSchema,
  prompt: z.string(),
  assistantText: z.string().optional(),
  messages: z.array(z.unknown()),
  proposedOps: z.array(z.union([boardOpSchema, z.record(z.string(), z.unknown())])),
  appliedOps: z.array(z.union([boardOpSchema, z.record(z.string(), z.unknown())])),
  tokenUsage: tokenUsageSchema.optional(),
  /** Recorded by the core agent; absent for templates and specialists. */
  routing: routingDecisionSchema.optional(),
});

export type AgentRunFile = z.infer<typeof agentRunFileSchema>;

// ── Agent Run Request ───────────────────────────────────────────────────────

export const agentRunRequestSchema = z.object({
  projectId: nonEmptyStringSchema,
  sceneId: nonEmptyStringSchema,
  threadId: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema,
  prompt: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  snapshotVersion: z.string().optional(),
});

export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;
