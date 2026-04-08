import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools, summarizeBoardState } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { BoardOp } from "@dreamer/schemas";

const SYSTEM_PROMPT = `You are the Dreamer Arduino simulator assistant. You build and debug Arduino Uno circuits on a virtual breadboard.

Breadboard: 30 rows (y:0-29) × 10 cols (x:0-9). Left bus: cols 0-4. Right bus: cols 5-9. Gap between 4 and 5.
Arduino pin wires: fromRow=-999, fromCol=pin# (D13=13, A0=14, 5V=-1, GND=-3). Set all component pins to null.
Call get_wiring_guide before placing components if you need footprint, pin name, or wiring pattern details.
Board state is below — don't call get_board_state unless you need a mid-turn refresh. Be concise.
IMPORTANT: Batch independent tool calls in a single response to minimize round-trips. Place all components together, then wire them all together.`;

export type CoreAgentStream = {
  uiMessageStream: ReturnType<ReturnType<typeof streamText>["toUIMessageStream"]>
  ops: BoardOp[]
  onNewOps: (cb: (ops: BoardOp[]) => void) => void
  collectResult: () => Promise<AgentResult>
}

export function streamCoreAgent(ctx: AgentContext): CoreAgentStream {
  const log = ctx.parentLog.child("core-agent");
  const start = performance.now();
  const ops: BoardOp[] = [];

  log.info(`starting — prompt: ${ctx.prompt.slice(0, 100)}`);

  const tools = createCoreTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
    delegation: {
      project: ctx.project,
      sceneId: ctx.sceneId,
      threadId: ctx.threadId,
      projectId: ctx.projectId,
      sessionId: ctx.sessionId,
      parentRunId: ctx.runId,
      parentLog: log,
    },
  });

  const boardSummary = summarizeBoardState(ctx.project);

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\n## Current Board State\n${boardSummary}`,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...(ctx.history ?? []),
    { role: "user", content: ctx.prompt },
  ];

  const CORE_MODEL = "claude-haiku-4-5-20251001";

  let stepCount = 0;
  let opsEmitted = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const opsCallbacks: Array<(newOps: BoardOp[]) => void> = [];

  const stream = streamText({
    model: anthropic(CORE_MODEL),
    tools,
    messages,
    stopWhen: stepCountIs(10),
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
      }
      log.info(
        `step ${stepCount} — reason: ${finishReason}, +${elapsed}ms`,
        usage
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
          : undefined
      );

      // Emit any new ops that were added during this step
      if (ops.length > opsEmitted && opsCallbacks.length > 0) {
        const newOps = ops.slice(opsEmitted);
        opsEmitted = ops.length;
        for (const cb of opsCallbacks) cb(newOps);
      }
    },
  });

  async function collectResult(): Promise<AgentResult> {
    const text = await stream.text;
    const allMessages = (await stream.response).messages as ModelMessage[];
    const elapsed = (performance.now() - start).toFixed(1);
    log.info(`completed — ${ops.length} ops, ${stepCount} steps, ${elapsed}ms`);
    return {
      assistantText: text,
      proposedOps: ops,
      messages: allMessages,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        model: CORE_MODEL,
      },
    };
  }

  function onNewOps(cb: (newOps: BoardOp[]) => void) {
    opsCallbacks.push(cb);
  }

  return { uiMessageStream: stream.toUIMessageStream(), ops, onNewOps, collectResult };
}

export async function runCoreAgent(ctx: AgentContext): Promise<AgentResult> {
  return streamCoreAgent(ctx).collectResult();
}
