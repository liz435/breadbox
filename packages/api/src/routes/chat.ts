import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { isBoardComponentType, nonEmptyStringSchema } from "@dreamer/schemas";
import type { BoardOp } from "@dreamer/schemas";
import { storage, VersionConflictError, OpValidationError } from "../db";
import { buildTieredMemory } from "../agents/tiered-memory";
import { generateThreadSummary } from "../agents/history-summarizer";
import { streamCoreAgent } from "../agents/core/agent";
import {
  EMPTY_REPORT,
  isReportEmpty,
  mergeReports,
  sanitizeModelMessages,
  type SanitizationReport,
} from "../agents/sanitize-messages";
import { classifyIntent } from "../agents/intent-classifier";
import { CIRCUIT_TEMPLATES } from "../agents/circuit-templates";
import { makeBoardOp } from "../agents/make-op";
import { boardTracker } from "../db/board-state-tracker";
import { createTrace, startSpan, closeTrace, serializeTrace } from "../agents/trace";
import { resolveAgentSnapshotVersion } from "../agents/version";
import { createLogger } from "../logger";
import type { AuthContext } from "../auth/context";
import { authPlugin } from "../auth/auth-plugin";
import { requireRateLimit, RateLimitError } from "../auth/rate-limit";
import {
  assertCreditsAvailable,
  debitForLlmRun,
  ensureWalletForUser,
} from "../services/billing";
import { InsufficientCreditsError } from "../billing/errors";
import type { DreamerSupportedLLM } from "../billing";

const log = createLogger("chat");
let requestId = 0;

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route");
  return auth.userId;
}

// Background summary tasks — tracked so shutdown can drain them before exit.
// Without this, Railway's SIGTERM/redeploy aborts in-flight summary writes
// and the next turn reads a stale cache.
const pendingSummaries = new Set<Promise<void>>();

function trackSummary(task: Promise<void>): void {
  pendingSummaries.add(task);
  task.finally(() => {
    pendingSummaries.delete(task);
  });
}

/** Await any in-flight background summaries, with a hard deadline. */
export async function awaitPendingSummaries(timeoutMs: number): Promise<void> {
  if (pendingSummaries.size === 0) return;
  const drain = Promise.allSettled([...pendingSummaries]);
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([drain, deadline]);
}

/**
 * Schema for the useChat DefaultChatTransport request body.
 * It sends `messages` (UIMessage[]) plus any custom `body` fields we configured.
 */
/**
 * Live Serial Monitor tail forwarded by the client so the
 * `read_serial_monitor` agent tool has access to the freshest output.
 * Bounded so a runaway sketch can't blow up the request body — the
 * client already tails to the last N entries before sending.
 */
const recentSerialSchema = z
  .array(
    z.object({
      text: z.string().max(4_000),
      ts: z.number().int().nonnegative(),
      // Optional today; populated by the client once the serialOutput
      // schema gains source tagging (the WebSerial PR adds this on
      // BoardState). Accepting it here keeps the wire format
      // forward-compatible so the client can start sending the field
      // without a route bump.
      source: z.enum(["simulator", "board"]).optional(),
    }),
  )
  .max(1_000)
  .optional();

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.unknown()),
  })),
  projectId: nonEmptyStringSchema,
  sceneId: nonEmptyStringSchema,
  threadId: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema,
  expectedVersion: z.number().int().nonnegative(),
  snapshotVersion: z.string().optional(),
  recentSerial: recentSerialSchema,
});

/** Extract the text from the last user message's parts. */
function extractLastUserPrompt(messages: z.infer<typeof chatRequestSchema>["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      const texts: string[] = [];
      for (const part of msg.parts) {
        if (typeof part === "object" && part !== null && "type" in part && part.type === "text") {
          const textPart = part as { type: "text"; text: string };
          texts.push(textPart.text);
        }
      }
      return texts.join("\n");
    }
  }
  return "";
}

