import { z } from "zod";
import {
  nonEmptyStringSchema,
  timestampSchema,
  vec2Schema,
} from "./primitives";
import { graphNodeSchema, edgeSchema } from "./graph";
import { boardStateSchema } from "./arduino";

// Re-export primitives for backwards compatibility
export { nonEmptyStringSchema, timestampSchema, vec2Schema };

// ── Scene Settings ──────────────────────────────────────────────────────────

export const sceneSettingsSchema = z.object({
  background: nonEmptyStringSchema,
  gravity: vec2Schema,
});

// ── Project ─────────────────────────────────────────────────────────────────

export const projectSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  // Owner is required so any project file missing this field fails parse and
  // gets picked up by the ownership migration (hosted mode) or stamped with
  // `ownerId: "local"` (local/dev mode) on boot.
  ownerId: nonEmptyStringSchema,
  version: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  threadId: nonEmptyStringSchema,
  activeSceneId: nonEmptyStringSchema,
});

export type Project = z.infer<typeof projectSchema>;

// ── Scene ───────────────────────────────────────────────────────────────────

export const sceneSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  version: z.number().int().nonnegative(),
  settings: sceneSettingsSchema,
});

export type Scene = z.infer<typeof sceneSchema>;

// ── Entity ──────────────────────────────────────────────────────────────────

/**
 * Entity is an instantiated scene node (not a blueprint/prefab).
 * Blueprints can be introduced later as separate assets/types.
 */
export const entitySchema = z.object({
  id: nonEmptyStringSchema,
  sceneId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  parentId: z.string().min(1).nullable(),
  childIds: z.array(nonEmptyStringSchema),
  enabled: z.boolean(),
});

export type Entity = z.infer<typeof entitySchema>;

// ── Components (normalized by entityId) ─────────────────────────────────────

export const transformComponentSchema = z.object({
  entityId: nonEmptyStringSchema,
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
});

export type TransformComponent = z.infer<typeof transformComponentSchema>;

export const spriteComponentSchema = z.object({
  entityId: nonEmptyStringSchema,
  assetId: nonEmptyStringSchema,
  tint: z.string().optional(),
  layer: z.number().int().optional(),
});

export type SpriteComponent = z.infer<typeof spriteComponentSchema>;

export const tilemapComponentSchema = z.object({
  entityId: nonEmptyStringSchema,
  assetId: nonEmptyStringSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tileSize: z.number().positive(),
});

export type TilemapComponent = z.infer<typeof tilemapComponentSchema>;

export const physicsBodyKindSchema = z.enum(["dynamic", "static", "kinematic"]);

export const physicsBodyComponentSchema = z.object({
  entityId: nonEmptyStringSchema,
  kind: physicsBodyKindSchema,
  mass: z.number().positive().optional(),
  isStatic: z.boolean().optional(),
});

export type PhysicsBodyComponent = z.infer<typeof physicsBodyComponentSchema>;

export const scriptComponentSchema = z.object({
  entityId: nonEmptyStringSchema,
  scriptId: nonEmptyStringSchema,
  exportedVars: z.record(z.string(), z.unknown()).optional(),
});

export type ScriptComponent = z.infer<typeof scriptComponentSchema>;

export const cameraComponentSchema = z.object({
  entityId: nonEmptyStringSchema,
  zoom: z.number().positive(),
  followTargetId: z.string().min(1).optional(),
});

export type CameraComponent = z.infer<typeof cameraComponentSchema>;

export const componentsSchema = z.object({
  transform: z.record(z.string(), transformComponentSchema),
  sprite: z.record(z.string(), spriteComponentSchema),
  tilemap: z.record(z.string(), tilemapComponentSchema),
  physicsBody: z.record(z.string(), physicsBodyComponentSchema),
  script: z.record(z.string(), scriptComponentSchema),
  camera: z.record(z.string(), cameraComponentSchema),
});

export type Components = z.infer<typeof componentsSchema>;

// ── Assets ──────────────────────────────────────────────────────────────────

export const assetTypeSchema = z.enum([
  "sprite",
  "spritesheet",
  "tilemap",
  "script",
  "shader",
  "audio",
  "video",
  "text",
  "material",
  "font",
  "model",
]);

export const assetSchema = z.object({
  id: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  type: assetTypeSchema,
  uri: nonEmptyStringSchema,
  meta: z.record(z.string(), z.unknown()),
});

export type Asset = z.infer<typeof assetSchema>;

// ── ProjectFile (the shape stored on disk) ──────────────────────────────────

// Inner shape of `projectFile.graph` — exported so the persistence routes can
// validate save payloads against the same schema the project file uses.
export const projectGraphSchema = z.object({
  nodes: z.record(z.string(), graphNodeSchema),
  edges: z.record(z.string(), edgeSchema),
});
export type ProjectGraph = z.infer<typeof projectGraphSchema>;

export const projectFileSchema = z.object({
  project: projectSchema,
  scenes: z.record(z.string(), sceneSchema),
  entities: z.record(z.string(), entitySchema),
  sceneEntityIds: z.record(z.string(), z.array(nonEmptyStringSchema)),
  components: componentsSchema,
  assets: z.record(z.string(), assetSchema),
  graph: projectGraphSchema.optional(),
  boardState: boardStateSchema.optional(),
});

export type ProjectFile = z.infer<typeof projectFileSchema>;
