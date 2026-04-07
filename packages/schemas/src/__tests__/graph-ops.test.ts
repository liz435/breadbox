import { describe, test, expect } from "bun:test";
import { graphOpSchema, type GraphOp } from "../graph-ops";

const BASE = {
  opId: "op-1",
  projectId: "proj-1",
  sceneId: "scene-1",
  expectedVersion: 0,
  timestamp: "2026-01-01T00:00:00Z",
};

describe("graphOpSchema", () => {
  test("validates create_graph_node", () => {
    const op: GraphOp = {
      ...BASE,
      kind: "create_graph_node",
      payload: {
        node: {
          id: "node-1",
          type: "digital_write",
          name: "LED Output",
          x: 100,
          y: 200,
          width: 200,
          height: 100,
          ports: [],
          data: {},
        },
      },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(true);
  });

  test("validates delete_graph_node", () => {
    const op: GraphOp = {
      ...BASE,
      kind: "delete_graph_node",
      payload: { nodeId: "node-1", cascade: true },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(true);
  });

  test("validates move_graph_node", () => {
    const op: GraphOp = {
      ...BASE,
      kind: "move_graph_node",
      payload: { nodeId: "node-1", x: 50, y: 75 },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(true);
  });

  test("validates update_graph_node_data", () => {
    const op: GraphOp = {
      ...BASE,
      kind: "update_graph_node_data",
      payload: { nodeId: "node-1", patch: { code: "digitalWrite(13, HIGH);" } },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(true);
  });

  test("validates create_edge", () => {
    const op: GraphOp = {
      ...BASE,
      kind: "create_edge",
      payload: {
        edge: {
          id: "edge-1",
          sourceNodeId: "node-1",
          sourcePortId: "flow_out",
          targetNodeId: "node-2",
          targetPortId: "flow_in",
        },
      },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(true);
  });

  test("validates delete_edge", () => {
    const op: GraphOp = {
      ...BASE,
      kind: "delete_edge",
      payload: { edgeId: "edge-1" },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(true);
  });

  test("rejects unknown op kind", () => {
    const op = {
      ...BASE,
      kind: "unknown_op",
      payload: {},
    };
    expect(graphOpSchema.safeParse(op).success).toBe(false);
  });

  test("rejects missing opId", () => {
    const { opId: _, ...noOpId } = BASE;
    const op = {
      ...noOpId,
      kind: "delete_edge",
      payload: { edgeId: "edge-1" },
    };
    expect(graphOpSchema.safeParse(op).success).toBe(false);
  });
});
