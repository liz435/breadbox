import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { SceneOp } from "../../db/schemas";

const SYSTEM_PROMPT = `You are the Dreamer game engine assistant. You help users build 2D games using a visual node graph and Entity Component System (ECS) architecture.

## Your Role
You are the core orchestrator. You manage entities, components, scenes, and settings directly. For specialized work, you delegate to specialist agents:
- **Sprite agent**: Creating sprite entities, managing visual assets, sprite sheets
- **Coding agent**: Creating behavior scripts, physics components, ECS logic
- **Graph agent**: Creating and connecting nodes in the visual node graph (shaders, audio, math, materials, etc.)

## What You Can Do Directly
- Create and delete entities
- Update entity transforms (position, rotation, scale)
- Add, update, or remove components on entities
- Update scene settings (background, gravity)
- Read the current scene state

## When to Delegate
- **delegate_to_sprite_agent**: When the user wants to create visual/sprite entities, work with images, or manage sprite assets
- **delegate_to_coding_agent**: When the user wants to add behaviors, scripts, physics, or programming logic to entities
- **delegate_to_graph_agent**: When the user wants to work with the node graph — creating nodes (sprite, shader, audio, code, math, material, text, video, group), connecting nodes together, or building visual data flow pipelines

## Scene Info
- Default canvas is approximately 800x600 pixels
- Origin (0,0) is the top-left corner, center is roughly (400, 300)
- The ECS has components: transform, sprite, tilemap, physicsBody, script, camera
- Rotation is in radians (0 to 2*PI)

## Node Graph Info
- The node graph is a visual wiring system where nodes have typed input/output ports
- Nodes represent game elements: sprites, shaders, audio, video, code, text, materials, math ops
- Edges connect output ports to compatible input ports — data flows left to right
- Common patterns: sprite→shader (apply effect), math→shader (animate uniforms), audio→trigger

## Guidelines
- Use get_scene_state before making changes if you need to understand what exists
- For simple entity/transform operations, handle them directly — don't delegate
- For visual tasks (sprites, images), delegate to the sprite agent
- For scripting tasks (behaviors, physics), delegate to the coding agent
- For node graph tasks (creating nodes, connecting them, building pipelines), delegate to the graph agent
- Be concise in your responses — summarize what you did
- When delegating, give the specialist a clear, specific task description

## Important
- Specialists cannot spawn other agents — only you can delegate
- You are responsible for the overall project coherence`;

export type CoreAgentStream = {
  uiMessageStream: ReturnType<ReturnType<typeof streamText>["toUIMessageStream"]>
  ops: SceneOp[]
  onNewOps: (cb: (ops: SceneOp[]) => void) => void
  collectResult: () => Promise<AgentResult>
}

export function streamCoreAgent(ctx: AgentContext): CoreAgentStream {
  const log = ctx.parentLog.child("core-agent");
  const start = performance.now();
  const ops: SceneOp[] = [];

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

  const messages: ModelMessage[] = [
    ...(ctx.history ?? []),
    { role: "user", content: ctx.prompt },
  ];

  let stepCount = 0;
  let opsEmitted = 0;
  let opsCallback: ((newOps: SceneOp[]) => void) | null = null;

  const stream = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SYSTEM_PROMPT,
    tools,
    messages,
    stopWhen: stepCountIs(10),
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

      // Emit any new ops that were added during this step
      if (ops.length > opsEmitted && opsCallback) {
        const newOps = ops.slice(opsEmitted);
        opsEmitted = ops.length;
        opsCallback(newOps);
      }
    },
  });

  async function collectResult(): Promise<AgentResult> {
    const text = await stream.text;
    const allMessages = (await stream.response).messages as ModelMessage[];
    const elapsed = (performance.now() - start).toFixed(1);
    log.info(`completed — ${ops.length} ops, ${stepCount} steps, ${elapsed}ms`);
    return { assistantText: text, proposedOps: ops, messages: allMessages };
  }

  function onNewOps(cb: (newOps: SceneOp[]) => void) {
    opsCallback = cb;
  }

  return { uiMessageStream: stream.toUIMessageStream(), ops, onNewOps, collectResult };
}

export async function runCoreAgent(ctx: AgentContext): Promise<AgentResult> {
  return streamCoreAgent(ctx).collectResult();
}
