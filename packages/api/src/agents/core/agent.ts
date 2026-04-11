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
import { analyzePowerBudget } from "../../electrical/power-budget-analyzer";
import { analyzeRoutingPolicy, normalizeDirectPinFanout } from "../../electrical/routing-policy";
import { makeBoardOp } from "../make-op";
import { normalizeAgentPrompt } from "../prompt-normalizer";

// Model + mode selection lives in `../router.ts` (routeRequest). The router
// considers domain, complexity, request type, and recent failure history —
// the decision is recorded on the run file for post-hoc quality analysis.

const COMMON_PROMPT = `You are the Dreamer Arduino simulator assistant. You build and debug Arduino Uno circuits on a virtual breadboard.

Arduino pins: D0-D13 = 0-13, A0-A5 = 14-19, 5V = -1, GND = -3. PWM: 3,5,6,9,10,11.

You are given a compact board summary below. Prefer the lightweight read tools:
- get_board_overview
- list_components
- list_wires
- get_component_details
- get_sketch_code
- analyze_power_budget

Only call get_board_state if you truly need the full raw board payload. Be concise.`;

const BUILD_PROMPT = `${COMMON_PROMPT}

## Mode: BUILD (board is empty)
You have ONE primary tool: propose_circuit. Use it to describe the entire circuit in a single call — components, wires, and sketch. It auto-positions parts and validates wiring.

## propose_circuit reference
- Components: list type + name + optional properties. Auto-positioned on breadboard.
- Wires: reference components by array INDEX (0, 1, 2...), not by ID. Specify arduinoPin number and optional pinOffset for 3-pin components (0=signal, 1=vcc, 2=gnd).
- One direct wire per Arduino pin. If a pin fans out, route one wire to a breadboard row/rail and branch from there.
- Shared GND/power must be rail-distributed: Arduino GND/5V to rail once, then rail to each load.
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

function patchSketchForSplitPins(
  sketchCode: string,
  sourcePin: number,
  extraPins: number[],
): string | null {
  if (!sketchCode.trim() || extraPins.length === 0) return null;

  let patched = sketchCode;
  let changed = false;
  const sourcePinLiteral = String(sourcePin);

  const constMatch = new RegExp(`const\\s+int\\s+(\\w+)\\s*=\\s*${sourcePinLiteral}\\s*;`).exec(sketchCode);
  if (constMatch) {
    const baseVar = constMatch[1]!;
    const decl = extraPins
      .map((pin, idx) => `const int ${baseVar}_${idx + 2} = ${pin};`)
      .join("\n");
    patched = patched.replace(constMatch[0], `${constMatch[0]}\n${decl}`);
    changed = true;

    const pinModeRe = new RegExp(`pinMode\\s*\\(\\s*${baseVar}\\s*,\\s*OUTPUT\\s*\\)\\s*;`);
    patched = patched.replace(pinModeRe, (m) => {
      const extra = extraPins.map((_, idx) => `  pinMode(${baseVar}_${idx + 2}, OUTPUT);`).join("\n");
      return `${m}\n${extra}`;
    });

    for (const level of ["HIGH", "LOW"] as const) {
      const re = new RegExp(`digitalWrite\\s*\\(\\s*${baseVar}\\s*,\\s*${level}\\s*\\)\\s*;`, "g");
      patched = patched.replace(re, () => {
        const lines = [
          `digitalWrite(${baseVar}, ${level});`,
          ...extraPins.map((_, idx) => `digitalWrite(${baseVar}_${idx + 2}, ${level});`),
        ];
        return lines.join("\n  ");
      });
    }
    return changed ? patched : null;
  }

  const pinModeRe = new RegExp(`pinMode\\s*\\(\\s*${sourcePinLiteral}\\s*,\\s*OUTPUT\\s*\\)\\s*;`);
  if (pinModeRe.test(patched)) {
    patched = patched.replace(pinModeRe, (m) => {
      const extra = extraPins.map((pin) => `  pinMode(${pin}, OUTPUT);`).join("\n");
      return `${m}\n${extra}`;
    });
    changed = true;
  }

  for (const level of ["HIGH", "LOW"] as const) {
    const re = new RegExp(`digitalWrite\\s*\\(\\s*${sourcePinLiteral}\\s*,\\s*${level}\\s*\\)\\s*;`, "g");
    if (re.test(patched)) {
      patched = patched.replace(re, () => {
        const lines = [
          `digitalWrite(${sourcePinLiteral}, ${level});`,
          ...extraPins.map((pin) => `digitalWrite(${pin}, ${level});`),
        ];
        return lines.join("\n  ");
      });
      changed = true;
    }
  }

  return changed ? patched : null;
}

function tryAutoFixLedPinOvercurrent(params: {
  workingBoard: BoardState;
  projectId: string;
  sceneId: string;
  expectedVersion: number;
  powerErrors: Array<{ code: string; pin?: number }>;
}): { ops: BoardOp[]; note: string } | null {
  const issue = params.powerErrors.find((e) => e.code === "PIN_OVERCURRENT" && typeof e.pin === "number");
  if (!issue || issue.pin == null) return null;
  const overloadedPin = issue.pin;

  const ledWires = Object.values(params.workingBoard.wires).filter((wire) => {
    if (wire.fromRow !== -999 || wire.fromCol !== overloadedPin) return false;
    return Object.values(params.workingBoard.components).some(
      (component) => component.type === "led" && component.y === wire.toRow && component.x === wire.toCol
    );
  });
  if (ledWires.length < 3) return null;

  const preferredPins = [overloadedPin, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const requiredPins = Math.ceil(ledWires.length / 2);
  if (requiredPins > preferredPins.length) return null;
  const assignedPins = preferredPins.slice(0, requiredPins);
  const extraPins = assignedPins.filter((p) => p !== overloadedPin);

  const opCtx = {
    projectId: params.projectId,
    sceneId: params.sceneId,
    expectedVersion: params.expectedVersion,
  };

  const generatedOps: BoardOp[] = [];
  for (let i = 0; i < ledWires.length; i++) {
    const wire = ledWires[i]!;
    const targetPin = assignedPins[Math.floor(i / 2)]!;
    if (targetPin === overloadedPin) continue;

    generatedOps.push(
      makeBoardOp(opCtx, {
        kind: "remove_wire",
        payload: { wireId: wire.id },
      })
    );
    delete params.workingBoard.wires[wire.id];

    const newWire = {
      id: crypto.randomUUID(),
      fromRow: -999,
      fromCol: targetPin,
      toRow: wire.toRow,
      toCol: wire.toCol,
      color: wire.color,
    };
    generatedOps.push(
      makeBoardOp(opCtx, {
        kind: "connect_wire",
        payload: { wire: newWire },
      })
    );
    params.workingBoard.wires[newWire.id] = newWire;
  }

  if (generatedOps.length === 0) return null;

  const patchedSketch = patchSketchForSplitPins(
    params.workingBoard.sketchCode ?? "",
    overloadedPin,
    extraPins,
  );
  if (!patchedSketch) return null;

  generatedOps.push(
    makeBoardOp(opCtx, {
      kind: "update_sketch",
      payload: { code: patchedSketch },
    })
  );
  params.workingBoard.sketchCode = patchedSketch;

  return {
    ops: generatedOps,
    note: `Auto-fix applied: redistributed LED load from D${overloadedPin} across pins ${assignedPins.map((p) => `D${p}`).join(", ")} and patched sketch writes accordingly.`,
  };
}

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
  // Core tools mutate this as they propose ops; specialists read from a live
  // snapshot via getWorkingProject() so they see the parent's tentative work.
  const trackedBoard = boardTracker.get(ctx.projectId);
  const workingBoard: BoardState = structuredClone(
    trackedBoard ?? ctx.project.boardState ?? createDefaultBoardState()
  );

  // Shared sink for delegated child-run token usage.
  const childUsage: ChildTokenUsage[] = [];

  const tools = createCoreTools({
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
      // Live snapshot: every call reflects the parent's current tentative state
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
    // "all" / "circuit" / fallback — prefer EDIT semantics for safety
    EDIT_PROMPT;

  const messages: ModelMessage[] = [
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

    // Roll up delegated child-run cost into the parent total. The parent's
    // own input/output tokens stay as-is; totalTokens becomes the end-to-end
    // spend so eval/token-analyzer sees the true cost of the turn.
    const childTotalTokens = childUsage.reduce((acc, c) => acc + c.totalTokens, 0);
    const endToEndTotal = totalInputTokens + totalOutputTokens + childTotalTokens;

    log.info(
      `completed — ${ops.length} ops, ${stepCount} steps, ${elapsed}ms, parent tokens: ${totalInputTokens + totalOutputTokens}, child tokens: ${childTotalTokens}, children: ${childUsage.length}`
    );
    const remediationNotes: string[] = [];
    const maxAutoFixPasses = 2;
    const opCtx = {
      projectId: ctx.projectId,
      sceneId: ctx.sceneId,
      expectedVersion: ctx.project.project.version,
    };

    if (ops.length > 0) {
      for (let pass = 0; pass < maxAutoFixPasses; pass++) {
        let changed = false;

        const routingFix = normalizeDirectPinFanout({ board: workingBoard, opCtx });
        if (routingFix) {
          ops.push(...routingFix.ops);
          remediationNotes.push(...routingFix.notes);
          changed = true;
        }

        const report = analyzePowerBudget(workingBoard);
        const powerErrors = report.issues.filter((issue) => issue.severity === "error");
        const ledFix = tryAutoFixLedPinOvercurrent({
          workingBoard,
          projectId: ctx.projectId,
          sceneId: ctx.sceneId,
          expectedVersion: ctx.project.project.version,
          powerErrors: powerErrors.map((e) => ({ code: e.code, pin: e.pin })),
        });
        if (ledFix) {
          ops.push(...ledFix.ops);
          remediationNotes.push(ledFix.note);
          changed = true;
        }

        if (!changed) break;
      }
    }

    const powerReport = analyzePowerBudget(workingBoard);
    const powerErrors = powerReport.issues.filter((issue) => issue.severity === "error");
    const routing = analyzeRoutingPolicy(workingBoard);

    if (powerErrors.length > 0 && ops.length > 0) {
      const topErrors = powerErrors.slice(0, 4).map((issue) => `- ${issue.message}`).join("\n");
      const recs = powerReport.recommendations.slice(0, 3).map((r) => `- ${r.message}`).join("\n");
      const blockedText = [
        "I couldn't apply this change because it violates electrical safety constraints.",
        "",
        "Top issues:",
        topErrors || "- Unknown electrical error.",
        "",
        "Recommended fix:",
        recs || "- Use one Arduino lead per net, distribute with breadboard rails, and power high-current loads externally.",
      ].join("\n");
      log.warn(
        `blocked unsafe plan — ${powerErrors.length} electrical error(s), max fanout=${routing.maxPinFanout}`
      );
      return {
        assistantText: blockedText,
        proposedOps: [],
        messages: allMessages,
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: endToEndTotal,
          model: CORE_MODEL,
          children: childUsage.length > 0 ? childUsage.slice() : undefined,
        },
      };
    }

    const finalText =
      remediationNotes.length > 0
        ? `${text}\n\nSafety note: ${remediationNotes.join(" ")}`
        : text;

    return {
      assistantText: finalText,
      proposedOps: ops,
      messages: allMessages,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: endToEndTotal,
        model: CORE_MODEL,
        children: childUsage.length > 0 ? childUsage.slice() : undefined,
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
