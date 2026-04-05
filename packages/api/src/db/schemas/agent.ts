import { z } from "zod";
import { nonEmptyStringSchema, timestampSchema } from "./project";
import { boardOpSchema } from "@dreamer/schemas";

// ── Agent Kind ──────────────────────────────────────────────────────────────

export const agentKindSchema = z.enum(["core", "circuit", "graph"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

// ── Project Thread ──────────────────────────────────────────────────────────

export const projectThreadSchema = z.object({
  id: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ProjectThread = z.infer<typeof projectThreadSchema>;

export const projectThreadFileSchema = z.object({
  thread: projectThreadSchema,
  runIds: z.array(nonEmptyStringSchema),
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
});

export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

export const agentRunFileSchema = z.object({
  run: agentRunRecordSchema,
  prompt: z.string(),
  assistantText: z.string().optional(),
  messages: z.array(z.unknown()),
  proposedOps: z.array(z.union([boardOpSchema, z.record(z.string(), z.unknown())])),
  appliedOps: z.array(z.union([boardOpSchema, z.record(z.string(), z.unknown())])),
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
});

export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;