const GRAPH_OP_KINDS = new Set([
  "create_graph_node", "delete_graph_node", "move_graph_node",
  "update_graph_node_data", "create_edge", "delete_edge",
]);

const BOARD_OP_KINDS = new Set([
  "place_component", "remove_component", "move_component",
  "update_component", "connect_wire", "remove_wire",
  "set_pin_mode", "update_sketch", "update_board_settings", "load_board",
]);

export const chatRoutes = new Elysia().use(authPlugin).post("/api/chat", async ({ auth, body, set }) => {
  const ownerId = requireOwnerId(auth);

  try {
    await requireRateLimit("chat", ownerId, auth?.mode);
  } catch (err) {
    if (err instanceof RateLimitError) {
      set.status = 429;
      set.headers["Retry-After"] = String(err.retryAfterSec);
      return { error: err.message, retryAfterSec: err.retryAfterSec };
    }
    throw err;
  }

  // Pre-stream balance gate. CLI mode no-ops; hosted 402s when the
  // user is out of credits so the frontend can prompt before a long
  // SSE stream opens against a dead wallet.
  try {
    await ensureWalletForUser(ownerId);
    await assertCreditsAvailable(ownerId);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      set.status = 402;
      return { error: "insufficient credits", available: err.available };
    }
    throw err;
  }

  const id = ++requestId;
  const reqLog = log.child(`req-${id}`);

  let input;
  try {
    input = chatRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      set.status = 400;
      return { error: "Invalid request payload", details: err.flatten() };
    }
    throw err;
  }

  const prompt = extractLastUserPrompt(input.messages);
  if (!prompt) {
    set.status = 400;
    return { error: "No user message found" };
  }

  reqLog.info(
    `incoming — project: ${input.projectId}, thread: ${input.threadId}, prompt: ${prompt.slice(0, 80)}`
  );
  const snapshotVersion = resolveAgentSnapshotVersion(input.snapshotVersion);

  // 1. Read or bootstrap project
  let project = await storage.projects.readProject(input.projectId, ownerId);
  if (!project) {
    reqLog.info(`project ${input.projectId} not found, creating`);
    project = await storage.projects.getOrCreateProject({ ownerId, id: input.projectId });
  }

  if (!project.scenes[input.sceneId]) {
    set.status = 404;
    return { error: `Scene not found: ${input.sceneId}` };
  }

  // 1b. Ensure board tracker is initialized for this project
  if (!boardTracker.get(input.projectId) && project.boardState) {
    boardTracker.set(input.projectId, project.boardState);
  }

  // 2. Ensure thread exists
  await storage.agentRuns.getOrCreateThread(input.threadId, input.projectId);

  // 3. Create core agent run
  const runFile = await storage.agentRuns.createRun({
    threadId: input.threadId,
    projectId: input.projectId,
    sceneId: input.sceneId,
    sessionId: input.sessionId,
    prompt,
    agent: "core",
    snapshotVersion,
  });
  await storage.agentRuns.attachRunToThread(input.threadId, runFile.run.id);
  reqLog.info(`created run: ${runFile.run.id}`);

  // 3b. Open trace span for the full request
  const trace = createTrace(runFile.run.id);
  const { finish: finishValidation } = startSpan(trace.rootSpan, "validation");
  finishValidation();

  // 4. Classify intent — template or agent?
  const { finish: finishIntent } = startSpan(trace.rootSpan, "intent_classification");
  const intent = classifyIntent(prompt);
  finishIntent({ confidence: intent.confidence, type: intent.type });

  if (intent.type === "template") {
    reqLog.info(`template match: ${intent.template}, additive: ${intent.additive}, confidence: ${intent.confidence}`);
    const templateFn = CIRCUIT_TEMPLATES[intent.template];
    if (templateFn && project.boardState) {
      const { finish: finishTemplate } = startSpan(trace.rootSpan, "template_execution");
      const opCtx = {
        projectId: input.projectId,
        sceneId: input.sceneId,
        expectedVersion: input.expectedVersion,
      };

      // Clear existing board unless the user wants to add to it
      const clearOps: BoardOp[] = [];
      if (!intent.additive) {
        const board = project.boardState;
        for (const wireId of Object.keys(board.wires)) {
          clearOps.push(makeBoardOp(opCtx, {
            kind: "remove_wire",
            payload: { wireId },
          }));
        }
        for (const comp of Object.values(board.components)) {
          if (isBoardComponentType(comp.type)) continue;
          clearOps.push(makeBoardOp(opCtx, {
            kind: "remove_component",
            payload: { componentId: comp.id },
          }));
        }
      }

      const result = templateFn(opCtx, project.boardState, intent.params);
      const templateOps = [...clearOps, ...result.ops];

      // Apply ops server-side
      try {
        await storage.projects.applyBoardOps(input.projectId, ownerId, {
          expectedVersion: input.expectedVersion,
          ops: templateOps,
        });
        await boardTracker.applyOps(input.projectId, templateOps, project.boardState);
      } catch (err) {
        reqLog.warn(`template op application failed: ${err}`);
      }

      // Complete the run record
      await storage.agentRuns.completeRun({
        runId: runFile.run.id,
        assistantText: result.description,
        messages: [{ role: "assistant" as const, content: result.description }],
        proposedOps: templateOps,
        appliedOps: templateOps,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, model: "template" },
      });

      finishTemplate({ opsCount: templateOps.length });
      closeTrace(trace);

      // Stream the response
      const uiStream = createUIMessageStream({
        async execute({ writer }) {
          writer.write({ type: "data-scene-ops", data: templateOps });

          const msgId = crypto.randomUUID();
          writer.write({ type: "text-start", id: msgId });
          writer.write({ type: "text-delta", delta: result.description, id: msgId });
          writer.write({ type: "text-end", id: msgId });

          writer.write({
            type: "data-token-usage" as never,
            data: { inputTokens: 0, outputTokens: 0, model: "template", childRuns: [] },
          });

          writer.write({
            type: "data-scene-result" as never,
            data: {
              appliedOps: templateOps,
              newVersion: input.expectedVersion + 1,
              runId: runFile.run.id,
              tokenUsage: { inputTokens: 0, outputTokens: 0, model: "template" },
            },
          });

          // Emit trace data
          writer.write({
            type: "data-trace" as never,
            data: serializeTrace(trace),
          });
        },
      });

      reqLog.info(`template completed — ${templateOps.length} ops`);
      return createUIMessageStreamResponse({ stream: uiStream });
    }
  }

  // 5. Build conversation history using tiered memory retrieval
  const { finish: finishMemory } = startSpan(trace.rootSpan, "tiered_memory");
  const priorRuns = await storage.agentRuns.listRunsForThread(input.threadId);
  const cachedSummary = await storage.agentRuns.readThreadSummary(input.threadId);
  const completedRuns = priorRuns.filter(
    (r) => r.run.id !== runFile.run.id && r.run.status === "completed"
  );
  const memoryResult = await buildTieredMemory({
    prompt,
    completedRuns,
    cachedSummary,
  });
  const history = memoryResult.messages;
  const liveSummarizerUsage = memoryResult.usage;
  finishMemory({
    historyMessages: history.length,
    completedRuns: completedRuns.length,
    tfidfHits: memoryResult.tfidfRunIds.length,
  });
  reqLog.debug(`rebuilt ${history.length} history message(s) from ${completedRuns.length} prior run(s)`);
  if (memoryResult.tfidfRunIds.length > 0) {
    reqLog.info(`TF-IDF retrieved ${memoryResult.tfidfRunIds.length} relevant older run(s)`);
  }
  if (liveSummarizerUsage && liveSummarizerUsage.totalTokens > 0) {
    reqLog.info(
      `live summarizer overhead: ${liveSummarizerUsage.totalTokens} tokens (${liveSummarizerUsage.model})`
    );
  }

  // 6. Start streaming agent
  // Accumulator for per-step sanitizer reports. The mid-stream guard in
  // prepareStep fires `onHistorySanitized` once per step it dropped
  // anything; we merge into this closure-local total and emit ONE SSE
  // event in finalizeRun. Write-side sanitization (before completeRun
  // persist) also folds in here.
  let sanitizationTotals: SanitizationReport = EMPTY_REPORT;
  const { finish: finishAgentSetup } = startSpan(trace.rootSpan, "agent_setup");
  const agentStream = streamCoreAgent({
    prompt,
    project,
    sceneId: input.sceneId,
    runId: runFile.run.id,
    threadId: input.threadId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    snapshotVersion,
    parentLog: reqLog,
    history,
    priorRuns: completedRuns,
    recentSerial: input.recentSerial,
    onHistorySanitized: (delta) => {
      sanitizationTotals = mergeReports(sanitizationTotals, delta);
    },
  });
  finishAgentSetup();

  // Capture values for the stream execute callback
  const capturedExpectedVersion = input.expectedVersion;
  const capturedProjectId = input.projectId;
  const capturedProject = project;

  const uiStream = createUIMessageStream({
    async execute({ writer }) {
      // Stream board ops to the client as they're produced
      agentStream.onNewOps((newOps) => {
        const boardOnly = newOps.filter(
          (op) => BOARD_OP_KINDS.has(op.kind) && !GRAPH_OP_KINDS.has(op.kind)
        );
        if (boardOnly.length > 0) {
          writer.write({
            type: "data-scene-ops",
            data: boardOnly,
          });
        }
      });

      // Merge the AI SDK's UI message stream
      writer.merge(agentStream.uiMessageStream);

      // After the stream finishes, collect final results and apply ops server-side
      const { finish: finishCollect } = startSpan(trace.rootSpan, "collect_result");
      const result = await agentStream.collectResult();
      finishCollect({ opsCount: result.proposedOps.length });

      // Check plan feasibility and stream preview for destructive ops
      // Check plan feasibility and stream preview for destructive ops
      const agentPlan = agentStream.getPlan();
      if (agentPlan && agentPlan.isDestructive) {
        writer.write({
          type: "data-plan-preview" as never,
          data: {
            summary: agentPlan.summary,
            steps: agentPlan.steps,
            isDestructive: agentPlan.isDestructive,
            approvalReason: agentPlan.destructiveDetails ?? "This plan involves removing or replacing existing components.",
          },
        });
      }

      let newVersion = capturedProject.project.version;
      let appliedOps: BoardOp[] = [];

      // Separate graph ops from board ops
      const boardOps = result.proposedOps.filter(
        (op) => BOARD_OP_KINDS.has(op.kind)
      );
      const graphOps = result.proposedOps.filter(
        (op) => GRAPH_OP_KINDS.has(op.kind)
      );

      const { finish: finishApply } = startSpan(trace.rootSpan, "apply_ops");

      if (boardOps.length > 0) {
        try {
          const applyResult = await storage.projects.applyBoardOps(capturedProjectId, ownerId, {
            expectedVersion: capturedExpectedVersion,
            ops: boardOps,
          });
          if (applyResult) {
            newVersion = applyResult.newVersion;
            appliedOps = applyResult.appliedOps;
            await boardTracker.applyOps(capturedProjectId, appliedOps, capturedProject.boardState);
          }
        } catch (err) {
          if (err instanceof VersionConflictError) {
            reqLog.warn(
              `version conflict: expected ${err.expectedVersion}, current ${err.currentVersion}`
            );
            // Abort ALL ops (board + graph) on version conflict — coupled atomic rollback
            writer.write({
              type: "error",
              errorText: `Board was modified by another session. All operations (board and graph) have been aborted. Please refresh and retry. (expected v${err.expectedVersion}, current v${err.currentVersion})`,
            });
            // Skip graph ops entirely — atomic abort
            finishApply({ aborted: true, reason: "version_conflict" });
            await finalizeRun({
              writer,
              result,
              runFile,
              input,
              trace,
              liveSummarizerUsage,
              reqLog,
              appliedOps: [],
              newVersion,
              ownerId,
              sanitizationTotals,
            });
            return;
          } else if (err instanceof OpValidationError) {
            reqLog.warn(`op validation error: ${err.message}`);
            writer.write({
              type: "error",
              errorText: `Board operation rejected: ${err.message}`,
            });
          } else if (err instanceof ZodError) {
            reqLog.warn(`op schema validation error: ${err.message}`);
          } else {
            throw err;
          }
        }
      }

      // Apply graph ops to the project file — skip if board ops were aborted
      if (graphOps.length > 0) {
        try {
          const currentProject = await storage.projects.readProject(capturedProjectId, ownerId);
          if (currentProject) {
            const graph = currentProject.graph ?? { nodes: {}, edges: {} };
            for (const rawOp of graphOps) {
              const op = rawOp as unknown as { kind: string; payload: Record<string, unknown> };
              switch (op.kind) {
                case "create_graph_node": {
                  const node = (op.payload as { node: { id: string } }).node;
                  graph.nodes[node.id] = node as typeof graph.nodes[string];
                  break;
                }
                case "delete_graph_node": {
                  const nodeId = op.payload.nodeId as string;
                  delete graph.nodes[nodeId];
                  for (const [edgeId, edge] of Object.entries(graph.edges)) {
                    if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
                      delete graph.edges[edgeId];
                    }
                  }
                  break;
                }
                case "move_graph_node": {
                  const nodeId = op.payload.nodeId as string;
                  const x = op.payload.x as number;
                  const y = op.payload.y as number;
                  if (graph.nodes[nodeId]) {
                    graph.nodes[nodeId].x = x;
                    graph.nodes[nodeId].y = y;
                  }
                  break;
                }
                case "update_graph_node_data": {
                  const nodeId = op.payload.nodeId as string;
                  const patch = op.payload.patch as Record<string, unknown>;
                  if (graph.nodes[nodeId]) {
                    graph.nodes[nodeId].data = { ...graph.nodes[nodeId].data, ...patch };
                  }
                  break;
                }
                case "create_edge": {
                  const edge = (op.payload as { edge: { id: string } }).edge;
                  graph.edges[edge.id] = edge as typeof graph.edges[string];
                  break;
                }
                case "delete_edge":
                  delete graph.edges[op.payload.edgeId as string];
                  break;
              }
            }
            await storage.projects.saveGraph(capturedProjectId, ownerId, graph);
            reqLog.info(`persisted ${graphOps.length} graph ops to project file`);
          }
        } catch (graphErr) {
          reqLog.warn(`failed to persist graph ops: ${graphErr}`);
        }

        // Send graph ops to frontend for live update
        writer.write({
          type: "data-scene-ops",
          data: graphOps,
        });
      }

      finishApply({ boardOps: boardOps.length, graphOps: graphOps.length, appliedOps: appliedOps.length });

      await finalizeRun({
        writer,
        result,
        runFile,
        input,
        trace,
        liveSummarizerUsage,
        reqLog,
        appliedOps,
        newVersion,
        ownerId,
        sanitizationTotals,
      });
    },
    onError(error) {
      reqLog.error(`failed`, error);

      storage.agentRuns.completeRun({
        runId: runFile.run.id,
        proposedOps: [],
        appliedOps: [],
        error: String(error),
      }).catch((err) => {
        reqLog.warn(`failed to mark run as errored: ${err}`);
      });

      closeTrace(trace);
      return String(error);
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}).get("/api/threads/:threadId/messages", async ({ auth, params, set }) => {
  const ownerId = requireOwnerId(auth);
  const { threadId } = params;
  if (!threadId) {
    set.status = 400;
    return { error: "threadId is required" };
  }

  // Thread ownership flows through the project. Fetch runs first, then
  // confirm the thread's project belongs to the caller — otherwise a
  // threadId guess would leak another user's prompts.
  const runs = await storage.agentRuns.listRunsForThread(threadId);
  if (runs.length > 0) {
    const projectId = runs[0]?.run.projectId;
    if (projectId) {
      const project = await storage.projects.readProject(projectId, ownerId);
      if (!project) {
        set.status = 404;
        return { error: "Thread not found" };
      }
    }
  }
  const completedCoreRuns = runs.filter(
    (r) => r.run.status === "completed" && r.run.agent === "core"
  );

  type ChatUIMessage = {
    id: string;
    role: "user" | "assistant";
    parts: Array<{ type: "text"; text: string }>;
  };

  const messages: ChatUIMessage[] = [];
  for (const run of completedCoreRuns) {
    messages.push({
      id: `${run.run.id}-user`,
      role: "user",
      parts: [{ type: "text", text: run.prompt }],
    });
    if (run.assistantText) {
      messages.push({
        id: `${run.run.id}-assistant`,
        role: "assistant",
        parts: [{ type: "text", text: run.assistantText }],
      });
    }
  }

  return { messages };
});

