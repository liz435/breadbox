import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools, summarizeBoardState } from "../core/tools";
import type { AgentContext, AgentResult, DelegationContext } from "../types";
import type { BoardOp, BoardState } from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";

// ── Circuit Specialist ────────────────────────────────────────────────────
//
// The circuit specialist uses the SAME tool layer as the core agent
// (`createCoreTools` in "circuit" mode). That guarantees one wiring contract
// — pins are set to null, all connections come from wires, and the specialist
// sees the parent's tentative working board so it can verify or repair the
// parent's in-progress work.
//
// It cannot delegate further (no recursion) and cannot write sketches — it
// validates and repairs wiring only.

const SYSTEM_PROMPT = `You are a circuit design specialist for Dreamer, an Arduino Uno simulator.

## Wiring contract (identical to the core agent)
- ALL connections come from WIRES, not from component.pins. When placing a component, set every pin to null.
- Same-row cols 0-4 are connected (left bus). Same-row cols 5-9 are connected (right bus). No wire needed within a bus.
- Use one direct wire per Arduino pin. For fan-out, land once on a tie row/rail, then branch from the bus.
- Shared GND and VCC must be rail-distributed (single Arduino feed wire per rail net).
- LED: always add a 220-330Ω resistor in series. Place LED at col 2 row N, resistor at col 3 row N+1 (cathode row). Wire signal→(N,2), GND→(N+1,7).
- 3-pin components (servo/pot/sensor): each pin on a SEPARATE ROW or they short via the bus. Wire signal→(row,x), 5V→(row+1,x), GND→(row+2,x).
- Resistor spans 5 cols: place at col 3 to bridge the gap between the left and right strips.

## Arduino Uno reference
- Digital: D0–D13 (D0/D1 reserved for serial)
- Analog: A0–A5 (= pins 14–19 as digital)
- PWM: D3, D5, D6, D9, D10, D11
- I²C: A4 (SDA), A5 (SCL)
- Special pin numbers in wires: 5V=-1, 3V3=-2, GND=-3
- Max current per pin: 20 mA; total across all pins: 200 mA

## Your role
You validate and repair circuit wiring. The board state below reflects the parent agent's tentative work this turn — you see their latest changes. Make targeted fixes using the granular CRUD tools (place_component, connect_wire, remove_wire, update_wire, update_component, remove_component, move_component). Do NOT write sketch code.

## Common validation rules
1. Every LED must have a current-limiting resistor on its cathode path.
2. No pin should source/sink more than 20 mA.
3. Serial pins (D0/D1) should not be used for general I/O when Serial is needed.
4. PWM components (servo, motor) must use D3/D5/D6/D9/D10/D11.
5. OLED/LCD: SDA→A4, SCL→A5.
6. Multiple signal sources must not land on the same breadboard bus row (bus short).
7. Components on separate rows should each have their own wires — check floating components.

## Important
You are a specialist agent. You cannot delegate further. Focus only on circuit wiring — sketch code is outside your scope.`;

const CIRCUIT_MODEL = "claude-sonnet-4-6";

export async function runCircuitAgent(ctx: AgentContext): Promise<AgentResult> {
  const log = ctx.parentLog.child("circuit-agent");
  const start = performance.now();

  // Share parent's working board and ops when delegated; otherwise own them.
  const ops: BoardOp[] = ctx.sharedOps ?? [];
  const workingBoard: BoardState =
    ctx.sharedWorkingBoard ??
    structuredClone(ctx.project.boardState ?? createDefaultBoardState());

  log.info(`starting — prompt: ${ctx.prompt.slice(0, 100)}`);

  // The circuit specialist can't delegate (no recursion), so we stub
  // DelegationContext with unusable runners — the filtered tool set for
  // circuit mode excludes delegation tools anyway.
  const delegation: DelegationContext = {
    project: ctx.project,
    sceneId: ctx.sceneId,
    threadId: ctx.threadId,
    projectId: ctx.projectId,
    sessionId: ctx.sessionId,
    parentRunId: ctx.runId,
    parentLog: log,
    childUsage: [],
    getWorkingProject: () => ({
      ...ctx.project,
      boardState: structuredClone(workingBoard),
    }),
  };

  const tools = createCoreTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
    mode: "circuit",
    workingBoard,
    delegation,
  });

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    {
      role: "user",
      content: `Current board state:\n${summarizeBoardState({ ...ctx.project, boardState: workingBoard })}\n\nTask: ${ctx.prompt}`,
    },
  ];

  let stepCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const result = streamText({
    model: anthropic(CIRCUIT_MODEL),
    tools,
    messages,
    stopWhen: stepCountIs(8),
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
    },
  });

  const text = await result.text;
  const allMessages = (await result.response).messages as ModelMessage[];

  const elapsed = (performance.now() - start).toFixed(1);
  log.info(`completed — ${ops.length} ops, ${elapsed}ms`);

  return {
    assistantText: text,
    proposedOps: ops,
    messages: allMessages,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      model: CIRCUIT_MODEL,
    },
  };
}
