import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createSpriteTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { SceneOp } from "../../db/schemas";

const SYSTEM_PROMPT = `You are a sprite/visual specialist for Dreamer, a 2D game engine.

## Your Role
You create sprite entities, manage visual assets, and handle all visual/sprite-related tasks.
You work within an Entity Component System (ECS) architecture.

## What You Can Do
- Create sprite entities (entity + transform + sprite component + placeholder asset)
- Update sprite properties (position, rotation, scale, tint, layer)
- Remove sprite entities
- List existing entities to understand the scene

## Canvas Info
- Default canvas is approximately 800x600 pixels
- Origin (0,0) is the top-left corner
- Center is roughly (400, 300)
- Rotation is in radians (0 to 2*PI)
- Scale of 1 is the default size

## Guidelines
- Always use list_entities first if you need to know what exists
- Be concise in your responses — confirm what you did in a short sentence
- When creating sprites, use descriptive names
- Image generation is stubbed for v0 — assets get placeholder URIs
- For positioning: "top" = low Y (~100), "bottom" = high Y (~500), "left" = low X (~100), "right" = high X (~700)

## Important
- You are a specialist agent. You cannot delegate to other agents.
- Focus only on sprite/visual tasks. If asked about scripting or behaviors, say that's outside your scope.`;

export async function runSpriteAgent(ctx: AgentContext): Promise<AgentResult> {
  const log = ctx.parentLog.child("sprite-agent");
  const start = performance.now();
  const ops: SceneOp[] = [];

  log.info(`starting — prompt: ${ctx.prompt.slice(0, 100)}`);

  const tools = createSpriteTools({
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
