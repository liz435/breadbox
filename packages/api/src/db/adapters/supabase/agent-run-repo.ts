// ── Supabase agent-run repository ───────────────────────────────────────
//
// Postgres-backed mirror of the file adapter's agent-run-repo. Threads
// live in `threads` (id, project_id, data jsonb, updated_at); runs in
// `agent_runs` (id, thread_id, project_id, status, data jsonb, created_at).
//
// Reads always pass through the rowToX helpers so the rest of the
// codebase sees the same TS shapes as the file adapter.

import {
  agentRunFileSchema,
  agentRunRecordSchema,
  projectThreadFileSchema,
  type AgentKind,
  type AgentRunFile,
  type AgentRunRecord,
  type CachedSummary,
  type ProjectThreadFile,
} from "../../schemas"
import type { BoardOp } from "@dreamer/schemas"
import { AGENT_VERSION } from "../../../agents/version"
import { getSupabaseAdmin } from "../../../supabase/admin-client"
import {
  threadToRow,
  rowToThread,
  runToRow,
  rowToRun,
  type ThreadRow,
  type AgentRunRow,
} from "./row-mapping"
import { parseInDev } from "./parse-in-dev"

const THREADS = "threads"
const RUNS = "agent_runs"
const THREAD_COLUMNS = "id, project_id, data, updated_at"
const RUN_COLUMNS = "id, thread_id, project_id, status, data, created_at"

function now(): string {
  return new Date().toISOString()
}

function createId(): string {
  return crypto.randomUUID()
}

// ── Thread row helpers ──────────────────────────────────────────────────

async function readThreadRow(
  threadId: string,
): Promise<ProjectThreadFile | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(THREADS)
    .select(THREAD_COLUMNS)
    .eq("id", threadId)
    .maybeSingle()
  if (error) throw new Error(`readThread: ${error.message}`)
  if (!data) return null
  const thread = rowToThread(data as ThreadRow)
  return parseInDev(projectThreadFileSchema, thread)
}

async function upsertThreadRow(thread: ProjectThreadFile): Promise<void> {
  const supabase = getSupabaseAdmin()
  const row = threadToRow(parseInDev(projectThreadFileSchema, thread))
  const { error } = await supabase
    .from(THREADS)
    .upsert(row, { onConflict: "id" })
  if (error) throw new Error(`upsertThread: ${error.message}`)
}

// ── Run row helpers ─────────────────────────────────────────────────────

async function readRunRow(runId: string): Promise<AgentRunFile | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(RUNS)
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .maybeSingle()
  if (error) throw new Error(`readRun: ${error.message}`)
  if (!data) return null
  const run = rowToRun(data as AgentRunRow)
  return parseInDev(agentRunFileSchema, run)
}

async function upsertRunRow(run: AgentRunFile): Promise<void> {
  const supabase = getSupabaseAdmin()
  const row = runToRow(parseInDev(agentRunFileSchema, run))
  const { error } = await supabase
    .from(RUNS)
    .upsert(row, { onConflict: "id" })
  if (error) throw new Error(`upsertRun: ${error.message}`)
}

// ── Public API ──────────────────────────────────────────────────────────

async function getOrCreateThread(
  threadId: string,
  projectId: string,
): Promise<ProjectThreadFile> {
  const existing = await readThreadRow(threadId)
  if (existing) {
    if (existing.thread.projectId !== projectId) {
      throw new Error("threadId belongs to a different project")
    }
    return existing
  }

  const created: ProjectThreadFile = {
    thread: {
      id: threadId,
      projectId,
      createdAt: now(),
      updatedAt: now(),
    },
    runIds: [],
  }
  await upsertThreadRow(created)
  return created
}

async function createRun(params: {
  threadId: string
  projectId: string
  sceneId: string
  sessionId: string
  prompt: string
  agent: AgentKind
  parentRunId?: string
  snapshotVersion?: string
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
  })

  const file: AgentRunFile = {
    run,
    prompt: params.prompt,
    messages: [],
    proposedOps: [],
    appliedOps: [],
  }
  await upsertRunRow(file)
  return file
}

