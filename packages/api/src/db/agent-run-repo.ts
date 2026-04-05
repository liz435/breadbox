import { join } from "path";
import { mkdir } from "fs/promises";
import {
  agentRunFileSchema,
  agentRunRecordSchema,
  projectThreadFileSchema,
  type AgentKind,
  type AgentRunFile,
  type AgentRunRecord,
  type ProjectThreadFile,
} from "./schemas";
import type { BoardOp } from "@dreamer/schemas";

const THREADS_DIR = join(import.meta.dir, "../../data/threads");
const RUNS_DIR = join(import.meta.dir, "../../data/runs");

function now(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

function threadPath(threadId: string): string {
  return join(THREADS_DIR, `${threadId}.json`);
}

function runPath(runId: string): string {
  return join(RUNS_DIR, `${runId}.json`);
}

async function ensureDirs() {
  await mkdir(THREADS_DIR, { recursive: true });
  await mkdir(RUNS_DIR, { recursive: true });
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

  await writeRun(existing.run.id, existing);
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

export const agentRunRepo = {
  getOrCreateThread,
  createRun,
  completeRun,
  attachRunToThread,
  readRun,
  listRunsForThread,
};
