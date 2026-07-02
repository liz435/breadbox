import { streamCoreAgent } from "@dreamer/api/agents/core/agent"
import { agentRunRepo } from "@dreamer/api/db/adapters/file/agent-run-repo"
import { projectRepo } from "@dreamer/api/db/adapters/file/project-repo"
import { boardTracker } from "@dreamer/api/db/board-state-tracker"
import { buildTieredMemory } from "@dreamer/api/agents/tiered-memory"
import { resolveAgentSnapshotVersion } from "@dreamer/api/agents/version"
import { createLogger } from "@dreamer/api/logger"
import { CLI_LOCAL_USER_ID } from "@dreamer/api/env"
import type { BoardOp } from "@dreamer/schemas"
import type { ProjectState } from "./project-manager"
import type { RenderCallbacks, TokenOverhead } from "./renderer"
import { ensureApiKey } from "./config"

const log = createLogger("cli")

const LOCAL_OWNER_ID = CLI_LOCAL_USER_ID

export type RunResult = {
  text: string
  ops: BoardOp[]
  appliedOps: BoardOp[]
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
  overhead: TokenOverhead[]
  aborted: boolean
}

export class AgentAbortedError extends Error {
  constructor(public readonly runId: string) {
    super("agent run aborted by user")
    this.name = "AgentAbortedError"
  }
}

type SigintEmitter = {
  on: (event: "SIGINT", listener: () => void) => unknown
  removeListener: (event: "SIGINT", listener: () => void) => unknown
}

export async function withSigintCleanup<T>(
  emitter: SigintEmitter,
  onSigint: () => void,
  run: () => Promise<T>,
): Promise<T> {
  emitter.on("SIGINT", onSigint)
  try {
    return await run()
  } finally {
    emitter.removeListener("SIGINT", onSigint)
  }
}

