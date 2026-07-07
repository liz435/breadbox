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
  /** User scale on top of the import normalisation — a uniform factor or a
   * per-axis [x, y, z] triple (the scale gizmo can stretch a single axis). */
  scale: z.union([z.number().positive(), vec3Schema]).default(1),
});
export type AssemblyTransform = z.infer<typeof assemblyTransformSchema>;

/** Normalise a stored scale (uniform number or per-axis tuple) to a Vec3. */
export function scaleToVec3(scale: number | Vec3): Vec3 {
  return typeof scale === "number" ? [scale, scale, scale] : scale;
}

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

/**
 * Joint in body-local space. A bound signal moves the body around/along
 * `axis` through `pivot` (both in the body's local frame): `rotate` is a
 * hinge (value in degrees), `slide` is a linear rail (value in mm along the
 * axis). Older saves carry no `kind` and parse as rotate.
 */
export const assemblyJointSchema = z.object({
  pivot: vec3Schema,
  axis: vec3Schema,
  kind: z.enum(["rotate", "slide"]).default("rotate"),
});
export type AssemblyJoint = z.infer<typeof assemblyJointSchema>;

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
  joint: assemblyJointSchema.optional(),
  /** Loop the animation clips baked into a GLB file while enabled. */
  playAnimations: z.boolean().optional(),
});
export type AssemblyBody = z.infer<typeof assemblyBodySchema>;

/**
 * Drives one body channel from one simulator signal. `signal` names a
 * custom-DSL behavior signal, or a built-in peripheral value ("angle" for a
 * servo). The linear map converts the raw signal value to the channel's
 * unit: degrees for `rotate`, mm for `slide`, 0..1 intensity for
 * `emissive`. `rotate` and `slide` drive the body's joint; `emissive`
 * lights the body's materials and needs no joint. A body holds at most one
 * joint binding and one emissive binding.
 */
export const assemblyBindingSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  signal: z.string().min(1),
  bodyId: z.string().min(1),
  channel: z.enum(["rotate", "slide", "emissive"]).default("rotate"),
  map: z
    .object({ scale: z.number().default(1), offset: z.number().default(0) })
    .default({ scale: 1, offset: 0 }),
});
export type AssemblyBinding = z.infer<typeof assemblyBindingSchema>;

/** True when the binding drives the body's joint (vs. its materials). */
export function isJointBindingChannel(channel: AssemblyBinding["channel"]): boolean {
  return channel === "rotate" || channel === "slide";
}

export const assemblyDocSchema = z.object({
  bodies: z.record(z.string(), assemblyBodySchema).default({}),
  bindings: z.array(assemblyBindingSchema).default([]),
});
export type AssemblyDoc = z.infer<typeof assemblyDocSchema>;

export function createEmptyAssembly(): AssemblyDoc {
  return { bodies: {}, bindings: [] };
}

/**
 * Repair an assembly against a new set of placed components — used when a
 * board is replaced wholesale (apply_design, shared-diagram load) so the
 * user's uploaded models survive the swap. Bodies mounted on a component
 * that no longer exists fall back to the world (keeping their stored
 * transform), and bindings whose source component is gone are dropped.
 */
export function repairAssemblyForComponents(
  assembly: AssemblyDoc,
  componentIds: Iterable<string>,
): AssemblyDoc {
  const ids = componentIds instanceof Set ? componentIds : new Set(componentIds);
  const bodies: Record<string, AssemblyBody> = {};
  for (const [bodyId, body] of Object.entries(assembly.bodies)) {
    bodies[bodyId] =
      body.parent.kind === "component" && !ids.has(body.parent.componentId)
        ? { ...body, parent: { kind: "world" } }
        : body;
  }
  return {
    bodies,
    bindings: assembly.bindings.filter((binding) => ids.has(binding.componentId)),
  };
}
