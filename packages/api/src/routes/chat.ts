import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { nonEmptyStringSchema } from "@dreamer/schemas";
import type { BoardOp } from "@dreamer/schemas";
import { projectRepo, VersionConflictError, OpValidationError } from "../db/project-repo";
import { agentRunRepo } from "../db/agent-run-repo";
import { buildModelMessagesFromRuns } from "../db/messages";
import { streamCoreAgent } from "../agents/core/agent";
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

  // 4. Build conversation history from prior runs
  const priorRuns = await agentRunRepo.listRunsForThread(input.threadId);
  const completedRuns = priorRuns.filter(
    (r) => r.run.id !== runFile.run.id && r.run.status === "completed"
  );
  const history = buildModelMessagesFromRuns(completedRuns);
  reqLog.debug(`rebuilt ${history.length} history message(s) from ${completedRuns.length} prior run(s)`);

  // 5. Start streaming agent
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

      // Persist completed run
      await agentRunRepo.completeRun({
        runId: runFile.run.id,
        assistantText: result.assistantText,
        messages: result.messages,
        proposedOps: result.proposedOps,
        appliedOps,
      });

      const elapsed = (performance.now() - start).toFixed(1);
      reqLog.info(
        `completed — ${result.proposedOps.length} proposed (${graphOps.length} graph), ${appliedOps.length} applied, v${newVersion}, ${elapsed}ms`
      );

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

      // Send final result with applied ops and new version
      writer.write({
        type: "data-scene-result",
        data: { appliedOps, newVersion, runId: runFile.run.id },
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
});
