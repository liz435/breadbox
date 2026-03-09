import { z } from "zod";
import { opBaseSchema } from "./ops";
import { nonEmptyStringSchema } from "./primitives";
import { graphNodeSchema, edgeSchema } from "./graph";

// ── Graph Op Kinds ──────────────────────────────────────────────────────────

const createGraphNodeOpSchema = opBaseSchema.extend({
  kind: z.literal("create_graph_node"),
  payload: z.object({
    node: graphNodeSchema,
  }),
});

const deleteGraphNodeOpSchema = opBaseSchema.extend({
  kind: z.literal("delete_graph_node"),
  payload: z.object({
    nodeId: nonEmptyStringSchema,
    cascade: z.boolean().default(true),
  }),
});

const moveGraphNodeOpSchema = opBaseSchema.extend({
  kind: z.literal("move_graph_node"),
  payload: z.object({
    nodeId: nonEmptyStringSchema,
    x: z.number(),
    y: z.number(),
  }),
});

const updateGraphNodeDataOpSchema = opBaseSchema.extend({
  kind: z.literal("update_graph_node_data"),
  payload: z.object({
    nodeId: nonEmptyStringSchema,
    patch: z.record(z.string(), z.unknown()),
  }),
});

const createEdgeOpSchema = opBaseSchema.extend({
  kind: z.literal("create_edge"),
  payload: z.object({
    edge: edgeSchema,
  }),
});

const deleteEdgeOpSchema = opBaseSchema.extend({
  kind: z.literal("delete_edge"),
  payload: z.object({
    edgeId: nonEmptyStringSchema,
  }),
});

// ── GraphOp (discriminated union) ───────────────────────────────────────────

export const graphOpSchema = z.discriminatedUnion("kind", [
  createGraphNodeOpSchema,
  deleteGraphNodeOpSchema,
  moveGraphNodeOpSchema,
  updateGraphNodeDataOpSchema,
  createEdgeOpSchema,
  deleteEdgeOpSchema,
]);

export type GraphOp = z.infer<typeof graphOpSchema>;
