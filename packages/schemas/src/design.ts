// ── DreamerDiagram (DSL v1) ─────────────────────────────────────────────────
//
// A single-JSON interchange format for a complete Dreamer project —
// components, wires, sketch, environment. Designed for LLM generation and
// human authoring: components live in a stable-ordered array, wires reference
// pins by readable strings (`arduino.13`, `led1.anode`, `psu1.+`) instead of
// raw grid coordinates, and a version tag (`$schema`) gates future
// evolution.
//
// Runtime still uses `BoardState` (see arduino.ts) — this DSL is a pure
// interchange layer. Conversion both directions lives in diagram-adapter.ts.

import { z } from "zod";
import { boardTargetSchema } from "./board-targets";
import { componentTypeSchema } from "./arduino";

export const DIAGRAM_SCHEMA_V1 = "dreamer-diagram-v1" as const;

// ── Sub-schemas ──────────────────────────────────────────────────────────

/**
 * Component in the diagram. `at` is `[x, y]` breadboard grid coords — same
 * semantics as `BoardComponent.x/y`. `pins` is optional: when omitted, the
 * wire topology determines pin assignment.
 */
export const diagramComponentSchema = z.object({
  id: z
    .string()
    .min(1)
    .refine(
      (id) => id.toLowerCase() !== "arduino" && id.toLowerCase() !== "grid",
      { message: "component id must not be 'arduino' or 'grid' (reserved)" },
    ),
  type: componentTypeSchema,
  /** `[x, y]` grid coords. Omits `0, 0` default so absent == at-origin. */
  at: z.tuple([z.number().int(), z.number().int()]),
  rotation: z.number().default(0),
  name: z.string().optional(),
  pins: z.record(z.string(), z.number().nullable()).optional(),
  properties: z.record(z.string(), z.unknown()).default({}),
});
export type DiagramComponent = z.infer<typeof diagramComponentSchema>;

/**
 * Wire — endpoints use the grammar documented in diagram-adapter.ts. The
 * adapter resolves each string to `(row, col)` at import time; invalid
 * strings fail the whole parse (atomic).
 */
export const diagramWireSchema = z.object({
  /** Auto-generated on import if absent. Useful when authoring by hand. */
  id: z.string().optional(),
  from: z.string(),
  to: z.string(),
  color: z.string().default("#22c55e"),
});
export type DiagramWire = z.infer<typeof diagramWireSchema>;

export const diagramObstacleSchema = z.object({
  id: z.string().min(1),
  shape: z.enum(["wall", "box"]),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  label: z.string().default(""),
});
export type DiagramObstacle = z.infer<typeof diagramObstacleSchema>;

export const diagramEnvironmentSchema = z.object({
  /** Array for stable ordering in git diffs; converted to record on import. */
  obstacles: z.array(diagramObstacleSchema).default([]),
  boundaryEnabled: z.boolean().default(true),
  boundaryMargin: z.number().default(100),
});
export type DiagramEnvironment = z.infer<typeof diagramEnvironmentSchema>;

export const diagramCustomLibrarySchema = z.object({
  name: z.string().min(1),
  code: z.string(),
  description: z.string().default(""),
});
export type DiagramCustomLibrary = z.infer<typeof diagramCustomLibrarySchema>;

// ── Top-level schema ─────────────────────────────────────────────────────

export const diagramSchema = z.object({
  $schema: z.literal(DIAGRAM_SCHEMA_V1),
  board: boardTargetSchema.optional(),
  sketch: z.string().default(""),
  components: z.array(diagramComponentSchema).default([]),
  wires: z.array(diagramWireSchema).default([]),
  environment: diagramEnvironmentSchema.optional(),
  /** Custom library files compiled alongside the sketch. */
  customLibraries: z.array(diagramCustomLibrarySchema).default([]),
});

/** Post-parse shape — all defaults applied. Use when reading from the adapter. */
export type DreamerDiagram = z.infer<typeof diagramSchema>;

/** Pre-parse shape — defaults optional. Use when authoring a diagram or in tests. */
export type DreamerDiagramInput = z.input<typeof diagramSchema>;
