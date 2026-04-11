import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { nonEmptyStringSchema } from "@dreamer/schemas";
import type { BoardOp } from "@dreamer/schemas";
import { projectRepo, VersionConflictError, OpValidationError } from "../db/project-repo";
import { agentRunRepo } from "../db/agent-run-repo";
import { buildSummarizedHistory, generateThreadSummary } from "../agents/history-summarizer";
import { streamCoreAgent } from "../agents/core/agent";
import { classifyIntent } from "../agents/intent-classifier";
import { CIRCUIT_TEMPLATES } from "../agents/circuit-templates";
import { makeBoardOp } from "../agents/make-op";
import { boardTracker } from "../db/board-state-tracker";
import { createLogger } from "../logger";

const log = createLogger("chat");
let requestId = 0;

/**
 * Schema for the useChat DefaultChatTransport request body.
 * It sends `messages` (UIMessage[]) plus any custom `body` fields we configured.
 */
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
  "set_pin_mode", "update_sketch", "update_board_settings",
]);

export const chatRoutes = new Elysia().post("/api/chat", async ({ body, set }) => {
  const id = ++requestId;
  const start = performance.now();
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

  // 1. Read or bootstrap project
  let project = await projectRepo.readProject(input.projectId);
  if (!project) {
    reqLog.info(`project ${input.projectId} not found, creating`);
    project = await projectRepo.getOrCreateProject({ id: input.projectId });
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
  await agentRunRepo.getOrCreateThread(input.threadId, input.projectId);

  // 3. Create core agent run
  const runFile = await agentRunRepo.createRun({
    threadId: input.threadId,
    projectId: input.projectId,
    sceneId: input.sceneId,
    sessionId: input.sessionId,
    prompt,
    agent: "core",
  });
  await agentRunRepo.attachRunToThread(input.threadId, runFile.run.id);
  reqLog.info(`created run: ${runFile.run.id}`);

  // 4. Classify intent — template or agent?
  const intent = classifyIntent(prompt);

  if (intent.type === "template") {
    reqLog.info(`template match: ${intent.template}, additive: ${intent.additive}`);
    const templateFn = CIRCUIT_TEMPLATES[intent.template];
    if (templateFn && project.boardState) {
      const opCtx = {
        projectId: input.projectId,
        sceneId: input.sceneId,
        expectedVersion: input.expectedVersion,
      };

      // Clear existing board unless the user wants to add to it
      const clearOps: BoardOp[] = [];
      if (!intent.additive) {
        const board = project.boardState;
        // Remove all wires first (to avoid orphan issues)
        for (const wireId of Object.keys(board.wires)) {
          clearOps.push(makeBoardOp(opCtx, {
            kind: "remove_wire",
            payload: { wireId },
          }));
        }
        // Remove all components (except arduino_uno)
        for (const comp of Object.values(board.components)) {
          if (comp.type === "arduino_uno") continue;
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
        await projectRepo.applyBoardOps(input.projectId, {
          expectedVersion: input.expectedVersion,
          ops: templateOps,
        });
        boardTracker.applyOps(input.projectId, templateOps, project.boardState);
      } catch (err) {
        reqLog.warn(`template op application failed: ${err}`);
      }

      // Complete the run record
      await agentRunRepo.completeRun({
        runId: runFile.run.id,
        assistantText: result.description,
        messages: [{ role: "assistant" as const, content: result.description }],
        proposedOps: templateOps,
        appliedOps: templateOps,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, model: "template" },
      });

      // Stream the response
      const uiStream = createUIMessageStream({
        async execute({ writer }) {
          // Send ops to client
          writer.write({ type: "data-scene-ops", data: templateOps });

          // Send assistant text as deltas
          const msgId = crypto.randomUUID();
          writer.write({ type: "text-start", id: msgId });
          writer.write({ type: "text-delta", delta: result.description, id: msgId });
          writer.write({ type: "text-end", id: msgId });

          // Send result metadata
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
        },
      });

      const elapsed = (performance.now() - start).toFixed(1);
      reqLog.info(`template completed — ${templateOps.length} ops, ${elapsed}ms`);

      return createUIMessageStreamResponse({ stream: uiStream });
    }
  }

  // 5. Build conversation history from prior runs (agent path)
  const priorRuns = await agentRunRepo.listRunsForThread(input.threadId);
  const cachedSummary = await agentRunRepo.readThreadSummary(input.threadId);
  const completedRuns = priorRuns.filter(
    (r) => r.run.id !== runFile.run.id && r.run.status === "completed"
  );
  const historyResult = await buildSummarizedHistory(completedRuns, cachedSummary);
  const history = historyResult.messages;
  const liveSummarizerUsage = historyResult.usage;
  reqLog.debug(`rebuilt ${history.length} history message(s) from ${completedRuns.length} prior run(s)`);
  if (liveSummarizerUsage) {
    reqLog.info(
      `live summarizer overhead: ${liveSummarizerUsage.totalTokens} tokens (${liveSummarizerUsage.model})`
    );
  }

  // 6. Start streaming agent
  const agentStream = streamCoreAgent({
    prompt,
    project,
    sceneId: input.sceneId,
    runId: runFile.run.id,
    threadId: input.threadId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    parentLog: reqLog,
    history,
    priorRuns: completedRuns,
  });

  // Capture values for the stream execute callback
  const capturedExpectedVersion = input.expectedVersion;
  const capturedProjectId = input.projectId;
  const capturedProject = project;

  const uiStream = createUIMessageStream({
    async execute({ writer }) {
      // Stream board ops to the client as they're produced (after each agent step)
      // Graph ops are NOT streamed here — they are sent once after collectResult()
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

      // Merge the AI SDK's UI message stream (text deltas, tool calls, etc.)
      writer.merge(agentStream.uiMessageStream);

      // After the stream finishes, collect final results and apply ops server-side
      const result = await agentStream.collectResult();

      let newVersion = capturedProject.project.version;
      let appliedOps: BoardOp[] = [];

      // Separate graph ops from board ops
      const boardOps = result.proposedOps.filter(
        (op) => BOARD_OP_KINDS.has(op.kind)
      );
      const graphOps = result.proposedOps.filter(
        (op) => GRAPH_OP_KINDS.has(op.kind)
      );

      if (boardOps.length > 0) {
        try {
          const applyResult = await projectRepo.applyBoardOps(capturedProjectId, {
            expectedVersion: capturedExpectedVersion,
            ops: boardOps,
          });
          if (applyResult) {
            newVersion = applyResult.newVersion;
            appliedOps = applyResult.appliedOps;
            boardTracker.applyOps(capturedProjectId, appliedOps, capturedProject.boardState);
          }
        } catch (err) {
          if (err instanceof VersionConflictError) {
            reqLog.warn(
              `version conflict: expected ${err.expectedVersion}, current ${err.currentVersion}`
            );
          } else if (err instanceof OpValidationError) {
            reqLog.warn(`op validation error: ${err.message}`);
          } else if (err instanceof ZodError) {
            reqLog.warn(`op schema validation error: ${err.message}`);
          } else {
            throw err;
          }
        }
      }

      // Roll up overhead (summarizer) into the parent run's tokenUsage so
      // eval sees the true per-turn cost. Live summarizer runs blocked this
      // request; background ones don't (yet) but we reserve the slot.
      const overhead = liveSummarizerUsage
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
      await agentRunRepo.completeRun({
        runId: runFile.run.id,
        assistantText: result.assistantText,
        messages: result.messages,
        proposedOps: result.proposedOps,
        appliedOps,
        tokenUsage: tokenUsageWithOverhead,
      });

      const elapsed = (performance.now() - start).toFixed(1);
      reqLog.info(
        `completed — ${result.proposedOps.length} proposed (${graphOps.length} graph), ${appliedOps.length} applied, v${newVersion}, ${elapsed}ms`
      );

      // Fire-and-forget: pre-cache history summary for next turn. The tokens
      // burned here are attributed to THIS run's overhead — otherwise they're
      // invisible to eval/token-analyzer.
      const runIdForBackground = runFile.run.id;
      agentRunRepo.listRunsForThread(input.threadId).then(async (allThreadRuns) => {
        const allCompleted = allThreadRuns.filter((r) => r.run.status === "completed");
        const result = await generateThreadSummary(allCompleted);
        if (!result) return;

        await agentRunRepo.updateThreadSummary(input.threadId, result.summary);
        // Attribute the background summarizer cost to the run that triggered it
        await agentRunRepo.appendOverhead(runIdForBackground, {
          kind: "summarizer_background",
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          model: result.usage.model,
        });
      }).catch((err) => {
        reqLog.warn(`background summary cache failed: ${err}`);
      });

      // Apply graph ops to the project file server-side so they persist
      if (graphOps.length > 0) {
        try {
          const currentProject = await projectRepo.readProject(capturedProjectId);
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
            await projectRepo.saveGraph(capturedProjectId, graph);
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

      // Gather child run token usage (from delegated agents)
      const allRuns = await agentRunRepo.listRunsForThread(input.threadId);
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
    },
    onError(error) {
      const elapsed = (performance.now() - start).toFixed(1);
      reqLog.error(`failed after ${elapsed}ms`, error);

      // Mark the run as failed so it doesn't stay stuck in "running" status
      agentRunRepo.completeRun({
        runId: runFile.run.id,
        proposedOps: [],
        appliedOps: [],
        error: String(error),
      }).catch((err) => {
        reqLog.warn(`failed to mark run as errored: ${err}`);
      });

      return String(error);
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}).get("/api/threads/:threadId/messages", async ({ params, set }) => {
  const { threadId } = params;
  if (!threadId) {
    set.status = 400;
    return { error: "threadId is required" };
  }

  const runs = await agentRunRepo.listRunsForThread(threadId);
  const completedCoreRuns = runs.filter(
    (r) => r.run.status === "completed" && r.run.agent === "core"
  );

  // Convert runs to UIMessage format for the frontend
  type ChatUIMessage = {
    id: string;
    role: "user" | "assistant";
    parts: Array<{ type: "text"; text: string }>;
  };

  const messages: ChatUIMessage[] = [];
  for (const run of completedCoreRuns) {
    // User message
    messages.push({
      id: `${run.run.id}-user`,
      role: "user",
      parts: [{ type: "text", text: run.prompt }],
    });
    // Assistant message (final text only — skip tool calls for display)
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
