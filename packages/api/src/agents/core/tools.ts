import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile, SceneOp, AgentKind } from "../../db/schemas";
import { getDefaultPorts } from "@dreamer/schemas";
import { agentRunRepo } from "../../db/agent-run-repo";
import { makeOp } from "../make-op";
import type { AgentRunner, DelegationContext } from "../types";
import { runGraphAgent } from "../graph/agent";

/**
 * Creates a delegation tool that spawns a specialist agent run.
 * Extracts the shared boilerplate: create run → execute agent → merge ops → complete run.
 */
function makeDelegationTool(
  agentName: AgentKind,
  runner: AgentRunner,
  description: string,
  delegation: DelegationContext,
  ops: SceneOp[],
) {
  return tool({
    description,
    inputSchema: z.object({
      task: z.string().describe(`Description of the ${agentName} task to delegate`),
    }),
    execute: async (input) => {
      const log = delegation.parentLog.child(`delegate:${agentName}`);
      log.info(`delegating: ${input.task.slice(0, 100)}`);

      const childRun = await agentRunRepo.createRun({
        threadId: delegation.threadId,
        projectId: delegation.projectId,
        sceneId: delegation.sceneId,
        sessionId: delegation.sessionId,
        prompt: input.task,
        agent: agentName,
        parentRunId: delegation.parentRunId,
      });
      await agentRunRepo.attachRunToThread(delegation.threadId, childRun.run.id);

      try {
        const result = await runner({
          prompt: input.task,
          project: delegation.project,
          sceneId: delegation.sceneId,
          runId: childRun.run.id,
          threadId: delegation.threadId,
          projectId: delegation.projectId,
          sessionId: delegation.sessionId,
          parentLog: log,
        });

        for (const op of result.proposedOps) {
          ops.push(op);
        }

        await agentRunRepo.completeRun({
          runId: childRun.run.id,
          assistantText: result.assistantText,
          messages: result.messages,
          proposedOps: result.proposedOps,
          appliedOps: [],
        });

        log.info(
          `${agentName} agent returned — ${result.proposedOps.length} ops, text: ${result.assistantText.slice(0, 80)}`
        );

        return {
          assistantText: result.assistantText,
          opsCount: result.proposedOps.length,
        };
      } catch (err) {
        log.error(`${agentName} agent failed`, err);
        await agentRunRepo.completeRun({
          runId: childRun.run.id,
          proposedOps: [],
          appliedOps: [],
          error: String(err),
        }).catch((e) => log.warn(`failed to mark ${agentName} run as errored: ${e}`));
        return {
          error: `${agentName} agent failed: ${err instanceof Error ? err.message : String(err)}`,
          opsCount: 0,
        };
      }
    },
  });
}

/**
 * Creates the scene manipulation + delegation tools for the core agent.
 *
 * Takes a mutable `ops` array that tools push into, and a `delegation`
 * context for spawning specialist agent runs.
 */
