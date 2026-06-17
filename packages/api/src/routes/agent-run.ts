import { Elysia } from "elysia";
import { ZodError } from "zod";
import { runCoreAgent } from "../agents/core/agent";
import { resolveAgentSnapshotVersion } from "../agents/version";
import { buildSummarizedHistory } from "../agents/history-summarizer";
import {
  isReportEmpty,
  sanitizeModelMessages,
} from "../agents/sanitize-messages";
import { agentRunRequestSchema } from "../db/schemas";
import {
  OpValidationError,
  storage,
  VersionConflictError,
} from "../db";
import { createLogger } from "../logger";
import type { AuthContext } from "../auth/context";
import { authPlugin } from "../auth/auth-plugin";
import { requireRateLimit, RateLimitError } from "../auth/rate-limit";
import { auditLog } from "../auth/audit-log";

const log = createLogger("agent-run");

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route");
  return auth.userId;
}

export const agentRunRoutes = new Elysia({ prefix: "/agent" }).use(authPlugin).post(
  "/run",
  async ({ auth, body, set }) => {
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

    try {
      const input = agentRunRequestSchema.parse(body);

      void auditLog({
        userId: ownerId,
        action: "agent.run",
        projectId: input.projectId,
      });

      const project = await storage.projects.readProject(input.projectId, ownerId);
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

      await storage.agentRuns.getOrCreateThread(input.threadId, input.projectId);
      const snapshotVersion = resolveAgentSnapshotVersion(input.snapshotVersion);
      const runFile = await storage.agentRuns.createRun({
        threadId: input.threadId,
        projectId: input.projectId,
        sceneId: input.sceneId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        agent: "core",
        snapshotVersion,
      });
      await storage.agentRuns.attachRunToThread(input.threadId, runFile.run.id);

      // Build conversation history from prior runs
      const priorRuns = await storage.agentRuns.listRunsForThread(input.threadId);
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
        snapshotVersion,
        parentLog: log,
        history,
        priorRuns: completedRuns,
      });

      let newVersion = project.project.version;
      let appliedOps = [] as typeof result.proposedOps;

      if (result.proposedOps.length > 0) {
        const applyResult = await storage.projects.applyBoardOps(
          input.projectId,
          ownerId,
          {
            expectedVersion: input.expectedVersion,
            ops: result.proposedOps,
          },
        );
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

      // Write-side sanitize: scrub any tool-call blocks the model emitted
      // with non-object input before they land in DB. Mid-stream guard
      // already drops them for replay; this closes the persistence loop.
      const writeSanitize = sanitizeModelMessages(
        result.messages as Parameters<typeof sanitizeModelMessages>[0],
      );
      if (!isReportEmpty(writeSanitize.report)) {
        log.warn(
          `agent-run write-side sanitize: dropped ${writeSanitize.report.toolCalls} tool-call(s), ${writeSanitize.report.toolResults} orphaned tool-result(s) before persist`,
        );
      }

      await storage.agentRuns.completeRun({
        runId: runFile.run.id,
        assistantText: result.assistantText,
        messages: writeSanitize.sanitized,
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
