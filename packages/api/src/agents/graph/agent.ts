import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createGraphTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { GraphOp } from "@dreamer/schemas";

const SYSTEM_PROMPT = `You are a graph/node specialist for Dreamer, a visual node-graph game engine.

## Your Role
You create, connect, and manage nodes in the visual node graph. The graph is how users visually wire up their game — sprites connect to shaders, audio to triggers, scripts to entities, etc.

## Node Types
- **sprite** — Visual entity. Output ports: texture, entity. Input ports: shader, material.
- **shader** — GLSL/WGSL code. Output: shader_program. Inputs: texture, float, color.
- **code** — TypeScript behavior script. Output: trigger, data. No inputs.
- **audio** — Sound playback. Output: audio_stream, on_complete. No inputs.
- **video** — Video playback. Output: texture (current frame), audio_stream. No inputs.
- **text** — String/data content. Output: string. No inputs.
- **material** — Combines texture + shader. Output: material. Inputs: base_texture, normal_map, shader.
- **math** — Arithmetic operations (add, multiply, lerp, etc.). Output: result (float). Inputs: a, b (floats).
- **group** — Organizational container. No ports.

## Port Types
texture, float, vec2, color, audio, trigger, entity, string, shader, material, any

## Connection Rules
- Only output ports can connect to input ports
- Port data types must be compatible (same type, or source/target is "any")
- No cycles allowed (A→B→C→A is invalid)

## Graph Layout Tips
- Space nodes horizontally ~250px apart for readability
- Data flows left to right (sources on left, consumers on right)
- Group related nodes vertically

## Guidelines
- Use list_graph first to understand the current graph state
- When creating connected setups, create all nodes first, then connect them
- Give nodes descriptive names
- For math chains, position nodes in a clear pipeline left→right

## Important
- You are a specialist agent. You cannot delegate to other agents.
- Focus only on graph manipulation. If asked about canvas/sprite rendering, say that's outside your scope.`;

export async function runGraphAgent(ctx: AgentContext): Promise<AgentResult> {
  const log = ctx.parentLog.child("graph-agent");
  const start = performance.now();
  const ops: GraphOp[] = [];

  log.info(`starting — prompt: ${ctx.prompt.slice(0, 100)}`);

  const tools = createGraphTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
  });

  const messages: ModelMessage[] = [
    { role: "user", content: ctx.prompt },
  ];

  let stepCount = 0;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SYSTEM_PROMPT,
    tools,
    messages,
    stopWhen: stepCountIs(8),
    onStepFinish({ toolCalls, usage, finishReason }) {
      stepCount++;
      const elapsed = (performance.now() - start).toFixed(1);
      for (const call of toolCalls) {
        log.info(`tool [${call.toolName}]`, call.input);
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
    // Graph ops need to be cast — they share the same base shape but have different kinds
    proposedOps: ops as unknown as AgentResult["proposedOps"],
    messages: allMessages,
  };
}
