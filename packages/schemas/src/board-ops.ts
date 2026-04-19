import { z } from "zod";
import { nonEmptyStringSchema, timestampSchema } from "./primitives";
import { boardComponentSchema, boardStateSchema, wireSchema, pinModeSchema } from "./arduino";

// ── Board Op Base ──────────────────────────────────────────────────────────

export const boardOpBaseSchema = z.object({
  opId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  sceneId: nonEmptyStringSchema,
  expectedVersion: z.number().int().nonnegative(),
  timestamp: timestampSchema,
});

// ── Individual Board Ops ───────────────────────────────────────────────────

const placeComponentOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("place_component"),
  payload: z.object({
    component: boardComponentSchema,
  }),
});

const removeComponentOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("remove_component"),
  payload: z.object({
    componentId: nonEmptyStringSchema,
  }),
});

const moveComponentOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("move_component"),
  payload: z.object({
    componentId: nonEmptyStringSchema,
    x: z.number(),
    y: z.number(),
  }),
});

const updateComponentOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("update_component"),
  payload: z.object({
    componentId: nonEmptyStringSchema,
    changes: boardComponentSchema.partial(),
  }),
});

const connectWireOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("connect_wire"),
  payload: z.object({
    wire: wireSchema,
  }),
});

const removeWireOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("remove_wire"),
  payload: z.object({
    wireId: nonEmptyStringSchema,
  }),
});

const setPinModeOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("set_pin_mode"),
  payload: z.object({
    pin: z.number().int().min(0).max(19),
    mode: pinModeSchema,
  }),
});

const updateSketchOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("update_sketch"),
  payload: z.object({
    code: z.string(),
  }),
});

const updateBoardSettingsOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("update_board_settings"),
  payload: z.object({
    settings: z.record(z.string(), z.unknown()),
  }),
});

const loadBoardOpSchema = boardOpBaseSchema.extend({
  kind: z.literal("load_board"),
  payload: z.object({
    state: boardStateSchema,
  }),
});

// ── BoardOp (discriminated union) ──────────────────────────────────────────

export const boardOpSchema = z.discriminatedUnion("kind", [
  placeComponentOpSchema,
  removeComponentOpSchema,
  moveComponentOpSchema,
  updateComponentOpSchema,
  connectWireOpSchema,
  removeWireOpSchema,
  setPinModeOpSchema,
  updateSketchOpSchema,
  updateBoardSettingsOpSchema,
  loadBoardOpSchema,
]);

export type BoardOp = z.infer<typeof boardOpSchema>;

// ── Apply Board Ops Request ────────────────────────────────────────────────

export const applyBoardOpsRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  ops: z.array(boardOpSchema).min(1),
});

export type ApplyBoardOpsRequest = z.infer<typeof applyBoardOpsRequestSchema>;
