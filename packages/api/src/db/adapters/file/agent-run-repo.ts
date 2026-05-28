import { join } from "path";
import { mkdir } from "fs/promises";
import { runsDir as runsDirPath, threadsDir as threadsDirPath } from "../../../paths";
import { AGENT_VERSION } from "../../../agents/version";
import {
  agentRunFileSchema,
  agentRunRecordSchema,
  projectThreadFileSchema,
  type AgentKind,
  type AgentRunFile,
  type AgentRunRecord,
  type CachedSummary,
  type ProjectThreadFile,
} from "../../schemas";
import type { BoardOp } from "@dreamer/schemas";

// Path resolution lives in ../paths.ts; called on each access so tests
// that set DATA_DIR / DREAMER_HOME after this module is imported still work.

function now(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

function threadPath(threadId: string): string {
  return join(threadsDirPath(), `${threadId}.json`);
}

function runPath(runId: string): string {
  return join(runsDirPath(), `${runId}.json`);
}

async function ensureDirs() {
  await mkdir(threadsDirPath(), { recursive: true });
  await mkdir(runsDirPath(), { recursive: true });
}

async function readThread(threadId: string): Promise<ProjectThreadFile | null> {
  const file = Bun.file(threadPath(threadId));
  if (!(await file.exists())) return null;
  return projectThreadFileSchema.parse(await file.json());
}

async function writeThread(threadId: string, data: ProjectThreadFile) {
  await ensureDirs();
  await Bun.write(threadPath(threadId), JSON.stringify(data, null, 2));
}

async function readRun(runId: string): Promise<AgentRunFile | null> {
  const file = Bun.file(runPath(runId));
  if (!(await file.exists())) return null;
  return agentRunFileSchema.parse(await file.json());
}

async function writeRun(runId: string, data: AgentRunFile) {
  await ensureDirs();
  await Bun.write(runPath(runId), JSON.stringify(data, null, 2));
}

async function getOrCreateThread(threadId: string, projectId: string) {
  const existing = await readThread(threadId);
  if (existing) {
    if (existing.thread.projectId !== projectId) {
      throw new Error("threadId belongs to a different project");
    }
    return existing;
  }

  const created: ProjectThreadFile = {
    thread: {
      id: threadId,
      projectId,
      createdAt: now(),
      updatedAt: now(),
    },
    runIds: [],
  };
  await writeThread(threadId, created);
  return created;
}

async function createRun(params: {
  threadId: string;
  projectId: string;
  sceneId: string;
  sessionId: string;
  prompt: string;
  agent: AgentKind;
  parentRunId?: string;
  snapshotVersion?: string;
}): Promise<AgentRunFile> {
  const run: AgentRunRecord = agentRunRecordSchema.parse({
    id: createId(),
    threadId: params.threadId,
    projectId: params.projectId,
    sceneId: params.sceneId,
    sessionId: params.sessionId,
    agent: params.agent,
    parentRunId: params.parentRunId,
    status: "running",
    createdAt: now(),
    agentVersion: AGENT_VERSION,
    agentSnapshotVersion: params.snapshotVersion,
  });

  const file: AgentRunFile = {
    run,
    prompt: params.prompt,
    messages: [],
    proposedOps: [],
    appliedOps: [],
  };
  await writeRun(run.id, file);
  return file;
}

async function completeRun(params: {
  runId: string;
  assistantText?: string;
  messages?: unknown[];
  proposedOps: BoardOp[];
  appliedOps: BoardOp[];
  error?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string;
    children?: Array<{
      agent: AgentKind;
      runId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      model: string;
      error?: string;
    }>;
    overhead?: Array<{
      kind: "summarizer_live" | "summarizer_background";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      model: string;
    }>;
    workflow?: {
      attribution: "step_usage_allocation";
      byTool: Array<{
        tool: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      }>;
      unattributedTokens: number;
    };
  };
}) {
  const existing = await readRun(params.runId);
  if (!existing) return;

  existing.run.status = params.error ? "failed" : "completed";
  existing.run.completedAt = now();
  if (params.error) existing.run.error = params.error;
  existing.assistantText = params.assistantText;
  if (params.messages) existing.messages = params.messages;
  existing.proposedOps = params.proposedOps;
  existing.appliedOps = params.appliedOps;
  if (params.tokenUsage) existing.tokenUsage = params.tokenUsage;

  await writeRun(existing.run.id, existing);

  // Fire-and-forget: auto-evaluate the run
  import("../../../eval/batch-evaluator").then(({ evaluateSingleRun }) => {
    evaluateSingleRun(params.runId).catch(() => {});
  }).catch(() => {});
}