export function createCoreTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: SceneOp[];
  delegation: DelegationContext;
}) {
  const { project, sceneId, ops, delegation } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  return {
    get_scene_state: tool({
      description:
        "Read the current project state including entities, components, and assets. Use this before making changes to understand what exists.",
      inputSchema: z.object({}),
      execute: async () => {
        const scene = project.scenes[sceneId];
        const entityIds = project.sceneEntityIds[sceneId] ?? [];
        const entities = entityIds.map((id) => {
          const entity = project.entities[id];
          const transform = project.components.transform[id];
          const sprite = project.components.sprite[id];
          const script = project.components.script[id];
          const physicsBody = project.components.physicsBody[id];
          return { entity, transform, sprite, script, physicsBody };
        });
        return {
          scene,
          entities,
          assetCount: Object.keys(project.assets).length,
        };
      },
    }),

    create_entity: tool({
      description:
        "Create a new entity in the scene with a transform component. Returns the entity ID.",
      inputSchema: z.object({
        name: z.string().describe("Display name for the entity"),
        x: z.number().optional().describe("X position (default 0)"),
        y: z.number().optional().describe("Y position (default 0)"),
        parentId: z
          .string()
          .nullable()
          .optional()
          .describe("Parent entity ID, or null for root"),
      }),
      execute: async (input) => {
        const entityId = crypto.randomUUID();
        const entity = {
          id: entityId,
          sceneId,
          name: input.name,
          parentId: input.parentId ?? null,
          childIds: [],
          enabled: true,
        };
        const transform = {
          entityId,
          x: input.x ?? 0,
          y: input.y ?? 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        };

        ops.push(makeOp(opCtx, { kind: "create_entity", payload: { entity } }));
        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId,
              componentType: "transform",
              value: transform,
            },
          })
        );

        return { entityId, name: input.name };
      },
    }),

    delete_entity: tool({
      description: "Delete an entity and all its children from the scene.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity to delete"),
      }),
      execute: async (input) => {
        ops.push(
          makeOp(opCtx, {
            kind: "delete_entity",
            payload: {
              entityId: input.entityId,
              cascade: true,
            },
          })
        );
        return { deleted: input.entityId };
      },
    }),

    update_transform: tool({
      description:
        "Move, rotate, or scale an entity by patching its transform component.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity"),
        x: z.number().optional().describe("New X position"),
        y: z.number().optional().describe("New Y position"),
        rotation: z.number().optional().describe("New rotation in radians"),
        scaleX: z.number().optional().describe("Horizontal scale"),
        scaleY: z.number().optional().describe("Vertical scale"),
      }),
      execute: async (input) => {
        const { entityId, ...patch } = input;
        const cleanPatch = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined)
        );
        ops.push(
          makeOp(opCtx, {
            kind: "update_transform",
            payload: { entityId, patch: cleanPatch },
          })
        );
        return { updated: entityId, patch: cleanPatch };
      },
    }),

    add_component: tool({
      description:
        "Attach a component to an entity. Component types: sprite, tilemap, physicsBody, script, camera.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity"),
        componentType: z
          .enum(["sprite", "tilemap", "physicsBody", "script", "camera"])
          .describe("Type of component to add"),
        value: z.record(z.string(), z.unknown()).describe("Component data"),
      }),
      execute: async (input) => {
        const value: Record<string, unknown> = { ...input.value, entityId: input.entityId };

        // Auto-generate assetId + placeholder asset for sprite components
        if (input.componentType === "sprite" && !value.assetId) {
          const assetId = crypto.randomUUID();
          value.assetId = assetId;
          ops.push(
            makeOp(opCtx, {
              kind: "create_asset",
              payload: {
                asset: {
                  id: assetId,
                  projectId,
                  type: "sprite" as const,
                  uri: `placeholder://${input.entityId}`,
                  meta: { width: 64, height: 64, placeholder: true },
                },
              },
            })
          );
        }

        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId: input.entityId,
              componentType: input.componentType,
              value,
            },
          })
        );
        return { added: input.componentType, entityId: input.entityId };
      },
    }),

    update_component: tool({
      description: "Modify fields on an existing component.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity"),
        componentType: z
          .enum([
            "transform",
            "sprite",
            "tilemap",
            "physicsBody",
            "script",
            "camera",
          ])
          .describe("Type of component to update"),
        patch: z
          .record(z.string(), z.unknown())
          .describe("Fields to update on the component"),
      }),
      execute: async (input) => {
        ops.push(
          makeOp(opCtx, {
            kind: "update_component",
            payload: {
              entityId: input.entityId,
              componentType: input.componentType,
              patch: input.patch,
            },
          })
        );
        return { updated: input.componentType, entityId: input.entityId };
      },
    }),

    remove_component: tool({
      description: "Detach a component from an entity.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity"),
        componentType: z
          .enum(["sprite", "tilemap", "physicsBody", "script", "camera"])
          .describe("Type of component to remove"),
      }),
      execute: async (input) => {
        ops.push(
          makeOp(opCtx, {
            kind: "remove_component",
            payload: {
              entityId: input.entityId,
              componentType: input.componentType,
            },
          })
        );
        return { removed: input.componentType, entityId: input.entityId };
      },
    }),

    update_scene_settings: tool({
      description:
        "Update scene settings like background color or gravity.",
      inputSchema: z.object({
        background: z.string().optional().describe("Background color hex"),
        gravity: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe("Gravity vector"),
      }),
      execute: async (input) => {
        const patch = Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined)
        );
        ops.push(makeOp(opCtx, { kind: "update_scene_settings", payload: { patch } }));
        return { updated: "scene_settings", patch };
      },
    }),

    create_quick_sprite: tool({
      description:
        "Create a simple solid-color sprite entity with an optional inline script. Prefer delegating to graph agent for game creation — use this only for quick one-off sprites.",
      inputSchema: z.object({
        name: z.string().describe("Display name for the sprite"),
        sceneX: z.number().optional().describe("Scene X position (default 0, center of canvas)"),
        sceneY: z.number().optional().describe("Scene Y position (default 0, center of canvas)"),
        width: z.number().optional().describe("Width in pixels (default 16)"),
        height: z.number().optional().describe("Height in pixels (default 16)"),
        color: z
          .string()
          .optional()
          .describe("Solid fill color as hex string (default '#ffffff')"),
        script: z
          .string()
          .optional()
          .describe("Inline script code that runs every frame (has access to self, dt, time, state, entities, Input, console)"),
        layer: z
          .number()
          .int()
          .optional()
          .describe("Render layer (higher = on top)"),
      }),
      execute: async (input) => {
        const entityId = crypto.randomUUID();
        const assetId = crypto.randomUUID();
        const w = input.width ?? 16;
        const h = input.height ?? 16;
        const sx = input.sceneX ?? 0;
        const sy = input.sceneY ?? 0;

        ops.push(
          makeOp(opCtx, {
            kind: "create_entity",
            payload: {
              entity: {
                id: entityId,
                sceneId,
                name: input.name,
                parentId: null,
                childIds: [],
                enabled: true,
              },
            },
          })
        );
        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId,
              componentType: "transform",
              value: {
                entityId,
                x: sx,
                y: sy,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
              },
            },
          })
        );
        ops.push(
          makeOp(opCtx, {
            kind: "create_asset",
            payload: {
              asset: {
                id: assetId,
                projectId,
                type: "sprite" as const,
                uri: `placeholder://${input.name.toLowerCase().replace(/\s+/g, "-")}`,
                meta: { width: w, height: h, placeholder: true },
              },
            },
          })
        );
        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId,
              componentType: "sprite",
              value: {
                entityId,
                assetId,
                tint: input.color ?? "#ffffff",
                layer: input.layer,
              },
            },
          })
        );

        // Also create a graph node so the sprite appears in the node graph
        const graphNodeId = crypto.randomUUID();
        const nodeData: Record<string, unknown> = {
          entityId,
          assetId,
          tint: input.color ?? "#ffffff",
          sceneX: sx,
          sceneY: sy,
          width: w,
          height: h,
        };
        if (input.script) {
          nodeData.script = input.script;
        }

        const graphOp = {
          opId: crypto.randomUUID(),
          projectId,
          sceneId,
          expectedVersion,
          timestamp: new Date().toISOString(),
          kind: "create_graph_node" as const,
          payload: {
            node: {
              id: graphNodeId,
              type: "code_block" as const,
              name: input.name,
              x: 60,
              y: (Object.keys(project.graph?.nodes ?? {}).length +
                ops.filter((o) => (o as unknown as { kind: string }).kind === "create_graph_node").length) * 200 + 60,
              width: 240,
              height: 160,
              ports: getDefaultPorts("code_block"),
              data: nodeData,
            },
          },
        };
        // Push as SceneOp — graph ops are filtered on the frontend via isGraphOp()
        ops.push(graphOp as unknown as SceneOp);

        return { entityId, assetId, graphNodeId, name: input.name, width: w, height: h };
      },
    }),

    delegate_to_graph_agent: makeDelegationTool(
      "graph",
      runGraphAgent,
      "Delegate a node graph task to the graph specialist agent. Use this for creating graph nodes (sprite, shader, audio, code, math, etc.), connecting nodes together, or modifying the visual node graph. The specialist manages the node graph that wires up the game's data flow.",
      delegation,
      ops,
    ),
  };
}
