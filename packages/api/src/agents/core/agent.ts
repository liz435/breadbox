import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools, summarizeBoardState } from "./tools";
import type { AgentContext, AgentResult, ChildTokenUsage } from "../types";
import type { BoardOp, BoardState } from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";
import { routeRequest, type RoutingDecision } from "../router";
import { boardTracker } from "../../db/board-state-tracker";
import { agentRunRepo } from "../../db/agent-run-repo";
import { runPolicies } from "../policy-engine";
import { generatePlan, type AgentPlan, type PlannerUsage } from "../planner";
import { reflectOnOutput, shouldReplan } from "../reflection";
import { normalizeAgentPrompt } from "../prompt-normalizer";

// ── Model context limits (used for message sizing) ──────────────────────

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
};

/** Reserve tokens for system prompt, tools schema, and output. */
const RESERVED_TOKENS = 20_000;

/** Rough chars-per-token estimate for sizing. */
const CHARS_PER_TOKEN = 3.5;

// ── Prompts ─────────────────────────────────────────────────────────────

const TRANSPILE_GUARDRAIL_BLOCK = [
  "## Transpiler-safe sketch subset (MUST follow — violations waste tokens on retries)",
  `- Unsupported: pointers, pass-by-reference (&), templates, namespaces.`,
  "- Avoid: `int* p`, `&ref`, `->`, `template<>`, `namespace`.",
  "- **NO 2D array initializers** — `int arr[N][M] = {{...}}` often fails JS compilation. Use flat if/else chains or switch/case instead.",
  "- **NO array initializers with const variables** — `int pins[] = {SEG_A, SEG_B}` can fail. Assign each element separately or use direct literals.",
  "- Prefer: plain globals, 1D literal arrays (`int arr[3] = {1, 2, 3}`), simple loops, direct function calls.",
  "- If a sketch fails validation, do NOT retry with the same pattern. Switch to a simpler approach (e.g., if/else chain instead of lookup table).",
  "- For digit/segment lookup tables: use `if(n==0){a=1;b=1;...}` style, NOT 2D arrays.",
].join("\n");

const COMMON_PROMPT = `You are the Dreamer Arduino simulator assistant. You build and debug Arduino Uno circuits on a virtual breadboard.

Arduino pins: D0-D13 = 0-13, A0-A5 = 14-19, 5V = -1, GND = -3. PWM: 3,5,6,9,10,11.

You are given a compact board summary below. Prefer the lightweight read tools:
- get_board_overview
- list_components
- list_wires
- get_component_details
- get_sketch_code
- analyze_power_budget

Only call get_board_state if you truly need the full raw board payload. Be concise.

${TRANSPILE_GUARDRAIL_BLOCK}`;

const BUILD_PROMPT = `${COMMON_PROMPT}

## Mode: BUILD (board is empty)
You have ONE primary tool: propose_circuit. Use it to describe the entire circuit in a single call — components, wires, and sketch. It auto-positions parts and validates wiring.
If propose_circuit returns sketch_validation, switch to sketch-fix path:
- use update_sketch or patch_sketch to repair syntax first
- then retry propose_circuit to apply placement+wiring
- sketch fix retries are capped (max 2 failed validation attempts per run)
- if the sketch fix budget is exhausted (abandoned=true), STOP retrying and explain to the user what went wrong

## propose_circuit reference
- Components: list type + name + optional properties. Auto-positioned on breadboard.
- Wires: reference components by array INDEX (0, 1, 2...), not by ID. Every wire MUST include a logical toPin name (e.g. anode/cathode, a/b, signal/vcc/gnd).
- One direct wire per Arduino pin. If a pin fans out, route one wire to a breadboard row/rail and branch from there.
- Shared GND/power must be rail-distributed: Arduino GND/5V to rail once, then rail to each load.
- ledResistorPairs: pair LED index with resistor index — auto-wires cathode→resistor→GND.
- sketch: full Arduino code.

## Example: LED blink
propose_circuit({
  components: [{type:"led",name:"LED",properties:{color:"#ef4444"}}, {type:"resistor",name:"R1",properties:{resistance:220}}],
  wires: [{arduinoPin:13, toComponent:0, toPin:"anode"}],
  ledResistorPairs: [{ledIndex:0, resistorIndex:1}],
  sketch: "void setup(){pinMode(13,OUTPUT);}\\nvoid loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}"
})

## Example: Servo + potentiometer
propose_circuit({
  components: [{type:"servo",name:"Servo"}, {type:"potentiometer",name:"Pot"}],
  wires: [
    {arduinoPin:9, toComponent:0, toPin:"signal"},
    {arduinoPin:-1, toComponent:0, toPin:"vcc"},
    {arduinoPin:-3, toComponent:0, toPin:"gnd"},
    {arduinoPin:14, toComponent:1, toPin:"signal"},
    {arduinoPin:-1, toComponent:1, toPin:"vcc"},
    {arduinoPin:-3, toComponent:1, toPin:"gnd"}
  ],
  sketch: "..."
})`;