// ── Helper: finalize run + emit metadata ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FinalizeRunArgs = {
  writer: { write: (data: any) => void }
  result: {
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number; model: string }
    proposedOps: BoardOp[]
    assistantText: string
    messages: unknown[]
  }
  runFile: { run: { id: string } }
  input: { threadId: string; projectId: string }
  trace: ReturnType<typeof createTrace>
  liveSummarizerUsage:
    | { inputTokens: number; outputTokens: number; totalTokens: number; model: string }
    | null
  reqLog: ReturnType<typeof createLogger>
  appliedOps: BoardOp[]
  newVersion: number
  ownerId: string
  /**
   * Aggregated mid-stream + write-side sanitizer counts for this request.
   * If non-empty, finalizeRun emits one `data-history-sanitized` SSE event
   * so the frontend can toast.warning the user.
   */
  sanitizationTotals: SanitizationReport
}

async function finalizeRun(args: FinalizeRunArgs) {
  const {
    writer,
    result,
    runFile,
    input,
    trace,
    liveSummarizerUsage,
    reqLog,
    appliedOps,
    newVersion,
    ownerId,
    sanitizationTotals,
  } = args
  // Write-side sanitize: even though prepareStep dropped bad blocks
  // before each Anthropic call, `result.messages` is what streamText
  // accumulated, which may still contain the raw model output. Strip
  // any survivors before persistence so a future replay never sees
  // them. The counts merge into the totals we emit below.
  const writeSanitize = sanitizeModelMessages(
    result.messages as Parameters<typeof sanitizeModelMessages>[0],
  )
  if (!isReportEmpty(writeSanitize.report)) {
    reqLog.warn(
      `write-side sanitize: dropped ${writeSanitize.report.toolCalls} tool-call(s), ${writeSanitize.report.toolResults} orphaned tool-result(s), ${writeSanitize.report.messages} empty message(s) before persist`,
    )
  }
  const persistMessages = writeSanitize.sanitized
  const totalsWithWrite = mergeReports(sanitizationTotals, writeSanitize.report)

  // Roll up overhead (summarizer) into the parent run's tokenUsage
  const overhead = liveSummarizerUsage && liveSummarizerUsage.totalTokens > 0
    ? [{
        kind: "summarizer_live" as const,
        inputTokens: liveSummarizerUsage.inputTokens,
        outputTokens: liveSummarizerUsage.outputTokens,
        totalTokens: liveSummarizerUsage.totalTokens,
        model: liveSummarizerUsage.model,
      }]
    : undefined;
  const overheadTotal = overhead
    ? overhead.reduce((acc, o) => acc + o.totalTokens, 0)
    : 0;
  const tokenUsageWithOverhead = {
    ...result.tokenUsage,
    totalTokens: result.tokenUsage.totalTokens + overheadTotal,
    overhead,
  };

  // Persist completed run
  await storage.agentRuns.completeRun({
    runId: runFile.run.id,
    assistantText: result.assistantText,
    messages: persistMessages,
    proposedOps: result.proposedOps,
    appliedOps,
    tokenUsage: tokenUsageWithOverhead,
  });

  // Surface sanitizer recovery to the user. Aggregate-at-end: one toast
  // per chat completion that had any sanitization, never mid-stream.
  if (!isReportEmpty(totalsWithWrite)) {
    writer.write({
      type: "data-history-sanitized",
      data: totalsWithWrite,
    });
  }

  // Post-stream debit. Idempotent on runId. Fire-and-forget so a debit
  // failure can't leak back into an already-flushed SSE response.
  void debitForLlmRun({
    userId: ownerId,
    runId: runFile.run.id,
    llm: {
      kind: "llm",
      model: result.tokenUsage.model as DreamerSupportedLLM,
      inputTokens: result.tokenUsage.inputTokens,
      outputTokens: result.tokenUsage.outputTokens,
    },
  }).catch((err) => {
    reqLog.warn(`debit failed for run ${runFile.run.id}: ${err}`);
  });

  reqLog.info(
    `completed — ${result.proposedOps.length} proposed, ${appliedOps.length} applied, v${newVersion}`
  );

  // Background: pre-cache history summary for next turn. Tracked in
  // pendingSummaries so shutdown can drain before exit (Railway SIGTERM).
  const runIdForBackground = runFile.run.id;
  const summaryTask = storage.agentRuns.listRunsForThread(input.threadId).then(async (allThreadRuns) => {
    const allCompleted = allThreadRuns.filter((r) => r.run.status === "completed");
    const summaryResult = await generateThreadSummary(allCompleted);
    if (!summaryResult) return;

    await storage.agentRuns.updateThreadSummary(input.threadId, summaryResult.summary);
    await storage.agentRuns.appendOverhead(runIdForBackground, {
      kind: "summarizer_background",
      inputTokens: summaryResult.usage.inputTokens,
      outputTokens: summaryResult.usage.outputTokens,
      totalTokens: summaryResult.usage.totalTokens,
      model: summaryResult.usage.model,
    });
  }).catch(async (err) => {
    reqLog.warn(`background summary cache failed: ${err}`);
    try {
      await storage.agentRuns.updateThreadSummary(input.threadId, { text: "", runCount: 0 });
      reqLog.info("invalidated stale summary cache after background failure");
    } catch (invalidateErr) {
      reqLog.warn(`failed to invalidate summary cache: ${invalidateErr}`);
    }
  });
  trackSummary(summaryTask);

  // Gather child run token usage
  const allRuns = await storage.agentRuns.listRunsForThread(input.threadId);
  const childRuns = allRuns
    .filter((r) => r.run.parentRunId === runFile.run.id && r.tokenUsage)
    .map((r) => ({
      agent: r.run.agent,
      inputTokens: r.tokenUsage?.inputTokens ?? 0,
      outputTokens: r.tokenUsage?.outputTokens ?? 0,
      totalTokens: r.tokenUsage?.totalTokens ?? 0,
      model: r.tokenUsage?.model ?? "unknown",
    }));

  // Send token usage data
  writer.write({
    type: "data-token-usage",
    data: {
      inputTokens: result.tokenUsage.inputTokens,
      outputTokens: result.tokenUsage.outputTokens,
      totalTokens: result.tokenUsage.totalTokens,
      model: result.tokenUsage.model,
      childRuns,
    },
  });

  // Send final result with applied ops and new version
  writer.write({
    type: "data-scene-result",
    data: {
      appliedOps,
      newVersion,
      runId: runFile.run.id,
      tokenUsage: {
        inputTokens: result.tokenUsage.inputTokens,
        outputTokens: result.tokenUsage.outputTokens,
        totalTokens: result.tokenUsage.totalTokens,
        model: result.tokenUsage.model,
        childRuns,
      },
    },
  });

  // Emit trace data
  closeTrace(trace);
  writer.write({
    type: "data-trace" as never,
    data: serializeTrace(trace),
  });
}