export async function runAgent(
  state: ProjectState,
  prompt: string,
  sessionId: string,
  render: RenderCallbacks,
): Promise<RunResult> {
  // Ensure API key is available before spending a run slot. First-run users
  // get prompted; scripts get a clear error.
  await ensureApiKey()

  const { projectId, project, sceneId } = state
  const threadId = `cli-thread-${projectId}`
  const snapshotVersion = resolveAgentSnapshotVersion()

  // Refresh project from disk
  const freshProject = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (freshProject) {
    state.project = freshProject
  }
  const currentProject = state.project

  // Ensure board tracker is initialized
  if (!boardTracker.get(projectId) && currentProject.boardState) {
    boardTracker.set(projectId, currentProject.boardState)
  }

  // Ensure thread
  await agentRunRepo.getOrCreateThread(threadId, projectId)

  // Create run
  const runFile = await agentRunRepo.createRun({
    threadId,
    projectId,
    sceneId,
    sessionId,
    prompt,
    agent: "core",
    snapshotVersion,
  })
  await agentRunRepo.attachRunToThread(threadId, runFile.run.id)

  // Build conversation history from prior runs
  const priorRuns = await agentRunRepo.listRunsForThread(threadId)
  const completedRuns = priorRuns.filter(
    (r) => r.run.id !== runFile.run.id && r.run.status === "completed",
  )
  const memoryResult = await buildTieredMemory({
    prompt,
    completedRuns,
    cachedSummary: await agentRunRepo.readThreadSummary(threadId),
  })
  const history = memoryResult.messages

  // Start agent
  render.onStatus("Thinking...")
  const agentStream = streamCoreAgent({
    prompt,
    project: currentProject,
    sceneId,
    runId: runFile.run.id,
    threadId,
    projectId,
    sessionId,
    snapshotVersion,
    parentLog: log,
    history,
    priorRuns: completedRuns,
  })

  // Wire SIGINT → agent abort. First Ctrl+C cancels the in-flight run;
  // second Ctrl+C within 1.5s falls through to default behavior (hard exit).
  // Without this, Ctrl+C during streaming leaves the run orphaned at
  // status="running" in the repo forever.
  let aborted = false
  let sigintCount = 0
  let lastSigintAt = 0
  const onSigint = () => {
    const now = Date.now()
    if (now - lastSigintAt > 1500) sigintCount = 0
    lastSigintAt = now
    sigintCount++
    if (sigintCount >= 2) {
      // Double Ctrl+C — let it fall through (remove handler, re-emit)
      process.removeListener("SIGINT", onSigint)
      process.kill(process.pid, "SIGINT")
      return
    }
    if (!aborted) {
      aborted = true
      agentStream.abort("user cancelled (Ctrl+C)")
      render.onStatus("")
      process.stdout.write("\n\x1b[2mCancelling... press Ctrl+C again to force exit.\x1b[0m\n")
    }
  }
  return withSigintCleanup(process, onSigint, async () => {
    // Stream text token-by-token from the UI message stream
    agentStream.onNewOps((newOps) => {
      render.onOps(newOps)
    })
    const streamReader = agentStream.uiMessageStream.getReader()
    let streamedAnyText = false
    try {
      while (true) {
        const { done, value } = await streamReader.read()
        if (done) break
        const chunk = value as { type?: string; delta?: string; id?: string; toolName?: string }
        if (chunk.type === "text-delta" && chunk.delta) {
          if (!streamedAnyText) {
            render.onStatus("")
            process.stdout.write("\n")
            streamedAnyText = true
          }
          render.onTextDelta(chunk.delta)
        } else if (chunk.type === "tool-call-begin" && chunk.toolName) {
          render.onStatus(`Using ${chunk.toolName}...`)
        }
      }
    } catch { /* stream ended or errored */ }
    if (streamedAnyText) {
      process.stdout.write("\n\n")
    }

    // If aborted, persist run as failed and bail out before applying ops.
    if (aborted) {
      try {
        await agentRunRepo.completeRun({
          runId: runFile.run.id,
          proposedOps: [],
          appliedOps: [],
          error: "aborted by user",
        })
      } catch (err) {
        log.warn(`failed to mark aborted run as failed: ${err}`)
      }
      throw new AgentAbortedError(runFile.run.id)
    }

    // Collect final result (stream is already consumed, this just awaits completion)
    const result = await agentStream.collectResult()

    // Surface destructive plan preview (already computed by the agent)
    const plan = agentStream.getPlan()
    if (plan && plan.isDestructive) {
      render.onPlanPreview({
        summary: plan.summary,
        steps: plan.steps,
        isDestructive: plan.isDestructive,
        destructiveDetails: plan.destructiveDetails,
      })
    }

    // Apply board ops
    let appliedOps: BoardOp[] = []
    const boardOps = result.proposedOps
    if (boardOps.length > 0) {
      try {
        const applyResult = await projectRepo.applyBoardOps(projectId, LOCAL_OWNER_ID, {
          expectedVersion: currentProject.project.version,
          ops: boardOps,
        })
        if (applyResult) {
          appliedOps = applyResult.appliedOps
          await boardTracker.applyOps(projectId, appliedOps, currentProject.boardState)
        }
      } catch (err) {
        render.onError(`Failed to apply ops: ${err}`)
      }
    }

    // Refresh project state after applying ops
    const updatedProject = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
    if (updatedProject) {
      state.project = updatedProject
    }

    // Complete run record
    await agentRunRepo.completeRun({
      runId: runFile.run.id,
      assistantText: result.assistantText,
      messages: result.messages,
      proposedOps: result.proposedOps,
      appliedOps,
      tokenUsage: result.tokenUsage,
    })

    // Collect token overhead (planner + summarizer) so CLI users can see
    // full cost, same as web app's data-token-usage event.
    const overhead: TokenOverhead[] = []
    const plannerUsage = agentStream.getPlannerUsage()
    if (plannerUsage && plannerUsage.totalTokens > 0) {
      overhead.push({
        kind: "planner",
        totalTokens: plannerUsage.totalTokens,
        model: plannerUsage.model,
      })
    }
    if (memoryResult.usage && memoryResult.usage.totalTokens > 0) {
      overhead.push({
        kind: "summarizer",
        totalTokens: memoryResult.usage.totalTokens,
        model: memoryResult.usage.model,
      })
    }

    return {
      text: result.assistantText,
      ops: result.proposedOps,
      appliedOps,
      tokenUsage: result.tokenUsage,
      overhead,
      aborted: false,
    }
  }).finally(() => {
    render.onStatus("")
  })
}
