import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { type SceneOp } from "../db/schemas";
import { nonEmptyStringSchema } from "@dreamer/schemas";
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
      // Stream ops to the client as they're produced (after each agent step)
      agentStream.onNewOps((newOps) => {
        writer.write({
          type: "data-scene-ops",
          data: newOps,
        });
      });

      // Merge the AI SDK's UI message stream (text deltas, tool calls, etc.)
      writer.merge(agentStream.uiMessageStream);

      // After the stream finishes, collect final results and apply ops server-side
      const result = await agentStream.collectResult();

      let newVersion = capturedProject.project.version;
      let appliedOps: SceneOp[] = [];

      if (result.proposedOps.length > 0) {
        try {
          const applyResult = await projectRepo.applyOps(capturedProjectId, {
            expectedVersion: capturedExpectedVersion,
            ops: result.proposedOps,
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
        `completed — ${result.proposedOps.length} proposed, ${appliedOps.length} applied, v${newVersion}, ${elapsed}ms`
      );

      // Send final result with applied ops and new version
      writer.write({
        type: "data-scene-result",
        data: { appliedOps, newVersion, runId: runFile.run.id },
      });
    },
    onError(error) {
      const elapsed = (performance.now() - start).toFixed(1);
      reqLog.error(`failed after ${elapsed}ms`, error);

      agentRunRepo.completeRun({
        runId: runFile.run.id,
        proposedOps: [],
        appliedOps: [],
        error: String(error),
      });

      return String(error);
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
});
