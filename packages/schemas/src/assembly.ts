// ── 3D assembly document ─────────────────────────────────────────────────────
//
// Persisted state for the 3D Breadboard view: user-uploaded meshes ("bodies"),
// how they parent onto each other or onto placed components (a printed arm
// bolted to a servo horn), and signal bindings that let simulator signals
// drive body joints. Stored inside BoardState so it rides the existing
// save/load/undo paths.
//
// Units: millimeters, matching the 3D scene. Angles are radians.

import { z } from "zod";

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof vec3Schema>;

export const assemblyTransformSchema = z.object({
  position: vec3Schema.default([0, 0, 0]),
  /** XYZ Euler rotation, radians. */
  rotation: vec3Schema.default([0, 0, 0]),
  /** Uniform user scale on top of the import normalisation. */
  scale: z.number().positive().default(1),
});
export type AssemblyTransform = z.infer<typeof assemblyTransformSchema>;

/**
 * What a body is mounted on. `component` parents the body onto a placed board
 * component — optionally onto its moving node, so the body inherits the
 * motion the simulator drives (`angle` = servo horn, `spin` = motor shaft).
 */
export const bodyParentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("world") }),
  z.object({ kind: z.literal("body"), bodyId: z.string().min(1) }),
  z.object({
    kind: z.literal("component"),
    componentId: z.string().min(1),
    node: z.enum(["body", "angle", "spin"]).default("body"),
  }),
]);
export type BodyParent = z.infer<typeof bodyParentSchema>;

export const modelFormatSchema = z.enum(["glb", "stl"]);
export type ModelFormat = z.infer<typeof modelFormatSchema>;

export const assemblyBodySchema = z.object({
  id: z.string().min(1),
  /** Display name shown in the assembly tree (defaults to the file name). */
  name: z.string().min(1),
  /** Project asset id of the uploaded mesh file. */
  assetId: z.string().min(1),
  /** Serve path of the uploaded file (mirrors the project Asset's uri). */
  uri: z.string().min(1),
  format: modelFormatSchema,
  /** Named node within a GLB scene graph; the whole scene when omitted. */
  node: z.string().optional(),
  parent: bodyParentSchema.default({ kind: "world" }),
  transform: assemblyTransformSchema.default({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
  }),
  /**
   * Import normalisation applied before `transform`: uniform unit fix-up
   * (e.g. a meters-unit GLB into the mm world needs 1000) and the source
   * file's up axis (z-up sources are rotated to y-up at load).
   */
  importScale: z.number().positive().default(1),
  upAxis: z.enum(["y", "z"]).default("y"),
  /**
   * Optional rotation joint in body-local space. A bound signal rotates the
   * body around `axis` through `pivot` (both in the body's local frame).
   */
  joint: z
    .object({ pivot: vec3Schema, axis: vec3Schema })
    .optional(),
});
export type AssemblyBody = z.infer<typeof assemblyBodySchema>;

/**
 * Drives one body channel from one simulator signal. `signal` names a
 * custom-DSL behavior signal, or a built-in peripheral value ("angle" for a
 * servo, "speed" for a motor). The linear map converts the raw signal value
 * to the channel's unit: degrees for `rotate`, 0..1 intensity for `emissive`.
 */
export const assemblyBindingSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  signal: z.string().min(1),
  bodyId: z.string().min(1),
  channel: z.enum(["rotate", "emissive"]).default("rotate"),
  map: z
    .object({ scale: z.number().default(1), offset: z.number().default(0) })
    .default({ scale: 1, offset: 0 }),
});
export type AssemblyBinding = z.infer<typeof assemblyBindingSchema>;

export const assemblyDocSchema = z.object({
  bodies: z.record(z.string(), assemblyBodySchema).default({}),
  bindings: z.array(assemblyBindingSchema).default([]),
});
export type AssemblyDoc = z.infer<typeof assemblyDocSchema>;

export function createEmptyAssembly(): AssemblyDoc {
  return { bodies: {}, bindings: [] };
}