const EDIT_PROMPT = `${COMMON_PROMPT}

## Mode: EDIT (board has existing components — preserve them!)
The board already has components and wires. Use the granular CRUD tools to make targeted changes:
- place_component / remove_component / update_component / move_component
- connect_wire / wire_component_to_pin / remove_wire / update_wire
- update_sketch (full rewrite) or patch_sketch (small edits)

Do NOT replace the whole circuit. Make the smallest change that satisfies the user's request. Reuse existing component IDs from the board state below — never invent IDs.`;

export type CoreAgentStream = {
  uiMessageStream: ReturnType<ReturnType<typeof streamText>["toUIMessageStream"]>
  ops: BoardOp[]
  onNewOps: (cb: (ops: BoardOp[]) => void) => void
  collectResult: () => Promise<AgentResult>
  /** The plan generated before the tool loop, if any. */
  getPlan: () => AgentPlan | undefined
  /** Planner token usage, for overhead attribution. */
  getPlannerUsage: () => PlannerUsage | undefined
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
      // Keep the summary but truncate if long
      if (typeof value.summary === "string" && value.summary.length > 200) {
        return { summary: value.summary.slice(0, 200) + "..." };
      }
      return value;

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

    case "delegate_to_circuit_agent":
    case "delegate_to_graph_agent": {
      // Keep result summary, drop full text
      const compact: Record<string, unknown> = { opsCount: value.opsCount };
      if (value.error) compact.error = value.error;
      if (value.skipped) compact.skipped = value.skipped;
      return compact;
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

  // Persist the routing decision on the run file immediately so it survives
  // a mid-turn crash and eval can measure router quality post-hoc.
  agentRunRepo.setRouting(ctx.runId, decision).catch((err) => {
    log.warn(`failed to persist routing decision: ${err}`);
  });

  log.info(
    `routing — model: ${CORE_MODEL}, mode: ${mode}, domain: ${decision.domain}, requestType: ${decision.requestType}, complexity: ${decision.complexity}`
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

  // Shared sink for delegated child-run token usage.
  const childUsage: ChildTokenUsage[] = [];

  const { tools, isSketchRecoveryAbandoned } = createCoreTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
    mode,
    workingBoard,
    delegation: {
      project: ctx.project,
      sceneId: ctx.sceneId,
      threadId: ctx.threadId,
      projectId: ctx.projectId,
      sessionId: ctx.sessionId,
      parentRunId: ctx.runId,
      parentLog: log,
      childUsage,
      getWorkingProject: () => ({
        ...ctx.project,
        boardState: structuredClone(workingBoard),
      }),
    },
  });

  const boardSummary = summarizeBoardState({ ...ctx.project, boardState: workingBoard });
  const systemPrompt =
    mode === "build" ? BUILD_PROMPT :
    mode === "edit" ? EDIT_PROMPT :
    EDIT_PROMPT;

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

      // Keep the last 4 messages (2 tool-call/result pairs = current context).
      // Compact everything between the system prompt and those last 4.
      const KEEP_RECENT = 4;
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
    const childTotalTokens = childUsage.reduce((acc, c) => acc + c.totalTokens, 0);
    const plannerTokens = plannerUsage?.totalTokens ?? 0;
    const total = totalOverride ?? (totalInputTokens + totalOutputTokens + childTotalTokens + plannerTokens);
    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: total,
      model: CORE_MODEL,
      cacheReadTokens: totalCacheReadTokens > 0 ? totalCacheReadTokens : undefined,
      cacheWriteTokens: totalCacheWriteTokens > 0 ? totalCacheWriteTokens : undefined,
      children: childUsage.length > 0 ? childUsage.slice() : undefined,
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

    // Roll up delegated child-run cost
    const childTotalTokens = childUsage.reduce((acc, c) => acc + c.totalTokens, 0);
    // Include planner overhead in end-to-end total
    const plannerTokens = plannerUsage?.totalTokens ?? 0;
    const endToEndTotal = totalInputTokens + totalOutputTokens + childTotalTokens + plannerTokens;

    const cacheRatio = totalInputTokens > 0
      ? ((totalCacheReadTokens / totalInputTokens) * 100).toFixed(0)
      : "0";
    log.info(
      `completed — ${ops.length} ops, ${stepCount} steps, ${elapsed}ms, parent tokens: ${totalInputTokens + totalOutputTokens} (cache read: ${totalCacheReadTokens}, cache write: ${totalCacheWriteTokens}, cache hit: ${cacheRatio}%), child tokens: ${childTotalTokens}, planner tokens: ${plannerTokens}`
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
  };
}

export async function runCoreAgent(ctx: AgentContext): Promise<AgentResult> {
  return streamCoreAgent(ctx).collectResult();
}