async function completeRun(params: {
  runId: string
  assistantText?: string
  messages?: unknown[]
  proposedOps: BoardOp[]
  appliedOps: BoardOp[]
  error?: string
  tokenUsage?: NonNullable<AgentRunFile["tokenUsage"]>
}) {
  const existing = await readRunRow(params.runId)
  if (!existing) return

  existing.run.status = params.error ? "failed" : "completed"
  existing.run.completedAt = now()
  if (params.error) existing.run.error = params.error
  existing.assistantText = params.assistantText
  if (params.messages) existing.messages = params.messages
  existing.proposedOps = params.proposedOps
  existing.appliedOps = params.appliedOps
  if (params.tokenUsage) existing.tokenUsage = params.tokenUsage

  await upsertRunRow(existing)

  // Fire-and-forget auto-eval — same shape as the file adapter.
  import("../../../eval/batch-evaluator")
    .then(({ evaluateSingleRun }) => {
      evaluateSingleRun(params.runId).catch(() => {})
    })
    .catch(() => {})
}

async function setRouting(
  runId: string,
  routing: NonNullable<AgentRunFile["routing"]>,
): Promise<void> {
  const existing = await readRunRow(runId)
  if (!existing) return
  existing.routing = routing
  await upsertRunRow(existing)
}

async function attachRunToThread(
  threadId: string,
  runId: string,
): Promise<void> {
  const thread = await readThreadRow(threadId)
  if (!thread) return
  if (!thread.runIds.includes(runId)) thread.runIds.push(runId)
  thread.thread.updatedAt = now()
  await upsertThreadRow(thread)
}

async function readRun(runId: string): Promise<AgentRunFile | null> {
  return await readRunRow(runId)
}

async function listRunsForThread(threadId: string): Promise<AgentRunFile[]> {
  const thread = await readThreadRow(threadId)
  if (!thread) return []
  if (thread.runIds.length === 0) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(RUNS)
    .select(RUN_COLUMNS)
    .in("id", thread.runIds)
  if (error) throw new Error(`listRunsForThread: ${error.message}`)
  // Preserve the thread's runIds ordering (oldest → newest) rather than
  // relying on DB row order.
  const byId = new Map<string, AgentRunFile>()
  for (const row of (data ?? []) as AgentRunRow[]) {
    byId.set(row.id, rowToRun(row))
  }
  const ordered: AgentRunFile[] = []
  for (const id of thread.runIds) {
    const r = byId.get(id)
    if (r) ordered.push(r)
  }
  return ordered
}

async function readThreadSummary(
  threadId: string,
): Promise<CachedSummary | undefined> {
  const thread = await readThreadRow(threadId)
  return thread?.cachedSummary
}

async function updateThreadSummary(
  threadId: string,
  summary: CachedSummary,
): Promise<void> {
  const thread = await readThreadRow(threadId)
  if (!thread) return
  thread.cachedSummary = summary
  thread.thread.updatedAt = now()
  await upsertThreadRow(thread)
}

async function appendOverhead(
  runId: string,
  overhead: {
    kind: "summarizer_live" | "summarizer_background"
    inputTokens: number
    outputTokens: number
    totalTokens: number
    model: string
  },
): Promise<void> {
  const existing = await readRunRow(runId)
  if (!existing) return

  if (!existing.tokenUsage) {
    existing.tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: "unknown",
    }
  }
  const prev = existing.tokenUsage.overhead ?? []
  existing.tokenUsage.overhead = [...prev, overhead]
  existing.tokenUsage.totalTokens =
    existing.tokenUsage.totalTokens + overhead.totalTokens

  await upsertRunRow(existing)

  import("../../../eval/batch-evaluator")
    .then(({ evaluateSingleRun }) => {
      evaluateSingleRun(runId).catch(() => {})
    })
    .catch(() => {})
}

export const agentRunRepo = {
  getOrCreateThread,
  createRun,
  completeRun,
  setRouting,
  attachRunToThread,
  readRun,
  listRunsForThread,
  readThreadSummary,
  updateThreadSummary,
  appendOverhead,
}
