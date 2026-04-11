import { Elysia } from "elysia";
import { ZodError } from "zod";
import { runCoreAgent } from "../agents/core/agent";
import { buildSummarizedHistory } from "../agents/history-summarizer";
import { agentRunRepo } from "../db/agent-run-repo";
import { agentRunRequestSchema } from "../db/schemas";
import {
  OpValidationError,
  projectRepo,
  VersionConflictError,
} from "../db/project-repo";
import { createLogger } from "../logger";

const log = createLogger("agent-run");

export const agentRunRoutes = new Elysia({ prefix: "/agent" }).post(
  "/run",
  async ({ body, set }) => {
    try {
      const input = agentRunRequestSchema.parse(body);

      const project = await projectRepo.readProject(input.projectId);
      if (!project) {
        set.status = 404;
        return { error: "Project not found" };
      }
      if (project.project.threadId !== input.threadId) {
        set.status = 400;
        return { error: "threadId does not match project.threadId" };
      }
      if (!project.scenes[input.sceneId]) {
        set.status = 404;
        return { error: "Scene not found" };
      }

      await agentRunRepo.getOrCreateThread(input.threadId, input.projectId);
      const runFile = await agentRunRepo.createRun({
        threadId: input.threadId,
        projectId: input.projectId,
        sceneId: input.sceneId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        agent: "core",
      });
      await agentRunRepo.attachRunToThread(input.threadId, runFile.run.id);

      // Build conversation history from prior runs
      const priorRuns = await agentRunRepo.listRunsForThread(input.threadId);
      const completedRuns = priorRuns.filter(
        (r) => r.run.id !== runFile.run.id && r.run.status === "completed"
      );
      const historyResult = await buildSummarizedHistory(completedRuns);
      const history = historyResult.messages;

      const result = await runCoreAgent({
        prompt: input.prompt,
        project,
        sceneId: input.sceneId,
        runId: runFile.run.id,
        threadId: input.threadId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        parentLog: log,
        history,
        priorRuns: completedRuns,
      });

      let newVersion = project.project.version;
      let appliedOps = [] as typeof result.proposedOps;

      if (result.proposedOps.length > 0) {
        const applyResult = await projectRepo.applyBoardOps(input.projectId, {
          expectedVersion: input.expectedVersion,
          ops: result.proposedOps,
        });
        if (!applyResult) {
          set.status = 404;
          return { error: "Project not found" };
        }
        newVersion = applyResult.newVersion;
        appliedOps = applyResult.appliedOps;
      } else if (input.expectedVersion !== project.project.version) {
        throw new VersionConflictError(
          input.expectedVersion,
          project.project.version
        );
      }

      await agentRunRepo.completeRun({
        runId: runFile.run.id,
        assistantText: result.assistantText,
        messages: result.messages,
        proposedOps: result.proposedOps,
        appliedOps,
        tokenUsage: result.tokenUsage,
      });

      return {
        runId: runFile.run.id,
        sessionId: runFile.run.sessionId,
        assistantText: result.assistantText,
        proposedOps: result.proposedOps,
        appliedOps,
        newVersion,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        set.status = 400;
        return { error: "Invalid request payload", details: error.flatten() };
      }
      if (error instanceof VersionConflictError) {
        set.status = 409;
        return {
          error: "Version conflict",
          expectedVersion: error.expectedVersion,
          currentVersion: error.currentVersion,
        };
      }
      if (error instanceof OpValidationError) {
        set.status = 422;
        return { error: error.message };
      }
      throw error;
    }
  }
);
