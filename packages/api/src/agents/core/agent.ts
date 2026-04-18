import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools, summarizeBoardState } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { BoardOp, BoardState } from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";
import { routeRequest, type RoutingDecision } from "../router";
import { boardTracker } from "../../db/board-state-tracker";
import { agentRunRepo } from "../../db/agent-run-repo";
import { runPolicies } from "../policy-engine";
import { generatePlan, type AgentPlan, type PlannerUsage } from "../planner";
import { reflectOnOutput, shouldReplan } from "../reflection";
import { normalizeAgentPrompt } from "../prompt-normalizer";
import { AGENT_VERSION } from "../version";
import {
  CORE_PROMPT_SNAPSHOTS,
  DEFAULT_CORE_PROMPT_SNAPSHOT,
} from "./prompts";

// ── Model context limits (used for message sizing) ──────────────────────

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
};

/** Reserve tokens for system prompt, tools schema, and output. */
const RESERVED_TOKENS = 20_000;

/** Rough chars-per-token estimate for sizing. */
const CHARS_PER_TOKEN = 3.5;

export type CoreAgentStream = {
  uiMessageStream: ReturnType<ReturnType<typeof streamText>["toUIMessageStream"]>
  ops: BoardOp[]
  onNewOps: (cb: (ops: BoardOp[]) => void) => void
  collectResult: () => Promise<AgentResult>
  /** The plan generated before the tool loop, if any. */
  getPlan: () => AgentPlan | undefined
  /** Planner token usage, for overhead attribution. */
  getPlannerUsage: () => PlannerUsage | undefined
  /** Abort the in-flight streamText call. Used to wire Ctrl+C / user cancellation. */
  abort: (reason?: string) => void
}

// ── Tool result compaction (used by prepareStep) ────────────────────────
//
// Between steps, older tool results are replaced with compact summaries.
// This cuts the conversation accumulation from ~82% of input tokens to
// ~30-40%, since each step no longer re-sends full layout dumps, wiring
// guides, and board state payloads from earlier steps.

function compactToolResult(toolName: string, value: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case "get_wiring_guide":
      return { guide: "[wiring guide — already in system prompt]" };

    case "get_board_state":
      return { compacted: true, note: "Full board state from earlier step. Use get_board_overview for current state." };

    case "get_board_overview":
      // Board summary is already injected into the system prompt — no need to
      // re-send it in compacted steps.
      return { compacted: true, note: "See system prompt for current board state." };

    case "propose_circuit": {
      // Keep success/failure status and key metrics, drop verbose layout
      const compact: Record<string, unknown> = {
        success: value.success,
      };
      if (value.errors) compact.errors = value.errors;
      if (value.hint) compact.hint = value.hint;
      if (value.componentsPlaced) compact.componentsPlaced = value.componentsPlaced;
      if (value.wiresCreated) compact.wiresCreated = value.wiresCreated;
      if (value.sketchUpdated !== undefined) compact.sketchUpdated = value.sketchUpdated;
      if (value.sketchError) compact.sketchError = value.sketchError;
      // Drop layout (the verbose per-component placement dump)
      if (value.layout) compact.layout = "[layout details omitted — use list_components for current state]";
      return compact;
    }

    case "propose_fix": {
      // Same pattern as propose_circuit — keep status + metrics, drop layout
      const compact: Record<string, unknown> = {
        success: value.success,
      };
      if (value.errors) compact.errors = value.errors;
      if (value.summary) compact.summary = value.summary;
      if (value.componentsAdded) compact.componentsAdded = value.componentsAdded;
      if (value.componentsRemoved) compact.componentsRemoved = value.componentsRemoved;
      if (value.wiresCreated) compact.wiresCreated = value.wiresCreated;
      if (value.wiresRemoved) compact.wiresRemoved = value.wiresRemoved;
      if (value.sketchUpdated !== undefined) compact.sketchUpdated = value.sketchUpdated;
      if (value.attemptsRemaining !== undefined) compact.attemptsRemaining = value.attemptsRemaining;
      if (value.layout) compact.layout = "[layout details omitted — use list_components for current state]";
      return compact;
    }

    case "list_components": {
      // Summarize to count + IDs only
      const components = value.components as Array<{ id: string; type: string; name: string }> | undefined;
      if (components && components.length > 3) {
        return {
          componentCount: components.length,
          types: [...new Set(components.map((c) => c.type))].join(", "),
          note: "[full list omitted — use list_components for current state]",
        };
      }
      return value;
    }

    case "list_wires": {
      const wires = value.wires as unknown[] | undefined;
      if (wires && wires.length > 4) {
        return { wireCount: wires.length, note: "[full list omitted]" };
      }
      return value;
    }

    case "analyze_power_budget": {
      // Keep safety verdict and issues, drop full pin/rail breakdown
      const report = value.report as Record<string, unknown> | undefined;
      if (report) {
        return {
          safe: value.safe,
          issueCount: (report.issues as unknown[] | undefined)?.length ?? 0,
          estimatedTotalCurrentMa: report.estimatedTotalCurrentMa,
        };
      }
      return { safe: value.safe };
    }

    case "get_sketch_code": {
      // Truncate long sketch code
      if (typeof value.sketchCode === "string" && value.sketchCode.length > 150) {
        return { sketchCode: value.sketchCode.slice(0, 100) + "...[truncated, use get_sketch_code for current]" };
      }
      return value;
    }

    default: {
      // Generic: truncate any string values over 200 chars
      const compact: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "string" && v.length > 200) {
          compact[k] = v.slice(0, 150) + "...[truncated]";
        } else {
          compact[k] = v;
        }
      }
      return compact;
    }
  }
}