/**
 * Record the router's decision on a run file. Called by the core agent
 * immediately after routing, so the decision is persisted even if the
 * run later fails.
 */
async function setRouting(
  runId: string,
  routing: {
    model: string;
    toolMode: "build" | "edit" | "circuit" | "all";
    availableTools?: string[];
    domain: "breadboard" | "graph" | "mixed" | "ambiguous";
    requestType: "additive" | "surgical" | "rebuild" | "debug" | "question";
    complexity: "simple" | "complex";
    reasons: string[];
    signals: {
      boardComponentCount: number;
      graphNodeCount: number;
      promptLength: number;
      recentFailures: number;
      componentsMentioned: number;
    };
  }
) {
  const existing = await readRun(runId);
  if (!existing) return;
  existing.routing = routing;
  await writeRun(runId, existing);
}

/**
 * v2.0.0: persist which specialized sub-agent the dispatcher picked.
 * Absent for 1.x runs (legacy single-agent codepath).
 */
async function setSubAgent(runId: string, subAgent: "build" | "fix") {
  const existing = await readRun(runId);
  if (!existing) return;
  existing.run.subAgent = subAgent;
  await writeRun(runId, existing);
}

async function attachRunToThread(threadId: string, runId: string) {
  const thread = await readThread(threadId);
  if (!thread) return;
  if (!thread.runIds.includes(runId)) {
    thread.runIds.push(runId);
  }
  thread.thread.updatedAt = now();
  await writeThread(threadId, thread);
}

async function listRunsForThread(threadId: string): Promise<AgentRunFile[]> {
  const thread = await readThread(threadId);
  if (!thread) return [];

  const runs: AgentRunFile[] = [];
  for (const runId of thread.runIds) {
    const run = await readRun(runId);
    if (run) runs.push(run);
  }
  return runs;
}

async function readThreadSummary(threadId: string): Promise<CachedSummary | undefined> {
  const thread = await readThread(threadId);
  return thread?.cachedSummary;
}

async function updateThreadSummary(threadId: string, summary: CachedSummary) {
  const thread = await readThread(threadId);
  if (!thread) return;
  thread.cachedSummary = summary;
  thread.thread.updatedAt = now();
  await writeThread(threadId, thread);
}

/**
 * Append an overhead entry (e.g. background summarizer) to a completed run
 * and update its totalTokens. Used by fire-and-forget tasks that want to
 * attribute their cost to the run that triggered them.
 */
async function appendOverhead(
  runId: string,
  overhead: {
    kind: "summarizer_live" | "summarizer_background";
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string;
  }
) {
  const existing = await readRun(runId);
  if (!existing) return;

  // Seed tokenUsage if missing
  if (!existing.tokenUsage) {
    existing.tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: "unknown",
    };
  }

  const existingOverhead = existing.tokenUsage.overhead ?? [];
  existing.tokenUsage.overhead = [...existingOverhead, overhead];
  existing.tokenUsage.totalTokens = existing.tokenUsage.totalTokens + overhead.totalTokens;

  await writeRun(runId, existing);

  // Re-run eval so the summary picks up the corrected total
  import("../../../eval/batch-evaluator").then(({ evaluateSingleRun }) => {
    evaluateSingleRun(runId).catch(() => {});
  }).catch(() => {});
}

export const agentRunRepo = {
  getOrCreateThread,
  createRun,
  completeRun,
  setRouting,
  setSubAgent,
  attachRunToThread,
  readRun,
  listRunsForThread,
  readThreadSummary,
  updateThreadSummary,
  appendOverhead,
};
