import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { graphMachine, type GraphEvent } from "../graph-machine";
import type { GraphNode, Edge } from "@dreamer/schemas";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeNode(id: string, type: GraphNode["type"] = "sprite"): GraphNode {
  return {
    id,
    type,
    name: `Node ${id}`,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    ports: [],
    data: {},
  };
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string
): Edge {
  return {
    id,
    sourceNodeId,
    sourcePortId: "out",
    targetNodeId,
    targetPortId: "in",
  };
}

function createTestActor() {
  const actor = createActor(graphMachine);
  actor.start();
  return actor;
}

// ── ADD_NODE ────────────────────────────────────────────────────────────────

describe("ADD_NODE", () => {
  test("adds a node to state", () => {
    const actor = createTestActor();
    const node = makeNode("n1");
    actor.send({ type: "ADD_NODE", node });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toEqual(node);
  });

  test("selects newly added node", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedNodeIds.has("n1")).toBe(true);
  });

  test("clears edge selection on add", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "SELECT_EDGES", edgeIds: ["e1"] });
    actor.send({ type: "ADD_NODE", node: makeNode("n3") });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedEdgeIds.size).toBe(0);
  });
});

// ── REMOVE_NODE ─────────────────────────────────────────────────────────────

describe("REMOVE_NODE", () => {
  test("removes node from state", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "REMOVE_NODE", nodeId: "n1" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toBeUndefined();
  });

  test("cascades: removes connected edges", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "REMOVE_NODE", nodeId: "n1" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.edges["e1"]).toBeUndefined();
  });

  test("removes node from selection", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({ type: "SELECT_NODES", nodeIds: ["n1", "n2"] });
    actor.send({ type: "REMOVE_NODE", nodeId: "n1" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedNodeIds.has("n1")).toBe(false);
    expect(ctx.selectedNodeIds.has("n2")).toBe(true);
  });
});

// ── ADD_EDGE / REMOVE_EDGE ──────────────────────────────────────────────────

describe("ADD_EDGE", () => {
  test("adds an edge to state", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    const edge = makeEdge("e1", "n1", "n2");
    actor.send({ type: "ADD_EDGE", edge });

    const ctx = actor.getSnapshot().context;
    expect(ctx.edges["e1"]).toEqual(edge);
  });
});

describe("REMOVE_EDGE", () => {
  test("removes an edge from state", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "REMOVE_EDGE", edgeId: "e1" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.edges["e1"]).toBeUndefined();
  });

  test("removes edge from selection", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "SELECT_EDGES", edgeIds: ["e1"] });
    actor.send({ type: "REMOVE_EDGE", edgeId: "e1" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedEdgeIds.has("e1")).toBe(false);
  });
});

// ── MOVE_NODE ───────────────────────────────────────────────────────────────

describe("MOVE_NODE", () => {
  test("updates node position", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "MOVE_NODE", nodeId: "n1", x: 100, y: 200 });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"].x).toBe(100);
    expect(ctx.nodes["n1"].y).toBe(200);
  });

  test("no-ops for non-existent node", () => {
    const actor = createTestActor();
    actor.send({ type: "MOVE_NODE", nodeId: "nope", x: 100, y: 200 });

    const ctx = actor.getSnapshot().context;
    expect(Object.keys(ctx.nodes)).toHaveLength(0);
  });
});

// ── UPDATE_NODE ─────────────────────────────────────────────────────────────

describe("UPDATE_NODE", () => {
  test("merges patch into node data", () => {
    const actor = createTestActor();
    actor.send({
      type: "ADD_NODE",
      node: makeNode("n1"),
    });
    actor.send({
      type: "UPDATE_NODE",
      nodeId: "n1",
      patch: { shaderCode: "void main() {}" },
    });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"].data.shaderCode).toBe("void main() {}");
  });

  test("preserves existing data fields", () => {
    const actor = createTestActor();
    const node = makeNode("n1");
    node.data = { existing: "value" };
    actor.send({ type: "ADD_NODE", node });
    actor.send({
      type: "UPDATE_NODE",
      nodeId: "n1",
      patch: { newField: 42 },
    });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"].data.existing).toBe("value");
    expect(ctx.nodes["n1"].data.newField).toBe(42);
  });
});

// ── Selection ───────────────────────────────────────────────────────────────

describe("Selection", () => {
  test("SELECT_NODES sets selected node ids", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({ type: "SELECT_NODES", nodeIds: ["n1", "n2"] });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedNodeIds.has("n1")).toBe(true);
    expect(ctx.selectedNodeIds.has("n2")).toBe(true);
  });

  test("SELECT_NODES clears edge selection", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "SELECT_EDGES", edgeIds: ["e1"] });
    actor.send({ type: "SELECT_NODES", nodeIds: ["n1"] });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedEdgeIds.size).toBe(0);
  });

  test("SELECT_EDGES clears node selection", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "SELECT_NODES", nodeIds: ["n1"] });
    actor.send({ type: "SELECT_EDGES", edgeIds: ["e1"] });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedNodeIds.size).toBe(0);
  });

  test("CLEAR_SELECTION clears everything", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "SELECT_NODES", nodeIds: ["n1"] });
    actor.send({ type: "CLEAR_SELECTION" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedNodeIds.size).toBe(0);
    expect(ctx.selectedEdgeIds.size).toBe(0);
  });
});

// ── Undo / Redo ─────────────────────────────────────────────────────────────

describe("Undo / Redo", () => {
  test("undo reverts ADD_NODE", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "UNDO" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toBeUndefined();
  });

  test("redo restores ADD_NODE", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "UNDO" });
    actor.send({ type: "REDO" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toBeDefined();
  });

  test("undo reverts REMOVE_NODE and restores edges", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({
      type: "ADD_EDGE",
      edge: makeEdge("e1", "n1", "n2"),
    });
    actor.send({ type: "REMOVE_NODE", nodeId: "n1" });
    actor.send({ type: "UNDO" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toBeDefined();
    expect(ctx.edges["e1"]).toBeDefined();
  });

  test("new action after undo clears redo stack", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "UNDO" });
    actor.send({ type: "ADD_NODE", node: makeNode("n2") });
    actor.send({ type: "REDO" });

    // Redo should do nothing — stack was cleared
    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toBeUndefined();
    expect(ctx.nodes["n2"]).toBeDefined();
  });

  test("SNAPSHOT enables undo for continuous actions", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "SNAPSHOT" });
    actor.send({ type: "MOVE_NODE", nodeId: "n1", x: 50, y: 50 });
    actor.send({ type: "MOVE_NODE", nodeId: "n1", x: 100, y: 100 });
    actor.send({ type: "UNDO" });

    // Should revert to state at SNAPSHOT (x:0, y:0)
    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"].x).toBe(0);
    expect(ctx.nodes["n1"].y).toBe(0);
  });

  test("undo with no history does nothing", () => {
    const actor = createTestActor();
    actor.send({ type: "UNDO" });

    const ctx = actor.getSnapshot().context;
    expect(Object.keys(ctx.nodes)).toHaveLength(0);
  });

  test("redo with no future does nothing", () => {
    const actor = createTestActor();
    actor.send({ type: "ADD_NODE", node: makeNode("n1") });
    actor.send({ type: "REDO" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.nodes["n1"]).toBeDefined();
  });
});
