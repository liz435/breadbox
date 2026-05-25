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
  /**
   * Surface board (`breadboard_full` | `perfboard_generic`) this component
   * lives on. `null` for board-type components themselves (they live in
   * world coords). Omitted when the project has a single default board and
   * the adapter can infer it on read.
   */
  parentId: z.string().nullable().optional(),
  /** World-space coords for board-type components. Ignored for non-boards. */
  worldX: z.number().optional(),
  worldY: z.number().optional(),
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
  /**
   * Board-scoped endpoint pair. Populated by the adapter on write so a
   * round-trip preserves which board a wire endpoint lives on. Optional on
   * input: hand-authored diagrams can omit them and the adapter derives
   * them at parse time. Useful when boards{} contains 2+ surface boards.
   */
  fromBoardId: z.string().optional(),
  fromStrip: z.string().optional(),
  toBoardId: z.string().optional(),
  toStrip: z.string().optional(),
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

// ── Tool-facing schema ───────────────────────────────────────────────────
//
// Anthropic's tool-input JSON Schema validator rejects property keys that
// don't match `^[a-zA-Z0-9_.-]{1,64}$`, and `$schema` starts with `$`. So
// when we hand a zod schema to the AI SDK `tool({ inputSchema })`, the DSL's
// `$schema` field would blow up the request before the model is even asked.
//
// Solution: the tool-facing schema omits `$schema`. The canonical DSL still
// carries it for persistence / chat display / URL import. Tool handlers
// re-attach `$schema: DIAGRAM_SCHEMA_V1` before running the canonical
// `diagramSchema`-based validators / adapters.
export const diagramToolInputSchema = diagramSchema.omit({ $schema: true });

/** Input shape accepted by `validate_design` / `apply_design` tool handlers. */
export type DiagramToolInput = z.input<typeof diagramToolInputSchema>;

/**
 * Re-attach the schema-version discriminator the canonical `diagramSchema`
 * requires. The tool handler runs this on its input before handing it to
 * `validateDiagram` / `diagramToBoardState`.
 */
export function withDiagramSchemaVersion(input: DiagramToolInput): DreamerDiagramInput {
  return { ...input, $schema: DIAGRAM_SCHEMA_V1 };
}
