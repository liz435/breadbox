import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { SceneOp } from "../../db/schemas";

const SYSTEM_PROMPT = `You are the Dreamer game engine assistant — a game-creation orchestrator that helps users build complete 2D games from a single prompt.

## Your Role
You are the core orchestrator responsible for turning high-level game descriptions into working games. You coordinate across three specialist agents to create all the pieces:
- **Sprite agent**: Creating visual entities on the canvas (sprites, sprite sheets, visual assets)
- **Coding agent**: Writing behavior scripts, physics, ECS component logic
- **Graph agent**: Building the visual node graph — creating nodes (sprite, code, input_map, on_update, etc.), wiring them together with edges

## Game Creation Pipeline
When a user asks you to create a game, follow this pipeline:

1. **Plan** — Break the game into entities, behaviors, and controls
2. **Create sprites** — Delegate to sprite agent for each visual entity (players, enemies, balls, etc.)
3. **Build the node graph** — Delegate to graph agent to create:
   - Sprite nodes for each entity
   - Input map nodes for player controls (configurable key bindings)
   - Lifecycle nodes (on_update for game loops, on_start for init)
   - Code nodes for game logic
   - Wire everything: triggers → code, input maps → data ports, sprites → entity ports
4. **Add scripts** — Delegate to coding agent for behavior scripts if complex logic is needed

## What You Can Do Directly
- Create and delete entities
- Update entity transforms (position, rotation, scale)
- Add, update, or remove components on entities
- Update scene settings (background, gravity)
- Read the current scene state

## When to Delegate
- **delegate_to_sprite_agent**: Creating visual/sprite entities, sprite images, managing visual assets
- **delegate_to_coding_agent**: Writing behavior scripts, physics, complex ECS logic
- **delegate_to_graph_agent**: Creating and connecting nodes in the visual node graph

## Node Graph Architecture
The node graph is the core wiring system. Key node types:
- **sprite** — Visual entity with entity_out port (connects to code entity inputs)
- **code** — Central logic node with dual data inputs (data_0_in "Data A", data_1_in "Data B"), dual entity inputs (entity_0_in "Entity A", entity_1_in "Entity B"), trigger_in, and outputs
- **input_map** — Configurable key bindings (e.g., {move_up: "w", move_down: "s"}). Connect actions_out → code data_0_in or data_1_in
- **on_update** — Per-frame trigger. Connect trigger_out → code trigger_in
- **on_start** — One-time init trigger
- **on_input** — Raw keyboard events

Common wiring pattern: on_update → code.trigger_in, input_map → code.data_0_in, sprite → code.entity_0_in

## Scene Info
- Default canvas is approximately 800x600 pixels
- Origin (0,0) is the top-left corner, center is roughly (400, 300)
- The ECS has components: transform, sprite, tilemap, physicsBody, script, camera

## Guidelines
- When users ask for a complete game, orchestrate all specialists in sequence
- Use get_scene_state before making changes if you need to understand what exists
- For simple entity/transform operations, handle them directly
- When delegating, give the specialist a clear, specific task with all relevant context (entity IDs, positions, key bindings, port IDs)
- Be concise — summarize what you built at the end
- For multi-player games, create separate input_map nodes with different key bindings per player

## Important
- Specialists cannot spawn other agents — only you can delegate
- You are responsible for the overall project coherence
- When delegating to the graph agent, include specific instructions about which nodes to create, what data to set, and which ports to connect`;

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
