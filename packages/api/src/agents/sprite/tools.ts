import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile, SceneOp } from "../../db/schemas";
import { makeOp } from "../make-op";

/**
 * Creates tools for the sprite specialist agent.
 * All tools push SceneOps into the shared `ops` array.
 */
export function createSpriteTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: SceneOp[];
}) {
  const { project, sceneId, ops } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  return {
    create_sprite_entity: tool({
      description:
        "Create a new sprite entity with a transform and sprite component. Creates a placeholder asset. Returns the entity and asset IDs.",
      inputSchema: z.object({
        name: z.string().describe("Display name for the sprite entity"),
        x: z.number().optional().describe("X position (default 0)"),
        y: z.number().optional().describe("Y position (default 0)"),
        width: z.number().optional().describe("Width in pixels (default 64)"),
        height: z.number().optional().describe("Height in pixels (default 64)"),
        tint: z
          .string()
          .optional()
          .describe("Tint color as hex string, e.g. '#ff0000'"),
        layer: z
          .number()
          .int()
          .optional()
          .describe("Render layer (higher = on top)"),
      }),
      execute: async (input) => {
        const entityId = crypto.randomUUID();
        const assetId = crypto.randomUUID();

        const entity = {
          id: entityId,
          sceneId,
          name: input.name,
          parentId: null,
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

        const asset = {
          id: assetId,
          projectId,
          type: "sprite" as const,
          uri: `placeholder://${input.name.toLowerCase().replace(/\s+/g, "-")}`,
          meta: {
            width: input.width ?? 64,
            height: input.height ?? 64,
            placeholder: true,
          },
        };

        const sprite = {
          entityId,
          assetId,
          tint: input.tint,
          layer: input.layer,
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
        ops.push(makeOp(opCtx, { kind: "create_asset", payload: { asset } }));
        ops.push(
          makeOp(opCtx, {
            kind: "add_component",
            payload: {
              entityId,
              componentType: "sprite",
              value: sprite,
            },
          })
        );

        return { entityId, assetId, name: input.name };
      },
    }),

    update_sprite: tool({
      description:
        "Update a sprite entity's transform or sprite component properties.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the entity to update"),
        x: z.number().optional().describe("New X position"),
        y: z.number().optional().describe("New Y position"),
        rotation: z.number().optional().describe("New rotation in radians"),
        scaleX: z.number().optional().describe("Horizontal scale"),
        scaleY: z.number().optional().describe("Vertical scale"),
        tint: z.string().optional().describe("New tint color hex"),
        layer: z.number().int().optional().describe("New render layer"),
      }),
      execute: async (input) => {
        const { entityId, tint, layer, ...transformPatch } = input;
        const cleanTransform = Object.fromEntries(
          Object.entries(transformPatch).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(cleanTransform).length > 0) {
          ops.push(
            makeOp(opCtx, {
              kind: "update_transform",
              payload: {
                entityId,
                patch: cleanTransform,
              },
            })
          );
        }

        const spritePatch: Record<string, unknown> = {};
        if (tint !== undefined) spritePatch.tint = tint;
        if (layer !== undefined) spritePatch.layer = layer;
        if (Object.keys(spritePatch).length > 0) {
          ops.push(
            makeOp(opCtx, {
              kind: "update_component",
              payload: {
                entityId,
                componentType: "sprite",
                patch: spritePatch,
              },
            })
          );
        }

        return { updated: entityId };
      },
    }),

    remove_sprite: tool({
      description: "Delete a sprite entity and all its components.",
      inputSchema: z.object({
        entityId: z.string().describe("ID of the sprite entity to remove"),
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

    list_entities: tool({
      description:
        "List all entities in the current scene with their components. Use this to understand what exists before making changes.",
      inputSchema: z.object({}),
      execute: async () => {
        const entityIds = project.sceneEntityIds[sceneId] ?? [];
        return entityIds.map((id) => {
          const entity = project.entities[id];
          const transform = project.components.transform[id];
          const sprite = project.components.sprite[id];
          return { entity, transform, sprite };
        });
      },
    }),
  };
}
