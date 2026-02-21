import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile, SceneOp } from "../../db/schemas";
import { makeOp } from "../make-op";

/**
 * Creates tools for the coding specialist agent.
 * Handles script creation, physics behaviors, and ECS component logic.
 */
export function createCodingTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: SceneOp[];
}) {
  const { project, sceneId, ops } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  return {
    create_script: tool({
      description:
        "Create a new script asset and attach a script component to an entity. The script contains behavior code.",
      inputSchema: z.object({
        entityId: z
          .string()
          .describe("ID of the entity to attach the script to"),
        name: z.string().describe("Name for the script"),
        code: z.string().describe("Script source code (TypeScript/JavaScript)"),
        exportedVars: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Variables exported from the script for inspector editing"
          ),
      }),
      execute: async (input) => {
        const scriptId = crypto.randomUUID();

        const asset = {
          id: scriptId,
          projectId,
          type: "script" as const,
          uri: `script://${input.name.toLowerCase().replace(/\s+/g, "-")}`,
          meta: {
            code: input.code,
            exports: input.exportedVars ?? {},
          },
        };

        const scriptComponent = {
          entityId: input.entityId,
          scriptId,
          exportedVars: input.exportedVars ?? {},
        };

        ops.push(makeOp(opCtx, { kind: "create_asset", payload: { asset } }));
        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId: input.entityId,
              componentType: "script",
              value: scriptComponent,
            },
          })
        );

        return { scriptId, entityId: input.entityId, name: input.name };
      },
    }),

    update_script: tool({
      description:
        "Update an existing script's code or exported variables.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity with the script"),
        scriptId: z.string().describe("ID of the script asset to update"),
        code: z.string().optional().describe("New script source code"),
        exportedVars: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Updated exported variables"),
      }),
      execute: async (input) => {
        const patch: Record<string, unknown> = {};
        if (input.code !== undefined) patch.code = input.code;
        if (input.exportedVars !== undefined)
          patch.exports = input.exportedVars;

        ops.push(
          makeOp(opCtx, {
            kind: "patch_script",
            payload: {
              entityId: input.entityId,
              scriptId: input.scriptId,
              patch,
            },
          })
        );

        return { updated: input.scriptId };
      },
    }),

    add_physics_body: tool({
      description:
        "Add a physics body component to an entity. Makes the entity participate in physics simulation.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity"),
        kind: z
          .enum(["dynamic", "static", "kinematic"])
          .describe(
            "Physics body type: dynamic (affected by forces), static (immovable), kinematic (script-driven)"
          ),
        mass: z.number().positive().optional().describe("Mass (dynamic only)"),
      }),
      execute: async (input) => {
        const value = {
          entityId: input.entityId,
          kind: input.kind,
          mass: input.mass,
        };
        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId: input.entityId,
              componentType: "physicsBody",
              value,
            },
          })
        );
        return { added: "physicsBody", entityId: input.entityId };
      },
    }),

    list_entities: tool({
      description:
        "List all entities in the current scene with their components. Use this to understand what exists before making changes.",
      inputSchema: z.object({}),
      execute: async () => {
        const entityIds = project.sceneEntityIds[sceneId] ?? [];
        return entityIds.map((id) => {
          const entity = project.entities[id];
          const transform = project.components.transform[id];
          const script = project.components.script[id];
          const physicsBody = project.components.physicsBody[id];
          return { entity, transform, script, physicsBody };
        });
      },
    }),
  };
}
