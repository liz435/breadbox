import { describe, test, expect } from "bun:test";
import { applyGraphOpsToGraph, isGraphOp } from "../apply-graph-ops";
import type { GraphOp } from "@dreamer/schemas";
import type { GraphEvent } from "@/store/graph-machine";

function makeGraphOp(kind: string, payload: Record<string, unknown>): GraphOp {
  return {
    opId: "op-1",
    projectId: "proj-1",
    sceneId: "scene-1",
    expectedVersion: 1,
    timestamp: new Date().toISOString(),
    kind,
    payload,
  } as GraphOp;
}

describe("applyGraphOpsToGraph", () => {
  test("create_graph_node dispatches ADD_NODE", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    const node = {
      id: "node-1",
      type: "sprite",
      name: "Player",
      x: 0,
      y: 0,
      width: 180,
      height: 100,
      ports: [],
      data: {},
    };

    applyGraphOpsToGraph(
      [makeGraphOp("create_graph_node", { node })],
      send
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ADD_NODE");
  });

  test("delete_graph_node dispatches REMOVE_NODE", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    applyGraphOpsToGraph(
      [makeGraphOp("delete_graph_node", { nodeId: "node-1", cascade: true })],
      send
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("REMOVE_NODE");
    if (events[0].type === "REMOVE_NODE") {
      expect(events[0].nodeId).toBe("node-1");
    }
  });

  test("move_graph_node dispatches MOVE_NODE", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    applyGraphOpsToGraph(
      [makeGraphOp("move_graph_node", { nodeId: "node-1", x: 100, y: 200 })],
      send
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("MOVE_NODE");
    if (events[0].type === "MOVE_NODE") {
      expect(events[0].x).toBe(100);
      expect(events[0].y).toBe(200);
    }
  });

  test("update_graph_node_data dispatches UPDATE_NODE", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    applyGraphOpsToGraph(
      [makeGraphOp("update_graph_node_data", { nodeId: "node-1", patch: { code: "test" } })],
      send
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("UPDATE_NODE");
    if (events[0].type === "UPDATE_NODE") {
      expect(events[0].patch).toEqual({ code: "test" });
    }
  });

  test("create_edge dispatches ADD_EDGE", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    const edge = {
      id: "edge-1",
      sourceNodeId: "a",
      sourcePortId: "out",
      targetNodeId: "b",
      targetPortId: "in",
    };

    applyGraphOpsToGraph(
      [makeGraphOp("create_edge", { edge })],
      send
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ADD_EDGE");
  });

  test("delete_edge dispatches REMOVE_EDGE", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    applyGraphOpsToGraph(
      [makeGraphOp("delete_edge", { edgeId: "edge-1" })],
      send
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("REMOVE_EDGE");
    if (events[0].type === "REMOVE_EDGE") {
      expect(events[0].edgeId).toBe("edge-1");
    }
  });

  test("multiple ops dispatch in order", () => {
    const events: GraphEvent[] = [];
    const send = (e: GraphEvent) => events.push(e);

    const node = {
      id: "node-1",
      type: "sprite",
      name: "A",
      x: 0, y: 0, width: 180, height: 100,
      ports: [], data: {},
    };
    const node2 = {
      id: "node-2",
      type: "shader",
      name: "B",
      x: 250, y: 0, width: 220, height: 160,
      ports: [], data: {},
    };
    const edge = {
      id: "edge-1",
      sourceNodeId: "node-1",
      sourcePortId: "texture_out",
      targetNodeId: "node-2",
      targetPortId: "texture_in",
    };

    applyGraphOpsToGraph(
      [
        makeGraphOp("create_graph_node", { node }),
        makeGraphOp("create_graph_node", { node: node2 }),
        makeGraphOp("create_edge", { edge }),
      ],
      send
    );

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("ADD_NODE");
    expect(events[1].type).toBe("ADD_NODE");
    expect(events[2].type).toBe("ADD_EDGE");
  });
});

describe("isGraphOp", () => {
  test("identifies graph op kinds", () => {
    expect(isGraphOp({ kind: "create_graph_node" })).toBe(true);
    expect(isGraphOp({ kind: "delete_graph_node" })).toBe(true);
    expect(isGraphOp({ kind: "move_graph_node" })).toBe(true);
    expect(isGraphOp({ kind: "update_graph_node_data" })).toBe(true);
    expect(isGraphOp({ kind: "create_edge" })).toBe(true);
    expect(isGraphOp({ kind: "delete_edge" })).toBe(true);
  });

  test("rejects scene op kinds", () => {
    expect(isGraphOp({ kind: "create_entity" })).toBe(false);
    expect(isGraphOp({ kind: "update_transform" })).toBe(false);
    expect(isGraphOp({ kind: "add_component" })).toBe(false);
    expect(isGraphOp({ kind: "delete_entity" })).toBe(false);
  });
});
