import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCodingTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { SceneOp } from "../../db/schemas";

const SYSTEM_PROMPT = `You are a behavior/scripting specialist for Dreamer, a 2D game engine with Godot-inspired architecture.

## Your Role
You handle advanced scripting tasks, physics components, and complex ECS component logic. For most games, behavior is handled by inline sprite scripts (managed by the graph agent), so you are only called for specialized tasks.

## What You Can Do
- Create script assets and attach them to entities
- Update existing script code
- Add physics body components to entities (dynamic, static, kinematic)
- List existing entities to understand the scene

## Dreamer Script API
Scripts run every frame and have access to:
- \`self\` — This sprite's entity (x, y, scaleX, scaleY, rotation, tint, visible, setPosition, setScale, translate)
- \`dt\` — Frame delta time (seconds)
- \`time\` — Elapsed time since start (seconds)
- \`state\` — Persistent object (survives across frames)
- \`entities.get("Name")\` — Get entity handle by sprite name
- \`entities.list()\` — List all entity names
- \`Input.isKeyPressed("key")\` — Check if key is pressed
- \`Input.keys\` — Array of all pressed keys
- \`console.log(...)\` — Log to runtime console

## Guidelines
- Always use list_entities first if you need to know what exists
- Write clean, commented script code
- Be concise in your responses

## Important
- You are a specialist agent. You cannot delegate to other agents.
- Focus only on scripting/behavior tasks. If asked about visual/sprite work, say that's outside your scope.`;

export async function runCodingAgent(ctx: AgentContext): Promise<AgentResult> {
  const log = ctx.parentLog.child("coding-agent");
  const start = performance.now();
  const ops: SceneOp[] = [];

  log.info(`starting — prompt: ${ctx.prompt.slice(0, 100)}`);

  const tools = createCodingTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
  });

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    { role: "user", content: ctx.prompt },
  ];

  let stepCount = 0;

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    tools,
    messages,
    stopWhen: stepCountIs(5),
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
    proposedOps: ops,
    messages: allMessages,
  };
}
