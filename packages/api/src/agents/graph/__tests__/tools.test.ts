import { describe, test, expect } from "bun:test";
import { createGraphTools } from "../tools";
import type { GraphOp } from "@dreamer/schemas";

function makeProject() {
  return {
    project: {
      id: "proj-1",
      name: "Test Project",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    scenes: {
      "scene-1": {
        id: "scene-1",
        name: "Main Scene",
        settings: { background: "#000000" },
      },
    },
    sceneEntityIds: { "scene-1": [] },
    entities: {},
    components: {
      transform: {},
      sprite: {},
      tilemap: {},
      physicsBody: {},
      script: {},
      camera: {},
    },
    assets: {},
    graph: {
      nodes: {} as Record<string, unknown>,
      edges: {} as Record<string, unknown>,
    },
  };
}

function makeTools() {
  const ops: GraphOp[] = [];
  const tools = createGraphTools({
    project: makeProject() as never,
    sceneId: "scene-1",
    ops,
  });
  return { ops, tools };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK tool types are complex
type AnyExecute = (...args: any[]) => Promise<any>;

describe("createGraphTools", () => {
  test("list_graph returns empty graph", async () => {
    const { tools } = makeTools();
    const execute = tools.list_graph.execute as AnyExecute;
    const result = await execute({}, { toolCallId: "tc-1", messages: [] });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  test("create_graph_node produces a create op", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.create_graph_node.execute as AnyExecute;
    const result = await execute(
      { type: "setup", name: "Init" },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(result.nodeId).toBeTruthy();
    expect(result.type).toBe("setup");
    expect(result.name).toBe("Init");
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("create_graph_node");
    if (ops[0].kind === "create_graph_node") {
      expect(ops[0].payload.node.type).toBe("setup");
      expect(ops[0].payload.node.name).toBe("Init");
      expect(ops[0].payload.node.ports.length).toBeGreaterThan(0);
    }
  });

  test("create_graph_node with custom position and data", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.create_graph_node.execute as AnyExecute;
    await execute(
      { type: "delay", name: "Wait", x: 100, y: 200, data: { ms: 500 } },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(ops).toHaveLength(1);
    if (ops[0].kind === "create_graph_node") {
      expect(ops[0].payload.node.x).toBe(100);
      expect(ops[0].payload.node.y).toBe(200);
      expect(ops[0].payload.node.data.ms).toBe(500);
    }
  });

  test("delete_graph_node produces a delete op", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.delete_graph_node.execute as AnyExecute;
    const result = await execute(
      { nodeId: "node-123" },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(result.deleted).toBe("node-123");
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("delete_graph_node");
  });

  test("connect_nodes produces an edge op", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.connect_nodes.execute as AnyExecute;
    const result = await execute(
      {
        sourceNodeId: "node-a",
        sourcePortId: "flow_out",
        targetNodeId: "node-b",
        targetPortId: "flow_in",
      },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(result.edgeId).toBeTruthy();
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("create_edge");
    if (ops[0].kind === "create_edge") {
      expect(ops[0].payload.edge.sourceNodeId).toBe("node-a");
      expect(ops[0].payload.edge.targetNodeId).toBe("node-b");
    }
  });

  test("disconnect_nodes produces a delete edge op", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.disconnect_nodes.execute as AnyExecute;
    const result = await execute(
      { edgeId: "edge-123" },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(result.disconnected).toBe("edge-123");
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("delete_edge");
  });

  test("update_node_data produces an update op", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.update_node_data.execute as AnyExecute;
    const result = await execute(
      { nodeId: "node-1", patch: { pin: 7, value: "LOW" } },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(result.updated).toBe("node-1");
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("update_graph_node_data");
  });

  test("move_graph_node produces a move op", async () => {
    const { ops, tools } = makeTools();
    const execute = tools.move_graph_node.execute as AnyExecute;
    const result = await execute(
      { nodeId: "node-1", x: 300, y: 400 },
      { toolCallId: "tc-1", messages: [] }
    );

    expect(result.moved).toBe("node-1");
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("move_graph_node");
    if (ops[0].kind === "move_graph_node") {
      expect(ops[0].payload.x).toBe(300);
      expect(ops[0].payload.y).toBe(400);
    }
  });

  test("all node types create valid nodes with ports", async () => {
    const nodeTypes = [
      "setup", "loop", "digital_write", "digital_read", "pin_mode",
      "analog_write", "analog_read", "delay", "millis", "micros",
      "serial_begin", "serial_print", "serial_read", "if_else",
      "comparison", "logic_gate", "math", "map_value", "constrain",
      "variable", "constant", "servo_write", "tone", "lcd_print",
      "code_block",
    ] as const;

    for (const type of nodeTypes) {
      const { ops, tools } = makeTools();
      const execute = tools.create_graph_node.execute as AnyExecute;
      const result = await execute(
        { type, name: `Test ${type}` },
        { toolCallId: "tc-1", messages: [] }
      );

      expect(result.nodeId).toBeTruthy();
      expect(result.type).toBe(type);
      expect(ops).toHaveLength(1);
      if (ops[0].kind === "create_graph_node") {
        expect(ops[0].payload.node.type).toBe(type);
        expect(Array.isArray(ops[0].payload.node.ports)).toBe(true);
        expect(ops[0].payload.node.width).toBeGreaterThan(0);
        expect(ops[0].payload.node.height).toBeGreaterThan(0);
      }
    }
  });
});
