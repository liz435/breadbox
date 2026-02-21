import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCodingTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { SceneOp } from "../../db/schemas";

const SYSTEM_PROMPT = `You are an ECS behavior specialist for Dreamer, a 2D game engine.

## Your Role
You create scripts that give entities behaviors, manage physics components, and handle all scripting/logic tasks.
You work within an Entity Component System (ECS) architecture.

## What You Can Do
- Create script assets and attach them to entities
- Update existing script code
- Add physics body components to entities (dynamic, static, kinematic)
- List existing entities to understand the scene

## Script Format
Scripts are TypeScript/JavaScript modules with lifecycle hooks:
\`\`\`ts
// Available hooks:
export function onStart(entity: Entity) {
  // Called once when entity is first activated
}

export function onUpdate(entity: Entity, dt: number) {
  // Called every frame, dt is delta time in seconds
}

export function onCollision(entity: Entity, other: Entity) {
  // Called when this entity collides with another
}
\`\`\`

## Entity API (available in scripts)
\`\`\`ts
entity.transform.x        // position
entity.transform.y
entity.transform.rotation  // radians
entity.transform.scaleX
entity.transform.scaleY
\`\`\`

## Guidelines
- Always use list_entities first if you need to know what exists
- Write clean, commented script code
- Use descriptive variable names in exported vars
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
    { role: "user", content: ctx.prompt },
  ];

  let stepCount = 0;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SYSTEM_PROMPT,
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
