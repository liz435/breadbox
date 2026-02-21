import { z } from "zod";
import {
  nonEmptyStringSchema,
  timestampSchema,
  assetSchema,
  entitySchema,
  transformComponentSchema,
  sceneSettingsSchema,
} from "./project";

// ── Op Base ─────────────────────────────────────────────────────────────────

export const opBaseSchema = z.object({
  opId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  sceneId: nonEmptyStringSchema,
  expectedVersion: z.number().int().nonnegative(),
  timestamp: timestampSchema,
});

// ── Component Type ──────────────────────────────────────────────────────────

const componentTypeSchema = z.enum([
  "transform",
  "sprite",
  "tilemap",
  "physicsBody",
  "script",
  "camera",
]);

// ── Individual Ops ──────────────────────────────────────────────────────────

const createEntityOpSchema = opBaseSchema.extend({
  kind: z.literal("create_entity"),
  payload: z.object({
    entity: entitySchema,
    index: z.number().int().nonnegative().optional(),
  }),
});

const deleteEntityOpSchema = opBaseSchema.extend({
  kind: z.literal("delete_entity"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    cascade: z.boolean().default(true),
  }),
});

const reparentEntityOpSchema = opBaseSchema.extend({
  kind: z.literal("reparent_entity"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    nextParentId: z.string().min(1).nullable(),
    index: z.number().int().nonnegative().optional(),
  }),
});

const reorderChildrenOpSchema = opBaseSchema.extend({
  kind: z.literal("reorder_children"),
  payload: z.object({
    parentId: z.string().min(1).nullable(),
    childIds: z.array(nonEmptyStringSchema),
  }),
});

const updateTransformOpSchema = opBaseSchema.extend({
  kind: z.literal("update_transform"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    patch: transformComponentSchema
      .omit({ entityId: true })
      .partial()
      .refine((value) => Object.keys(value).length > 0, {
        message: "Transform patch must include at least one field",
      }),
  }),
});

const addComponentOpSchema = opBaseSchema.extend({
  kind: z.literal("add_component"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    componentType: componentTypeSchema,
    value: z.unknown(),
  }),
});

const updateComponentOpSchema = opBaseSchema.extend({
  kind: z.literal("update_component"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    componentType: componentTypeSchema,
    patch: z.record(z.string(), z.unknown()),
  }),
});

const removeComponentOpSchema = opBaseSchema.extend({
  kind: z.literal("remove_component"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    componentType: componentTypeSchema,
  }),
});

const createAssetOpSchema = opBaseSchema.extend({
  kind: z.literal("create_asset"),
  payload: z.object({
    asset: assetSchema,
  }),
});

const updateSceneSettingsOpSchema = opBaseSchema.extend({
  kind: z.literal("update_scene_settings"),
  payload: z.object({
    patch: sceneSettingsSchema.partial().refine((value) => Object.keys(value).length > 0, {
      message: "Scene settings patch must include at least one field",
    }),
  }),
});

const patchScriptOpSchema = opBaseSchema.extend({
  kind: z.literal("patch_script"),
  payload: z.object({
    entityId: nonEmptyStringSchema,
    scriptId: nonEmptyStringSchema,
    patch: z.object({
      code: z.string().optional(),
      exports: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
});

// ── SceneOp (discriminated union) ───────────────────────────────────────────

export const sceneOpSchema = z.discriminatedUnion("kind", [
  createEntityOpSchema,
  deleteEntityOpSchema,
  reparentEntityOpSchema,
  reorderChildrenOpSchema,
  updateTransformOpSchema,
  addComponentOpSchema,
  updateComponentOpSchema,
  removeComponentOpSchema,
  createAssetOpSchema,
  updateSceneSettingsOpSchema,
  patchScriptOpSchema,
]);

export type SceneOp = z.infer<typeof sceneOpSchema>;

// ── ApplyOps Request ────────────────────────────────────────────────────────

export const applyOpsRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  ops: z.array(sceneOpSchema).min(1),
});

export type ApplyOpsRequest = z.infer<typeof applyOpsRequestSchema>;