// ── Message sizing ──────────────────────────────────────────────────────

function estimateTokens(messages: ModelMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === "object" && part !== null && "text" in part) {
          chars += (part as { text: string }).text.length;
        }
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Trim history messages to fit within the model's context budget.
 * Removes oldest history messages first, keeping system + user prompt.
 */
function sizeMessagesToModel(
  messages: ModelMessage[],
  model: string,
): ModelMessage[] {
  const limit = MODEL_CONTEXT_LIMITS[model] ?? 200_000;
  const budget = limit - RESERVED_TOKENS;

  let estimated = estimateTokens(messages);
  if (estimated <= budget) return messages;

  // messages layout: [system, ...history, user]
  // Remove from history (index 1 to len-2) starting from oldest
  const result = [...messages];
  let historyStart = 1;
  const historyEnd = result.length - 1; // keep last user message

  while (estimated > budget && historyStart < historyEnd) {
    const removed = result.splice(historyStart, 1)[0];
    if (removed) {
      const removedTokens = estimateTokens([removed]);
      estimated -= removedTokens;
    }
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────

export function streamCoreAgent(ctx: AgentContext): CoreAgentStream {
  const log = ctx.parentLog.child("core-agent");
  const start = performance.now();
  const ops: BoardOp[] = [];
  const normalization = normalizeAgentPrompt(ctx.prompt);
  const agentPrompt = normalization.shouldUseNormalizedPrompt
    ? normalization.normalizedPrompt
    : ctx.prompt;

  // Use the boardTracker's live state if it's ahead of the project snapshot
  // passed in, so the router sees the most recent tentative state.
  const trackedForRouter = boardTracker.get(ctx.projectId);
  const projectForRouter = trackedForRouter
    ? { ...ctx.project, boardState: trackedForRouter }
    : ctx.project;

  const decision: RoutingDecision = routeRequest({
    prompt: ctx.prompt,
    project: projectForRouter,
    priorRuns: ctx.priorRuns,
  });
  const CORE_MODEL = decision.model;
  const mode = decision.toolMode;
  const snapshotVersion = ctx.snapshotVersion ?? AGENT_VERSION;
  const snapshotPrompts =
    CORE_PROMPT_SNAPSHOTS[snapshotVersion] ??
    CORE_PROMPT_SNAPSHOTS[AGENT_VERSION] ??
    DEFAULT_CORE_PROMPT_SNAPSHOT;

  log.info(
    `routing — model: ${CORE_MODEL}, mode: ${mode}, domain: ${decision.domain}, requestType: ${decision.requestType}, complexity: ${decision.complexity}, snapshot: ${snapshotVersion}`
  );
  for (const r of decision.reasons) {
    log.info(`  reason: ${r}`);
  }
  log.info(
    `starting — prompt: ${ctx.prompt.slice(0, 100)}`
  );
  if (normalization.shouldUseNormalizedPrompt) {
    log.info(
      `prompt normalized for execution — components: ${
        normalization.detectedComponents.length > 0
          ? normalization.detectedComponents.join(", ")
          : "none"
      }`
    );
  }

  // Shared working board between core tools and delegated specialists.
  const trackedBoard = boardTracker.get(ctx.projectId);
  const workingBoard: BoardState = structuredClone(
    trackedBoard ?? ctx.project.boardState ?? createDefaultBoardState()
  );

  const { tools, isSketchRecoveryAbandoned } = createCoreTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
    mode,
    workingBoard,
  });
  const availableTools = Object.keys(tools).sort();

  // Persist routing + concrete tool inventory on the run file so version
  // comparisons can track actual tool-surface changes over time.
  agentRunRepo
    .setRouting(ctx.runId, { ...decision, availableTools })
    .catch((err) => {
      log.warn(`failed to persist routing decision: ${err}`);
    });

  const boardSummary = summarizeBoardState({ ...ctx.project, boardState: workingBoard });
  const systemPrompt =
    mode === "build"
      ? snapshotPrompts.buildPrompt
      : mode === "edit"
        ? snapshotPrompts.editPrompt
        : snapshotPrompts.editPrompt;

  // Size messages to fit model context
  const rawMessages: ModelMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n## Current Board State\n${boardSummary}`,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...(ctx.history ?? []),
    { role: "user", content: agentPrompt },
  ];
  const messages = sizeMessagesToModel(rawMessages, CORE_MODEL);

  let stepCount = 0;
  let opsEmitted = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  const workflowToolUsage = new Map<string, {
    tool: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }>();
  const workflowUnattributed = {
    "[prompt/system]": 0,   // step 1 — carries the full system prompt
    "[reasoning]": 0,       // mid-run text-only steps
    "[final_response]": 0,  // terminal stop step with no tool calls
  };
  const opsCallbacks: Array<(newOps: BoardOp[]) => void> = [];
  const abortController = new AbortController();

  // Plan state (populated asynchronously before stream starts)
  let plan: AgentPlan | undefined;
  let plannerUsage: PlannerUsage | undefined;

  // Generate plan in parallel with stream setup (fire-and-forget into the
  // plan variable — the stream doesn't block on it, but collectResult uses it)
  const planPromise = generatePlan({
    prompt: ctx.prompt,
    boardSummary,
    routing: decision,
  }).then((result) => {
    plan = result.plan;
    plannerUsage = result.usage;
    log.info(`plan: ${plan.summary} (${plan.steps.length} steps, destructive: ${plan.isDestructive})`);
  }).catch((err) => {
    log.warn(`plan generation failed (non-blocking): ${err}`);
  });

  const stream = streamText({
    model: anthropic(CORE_MODEL),
    tools,
    messages,
    stopWhen: stepCountIs(10),
    abortSignal: abortController.signal,

    // ── Message compaction ──────────────────────────────────────────
    // Each step re-sends the full conversation. Tool results (especially
    // propose_circuit layouts, wiring guides, board state dumps) are
    // very heavy. After step 2, compact older tool results to cut the
    // ~82% accumulation overhead.
    prepareStep({ messages: stepMessages, stepNumber }) {
      if (stepNumber < 2) return {};

      // After step 4, shrink the window to 1 pair (2 messages) — by then the
      // system prompt already carries the board summary, so older pairs add
      // cost without adding signal. Steps 2–3 keep 2 pairs (4 messages) for
      // continuity during the initial propose_circuit→fix loop.
      const KEEP_RECENT = stepNumber >= 4 ? 2 : 4;
      const systemEnd = stepMessages.findIndex((m) => m.role !== "system") || 1;
      const compactEnd = Math.max(systemEnd, stepMessages.length - KEEP_RECENT);

      if (compactEnd <= systemEnd) return {};

      const compacted = stepMessages.map((msg, idx) => {
        // Keep system prompt and recent messages untouched
        if (idx < systemEnd || idx >= compactEnd) return msg;

        // Compact tool results (role: "tool") — these are the heaviest
        if (msg.role === "tool" && Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part: unknown) => {
              const p = part as { type?: string; toolName?: string; output?: unknown };
              if (p.type !== "tool-result" || !p.output) return part;

              const output = p.output as { type?: string; value?: unknown };
              if (output.type !== "json" || !output.value) return part;

              const value = output.value as Record<string, unknown>;
              const summary = compactToolResult(p.toolName ?? "", value);
              return { ...p, output: { type: "json", value: summary } };
            }),
          };
        }

        // Compact assistant tool-call inputs — truncate large sketch payloads
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part: unknown) => {
              const p = part as { type?: string; input?: Record<string, unknown> };
              if (p.type !== "tool-call" || !p.input) return part;

              const input = p.input;
              if (typeof input.sketch === "string" && input.sketch.length > 100) {
                return { ...p, input: { ...input, sketch: input.sketch.slice(0, 80) + "...[truncated]" } };
              }
              if (typeof input.task === "string" && input.task.length > 200) {
                return { ...p, input: { ...input, task: input.task.slice(0, 150) + "...[truncated]" } };
              }
              return part;
            }),
          };
        }

        return msg;
      });

      const originalChars = JSON.stringify(stepMessages).length;
      const compactedChars = JSON.stringify(compacted).length;
      const saved = originalChars - compactedChars;
      if (saved > 1000) {
        log.info(
          `prepareStep ${stepNumber}: compacted ${(saved / 1000).toFixed(1)}K chars (${((saved / originalChars) * 100).toFixed(0)}% reduction)`,
        );
      }

      return { messages: compacted as ModelMessage[] };
    },

    onError({ error }) {
      log.error("streamText error", error);
    },
    onStepFinish({ toolCalls, usage, finishReason }) {
      stepCount++;
      const elapsed = (performance.now() - start).toFixed(1);
      for (const call of toolCalls) {
        log.info(`tool [${call.toolName}]`, call.input);
      }
      if (usage) {
        totalInputTokens += usage.inputTokens ?? 0;
        totalOutputTokens += usage.outputTokens ?? 0;
        totalCacheReadTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0;
        totalCacheWriteTokens += usage.inputTokenDetails?.cacheWriteTokens ?? 0;

        const stepInput = usage.inputTokens ?? 0;
        const stepOutput = usage.outputTokens ?? 0;
        const stepCacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
        const stepCacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
        const stepTotal = stepInput + stepOutput;

        if (toolCalls.length > 0) {
          const count = toolCalls.length;
          const baseInput = Math.floor(stepInput / count);
          const remInput = stepInput % count;
          const baseOutput = Math.floor(stepOutput / count);
          const remOutput = stepOutput % count;
          const baseCacheRead = Math.floor(stepCacheRead / count);
          const remCacheRead = stepCacheRead % count;
          const baseCacheWrite = Math.floor(stepCacheWrite / count);
          const remCacheWrite = stepCacheWrite % count;

          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            const tool = call.toolName;
            const inputShare = baseInput + (i < remInput ? 1 : 0);
            const outputShare = baseOutput + (i < remOutput ? 1 : 0);
            const cacheReadShare = baseCacheRead + (i < remCacheRead ? 1 : 0);
            const cacheWriteShare = baseCacheWrite + (i < remCacheWrite ? 1 : 0);
            const existing = workflowToolUsage.get(tool) ?? {
              tool,
              calls: 0,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            };
            existing.calls += 1;
            existing.inputTokens += inputShare;
            existing.outputTokens += outputShare;
            existing.totalTokens += inputShare + outputShare;
            existing.cacheReadTokens += cacheReadShare;
            existing.cacheWriteTokens += cacheWriteShare;
            workflowToolUsage.set(tool, existing);
          }
        } else {
          // Categorise text-only steps so the breakdown is meaningful:
          // step 1 always carries the full system prompt; the final stop is
          // the assistant's closing response; everything else is mid-run reasoning.
          const category =
            stepCount === 1
              ? "[prompt/system]"
              : finishReason === "stop"
                ? "[final_response]"
                : "[reasoning]";
          workflowUnattributed[category] += stepTotal;
        }
      }
      const cacheRead = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
      const cacheWrite = usage?.inputTokenDetails?.cacheWriteTokens ?? 0;
      log.info(
        `step ${stepCount} — reason: ${finishReason}, +${elapsed}ms`,
        usage
          ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              ...(cacheRead > 0 ? { cacheRead } : {}),
              ...(cacheWrite > 0 ? { cacheWrite } : {}),
            }
          : undefined
      );

      // Emit any new ops that were added during this step
      if (ops.length > opsEmitted && opsCallbacks.length > 0) {
        const newOps = ops.slice(opsEmitted);
        opsEmitted = ops.length;
        for (const cb of opsCallbacks) cb(newOps);
      }

      // Hard-stop expensive loops once sketch recovery is exhausted.
      if (isSketchRecoveryAbandoned()) {
        log.warn("aborting core stream early: sketch recovery abandoned");
        abortController.abort();
      }
    },
  });

  function buildTokenUsage(totalOverride?: number): AgentResult["tokenUsage"] {
    const plannerTokens = plannerUsage?.totalTokens ?? 0;
    const total = totalOverride ?? (totalInputTokens + totalOutputTokens + plannerTokens);
    const workflowRows = Array.from(workflowToolUsage.values())
      .filter((row) => row.calls > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .map((row) => ({
        tool: row.tool,
        calls: row.calls,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        cacheReadTokens: row.cacheReadTokens > 0 ? row.cacheReadTokens : undefined,
        cacheWriteTokens: row.cacheWriteTokens > 0 ? row.cacheWriteTokens : undefined,
      }));
    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: total,
      model: CORE_MODEL,
      cacheReadTokens: totalCacheReadTokens > 0 ? totalCacheReadTokens : undefined,
      cacheWriteTokens: totalCacheWriteTokens > 0 ? totalCacheWriteTokens : undefined,
      workflow:
        workflowRows.length > 0 || Object.values(workflowUnattributed).some(v => v > 0)
          ? {
              attribution: "step_usage_allocation",
              byTool: [
                ...workflowRows,
                // Append named unattributed buckets as pseudo-tool rows so
                // the dashboard can show them without a separate "unattributed" line.
                ...(Object.entries(workflowUnattributed)
                  .filter(([, v]) => v > 0)
                  .map(([label, tokens]) => ({
                    tool: label,
                    calls: 1,
                    inputTokens: tokens,
                    outputTokens: 0,
                    totalTokens: tokens,
                  }))),
              ],
              unattributedTokens: 0,
            }
          : undefined,
    };
  }

  async function collectResult(): Promise<AgentResult> {
    // Ensure plan has resolved before we use it
    await planPromise;

    let text = "";
    let allMessages: ModelMessage[] = [];
    try {
      text = await stream.text;
      allMessages = (await stream.response).messages as ModelMessage[];
    } catch (err) {
      if (!isSketchRecoveryAbandoned()) {
        throw err;
      }
      log.warn(`stream aborted after sketch recovery abandonment: ${String(err)}`);
    }
    const elapsed = (performance.now() - start).toFixed(1);

    // Include planner overhead in end-to-end total
    const plannerTokens = plannerUsage?.totalTokens ?? 0;
    const endToEndTotal = totalInputTokens + totalOutputTokens + plannerTokens;

    const cacheRatio = totalInputTokens > 0
      ? ((totalCacheReadTokens / totalInputTokens) * 100).toFixed(0)
      : "0";
    log.info(
      `completed — ${ops.length} ops, ${stepCount} steps, ${elapsed}ms, tokens: ${totalInputTokens + totalOutputTokens} (cache read: ${totalCacheReadTokens}, cache write: ${totalCacheWriteTokens}, cache hit: ${cacheRatio}%), planner tokens: ${plannerTokens}`
    );

    // Check if sketch recovery was abandoned — if so, return early with explanation
    if (isSketchRecoveryAbandoned()) {
      log.warn("sketch recovery abandoned — returning failure explanation");
      const abandonText = text || "I wasn't able to fix the sketch code after multiple attempts. The transpiler kept reporting errors. You may need to write the sketch manually or simplify the circuit design.";
      return {
        assistantText: abandonText,
        proposedOps: [],
        messages: allMessages,
        tokenUsage: buildTokenUsage(endToEndTotal),
      };
    }

    const opCtx = {
      projectId: ctx.projectId,
      sceneId: ctx.sceneId,
      expectedVersion: ctx.project.project.version,
    };

    // Run externalized policy engine (replaces inline power/routing checks)
    const policyResult = runPolicies({
      workingBoard,
      proposedOps: ops,
      opCtx,
    });

    // Append remediation ops
    const remediationNotes: string[] = [];
    for (const remediation of policyResult.remediations) {
      ops.push(...remediation.ops);
      remediationNotes.push(remediation.note);
    }

    if (policyResult.blocked) {
      log.warn(`policy engine blocked: ${policyResult.violations.length} violation(s)`);
      return {
        assistantText: policyResult.blockReason ?? "Operation blocked by safety policy.",
        proposedOps: [],
        messages: allMessages,
        tokenUsage: buildTokenUsage(endToEndTotal),
      };
    }

    // Reflection: check if output matches intent (non-blocking, best-effort)
    let reflectionAdjustment: string | undefined;
    try {
      const boardSummaryAfter = summarizeBoardState({ ...ctx.project, boardState: workingBoard });
      const reflection = await reflectOnOutput({
        originalPrompt: ctx.prompt,
        plan,
        assistantText: text,
        opsCount: ops.length,
        boardSummaryAfter,
      });

      // Add reflection overhead to total
      const reflectionTokens = reflection.usage.totalTokens;

      if (shouldReplan({
        reflection: reflection.result,
        stepsUsed: stepCount,
        maxSteps: 10,
        replanCount: 0,
      })) {
        reflectionAdjustment = reflection.result.suggestedAdjustment;
        log.info(`reflection suggests re-plan: ${reflectionAdjustment}`);
        // Note: actual re-entry into the loop would require restructuring
        // streamText to be resumable. For now, we append the suggestion
        // to the assistant text so it's visible.
      }

      // Adjust end-to-end total for reflection cost
      const adjustedTotal = endToEndTotal + reflectionTokens;

      const finalText = [
        text,
        ...(remediationNotes.length > 0 ? [`\nSafety note: ${remediationNotes.join(" ")}`] : []),
        ...(reflectionAdjustment ? [`\nNote: I noticed this may not fully match your request. ${reflectionAdjustment}`] : []),
      ].join("");

      return {
        assistantText: finalText,
        proposedOps: ops,
        messages: allMessages,
        tokenUsage: buildTokenUsage(adjustedTotal),
      };
    } catch (reflectionErr) {
      // Reflection is best-effort — don't fail the whole request
      log.warn(`reflection failed (non-blocking): ${reflectionErr}`);
    }

    const finalText =
      remediationNotes.length > 0
        ? `${text}\n\nSafety note: ${remediationNotes.join(" ")}`
        : text;

    return {
      assistantText: finalText,
      proposedOps: ops,
      messages: allMessages,
      tokenUsage: buildTokenUsage(),
    };
  }

  function onNewOps(cb: (newOps: BoardOp[]) => void) {
    opsCallbacks.push(cb);
  }

  return {
    uiMessageStream: stream.toUIMessageStream(),
    ops,
    onNewOps,
    collectResult,
    getPlan: () => plan,
    getPlannerUsage: () => plannerUsage,
    abort: (reason?: string) => {
      if (!abortController.signal.aborted) {
        log.info(`aborting stream${reason ? ` (${reason})` : ""}`);
        abortController.abort(reason);
      }
    },
  };
}

export async function runCoreAgent(ctx: AgentContext): Promise<AgentResult> {
  return streamCoreAgent(ctx).collectResult();
}
