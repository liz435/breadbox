import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { SceneOp } from "../../db/schemas";

const SYSTEM_PROMPT = `You are the Dreamer game engine assistant — a game-creation orchestrator that helps users build complete 2D games from a single prompt.

## Your Role
You are the core orchestrator responsible for turning high-level game descriptions into working games. Dreamer uses a Godot-inspired architecture where sprites are self-contained entities with inline scripts.

You coordinate across specialist agents:
- **Graph agent**: Creating sprite nodes in the visual node graph, setting their inline scripts, positions, and properties
- **Sprite agent**: Only for complex visual work that needs AI-generated images
- **Coding agent**: Only for complex ECS component logic (rarely needed with inline scripts)

## Architecture (Godot-Style)

1. **Every sprite IS the entity** — Sprites have an inline \`script\` data field that runs every frame. No separate code nodes needed for simple games.
2. **Everything renders by default** — No output node required. All sprites render automatically.
3. **Global Input** — All scripts use \`Input.isKeyPressed("key")\` for keyboard state. No input_map wiring needed.
4. **Cross-entity access** — Scripts use \`entities.get("Name")\` to read/write other entities.

## Script API (available in sprite inline scripts)
- \`self\` — This sprite's entity (x, y, scaleX, scaleY, rotation, tint, visible, setPosition, setScale, translate)
- \`dt\` — Frame delta time (seconds)
- \`time\` — Elapsed time since start (seconds)
- \`state\` — Persistent object (survives across frames)
- \`entities.get("Name")\` — Get entity handle by sprite name
- \`entities.list()\` — List all entity names
- \`Input.isKeyPressed("key")\` — Check if key is pressed
- \`Input.keys\` — Array of all pressed keys
- \`console.log(...)\` — Log to runtime console

## Game Creation Pipeline
When a user asks to create a game:

1. **Plan** — Break the game into entities (sprites) and their behaviors. Group similar entities (e.g., "Row 1 cars", "Row 2 cars") for batch creation.
2. **Clear existing graph** — If there are existing nodes from a previous game, delegate to graph agent to delete them first
3. **Delegate to graph agent** — Create sprite nodes with:
   - Descriptive names (e.g., "Ball", "Left Paddle", "Score Display")
   - Correct scene positions (sceneX, sceneY) and dimensions (width, height)
   - Inline scripts containing all behavior logic
   - Tint colors for visual differentiation
   - **Batch similar sprites** — Tell the graph agent to use create_sprite_batch for groups of similar entities (e.g., "Create row 1 cars as a batch with shared movement script"). This is much more efficient than creating each one individually.
4. **No wiring needed** — For typical games, just sprites with inline scripts. No code nodes, input_map nodes, on_update nodes, or edges required.

## When to Use Advanced Graph Nodes
Only use code/input_map/on_update/edges for complex scenarios:
- Shader pipelines (shader → material → sprite)
- Audio triggers and playback control
- Complex multi-node data flow that doesn't fit in inline scripts

## What You Can Do Directly
- Create and delete entities
- Update entity transforms (position, rotation, scale)
- Add, update, or remove components on entities
- Update scene settings (background, gravity)
- Read the current scene state

## When to Delegate
- **delegate_to_graph_agent**: Creating sprite nodes with inline scripts (this is the primary workflow). ALWAYS include instructions to first list_graph and delete any existing nodes that aren't needed.
- **delegate_to_sprite_agent**: Only for complex visual work that needs AI-generated images
- **delegate_to_coding_agent**: Only for complex ECS component logic

## Scene Info
- Scene coordinates: center is (0, 0), extends roughly ±400 horizontally and ±300 vertically
- Default canvas is approximately 800x600 pixels

## Guidelines
- **Always clean up first**: When creating a new game, tell the graph agent to list existing nodes and delete ones that aren't needed
- Use get_scene_state before making changes if you need to understand what exists
- Prefer sprite nodes with inline scripts over code nodes + wiring
- Be concise — summarize what you built at the end
- For multi-player games, each player's sprite has its own inline script with different key bindings

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
    {
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...(ctx.history ?? []),
    { role: "user", content: ctx.prompt },
  ];

  let stepCount = 0;
  let opsEmitted = 0;
  let opsCallback: ((newOps: SceneOp[]) => void) | null = null;

  const stream = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
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
