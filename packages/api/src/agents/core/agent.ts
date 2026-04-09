import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools, summarizeBoardState } from "./tools";
import type { ToolMode } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { BoardOp } from "@dreamer/schemas";
import { classifyComplexity } from "../intent-classifier";
import { boardTracker } from "../../db/board-state-tracker";

// ── Model selection ─────────────────────────────────────────────────────
//
// Sonnet for complex multi-component design, debugging, or wiring analysis.
// Haiku for simple add/remove/edit on an existing board.
const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Decide which model + tool mode to use for this turn.
 *
 * Model is driven purely by `classifyComplexity` (regex over the prompt).
 * Mode is driven by board state — empty board means we're starting fresh
 * (build mode favors `propose_circuit`), populated board means edit mode
 * (granular CRUD tools, no `propose_circuit` to avoid wiping work).
 */
function selectModelAndMode(prompt: string, projectId: string, fallbackBoard: { components: Record<string, unknown> } | undefined) {
  const complexity = classifyComplexity(prompt);
  const model = complexity === "complex" ? SONNET_MODEL : HAIKU_MODEL;

  const board = boardTracker.get(projectId) ?? fallbackBoard;
  const componentCount = board
    ? Object.values(board.components).filter((c) => (c as { type?: string }).type !== "arduino_uno").length
    : 0;
  const mode: ToolMode = componentCount === 0 ? "build" : "edit";

  return { model, mode, complexity, componentCount };
}

const COMMON_PROMPT = `You are the Dreamer Arduino simulator assistant. You build and debug Arduino Uno circuits on a virtual breadboard.

Arduino pins: D0-D13 = 0-13, A0-A5 = 14-19, 5V = -1, GND = -3. PWM: 3,5,6,9,10,11.

Board state is below — don't call get_board_state unless you need a mid-turn refresh. Be concise.`;

const BUILD_PROMPT = `${COMMON_PROMPT}

## Mode: BUILD (board is empty)
You have ONE primary tool: propose_circuit. Use it to describe the entire circuit in a single call — components, wires, and sketch. It auto-positions parts and validates wiring.

## propose_circuit reference
- Components: list type + name + optional properties. Auto-positioned on breadboard.
- Wires: reference components by array INDEX (0, 1, 2...), not by ID. Specify arduinoPin number and optional pinOffset for 3-pin components (0=signal, 1=vcc, 2=gnd).
- ledResistorPairs: pair LED index with resistor index — auto-wires cathode→resistor→GND.
- sketch: full Arduino code.

## Example: LED blink
propose_circuit({
  components: [{type:"led",name:"LED",properties:{color:"#ef4444"}}, {type:"resistor",name:"R1",properties:{resistance:220}}],
  wires: [{arduinoPin:13, toComponent:0}],
  ledResistorPairs: [{ledIndex:0, resistorIndex:1}],
  sketch: "void setup(){pinMode(13,OUTPUT);}\\nvoid loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}"
})

## Example: Servo + potentiometer
propose_circuit({
  components: [{type:"servo",name:"Servo"}, {type:"potentiometer",name:"Pot"}],
  wires: [
    {arduinoPin:9, toComponent:0, pinOffset:0},
    {arduinoPin:-1, toComponent:0, pinOffset:1},
    {arduinoPin:-3, toComponent:0, pinOffset:2},
    {arduinoPin:14, toComponent:1, pinOffset:0},
    {arduinoPin:-1, toComponent:1, pinOffset:1},
    {arduinoPin:-3, toComponent:1, pinOffset:2}
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
}

export function streamCoreAgent(ctx: AgentContext): CoreAgentStream {
  const log = ctx.parentLog.child("core-agent");
  const start = performance.now();
  const ops: BoardOp[] = [];

  const { model: CORE_MODEL, mode, complexity, componentCount } = selectModelAndMode(
    ctx.prompt,
    ctx.projectId,
    ctx.project.boardState ?? undefined,
  );

  log.info(
    `starting — model: ${CORE_MODEL}, mode: ${mode}, complexity: ${complexity}, board components: ${componentCount}, prompt: ${ctx.prompt.slice(0, 100)}`
  );

  const tools = createCoreTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
    mode,
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
  const systemPrompt = mode === "build" ? BUILD_PROMPT : EDIT_PROMPT;

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n## Current Board State\n${boardSummary}`,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...(ctx.history ?? []),
    { role: "user", content: ctx.prompt },
  ];

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
