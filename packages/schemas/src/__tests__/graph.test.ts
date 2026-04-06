import { describe, test, expect } from "bun:test";
import {
  graphNodeSchema,
  edgeSchema,
  graphStateSchema,
  arePortsCompatible,
  getDefaultPorts,
  type GraphNode,
  type Edge,
  type PortDataType,
  type GraphNodeType,
} from "../graph";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "node-1",
    type: "digital_write",
    name: "Test Node",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    ports: [],
    data: {},
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: "edge-1",
    sourceNodeId: "node-1",
    sourcePortId: "port-out",
    targetNodeId: "node-2",
    targetPortId: "port-in",
    ...overrides,
  };
}

// ── GraphNode schema ────────────────────────────────────────────────────────

describe("graphNodeSchema", () => {
  test("validates a valid graph node", () => {
    const node = makeNode();
    const result = graphNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  test("validates all node types", () => {
    const types: GraphNodeType[] = [
      "setup",
      "loop",
      "digital_write",
      "digital_read",
      "pin_mode",
      "analog_write",
      "analog_read",
      "delay",
      "millis",
      "micros",
      "serial_begin",
      "serial_print",
      "serial_read",
      "if_else",
      "comparison",
      "logic_gate",
      "math",
      "map_value",
      "constrain",
      "variable",
      "constant",
      "servo_write",
      "tone",
      "lcd_print",
      "code_block",
    ];
    for (const type of types) {
      const result = graphNodeSchema.safeParse(makeNode({ type }));
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid node type", () => {
    const result = graphNodeSchema.safeParse(
      makeNode({ type: "invalid" as GraphNodeType })
    );
    expect(result.success).toBe(false);
  });

  test("rejects empty id", () => {
    const result = graphNodeSchema.safeParse(makeNode({ id: "" }));
    expect(result.success).toBe(false);
  });

  test("rejects non-positive width", () => {
    const result = graphNodeSchema.safeParse(makeNode({ width: 0 }));
    expect(result.success).toBe(false);
  });

  test("rejects non-positive height", () => {
    const result = graphNodeSchema.safeParse(makeNode({ height: -1 }));
    expect(result.success).toBe(false);
  });

  test("validates node with ports", () => {
    const node = makeNode({
      ports: [
        { id: "p1", name: "In", direction: "in", dataType: "integer" },
        { id: "p2", name: "Out", direction: "out", dataType: "digital" },
      ],
    });
    const result = graphNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  test("validates node with data", () => {
    const node = makeNode({
      data: { code: "digitalWrite(13, HIGH);", pinNumber: 13 },
    });
    const result = graphNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });
});

// ── Edge schema ─────────────────────────────────────────────────────────────

describe("edgeSchema", () => {
  test("validates a valid edge", () => {
    const edge = makeEdge();
    const result = edgeSchema.safeParse(edge);
    expect(result.success).toBe(true);
  });

  test("rejects empty sourceNodeId", () => {
    const result = edgeSchema.safeParse(makeEdge({ sourceNodeId: "" }));
    expect(result.success).toBe(false);
  });

  test("rejects empty targetPortId", () => {
    const result = edgeSchema.safeParse(makeEdge({ targetPortId: "" }));
    expect(result.success).toBe(false);
  });
});

// ── GraphState schema ───────────────────────────────────────────────────────

describe("graphStateSchema", () => {
  test("validates empty graph state", () => {
    const result = graphStateSchema.safeParse({ nodes: {}, edges: {} });
    expect(result.success).toBe(true);
  });

  test("validates graph state with nodes and edges", () => {
    const state = {
      nodes: { "node-1": makeNode(), "node-2": makeNode({ id: "node-2" }) },
      edges: { "edge-1": makeEdge() },
    };
    const result = graphStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});

// ── Port compatibility ──────────────────────────────────────────────────────

describe("arePortsCompatible", () => {
  test("same types are compatible", () => {
    const types: PortDataType[] = [
      "flow",
      "digital",
      "analog",
      "pwm",
      "integer",
      "float",
      "string",
      "boolean",
      "pin",
    ];
    for (const t of types) {
      expect(arePortsCompatible(t, t)).toBe(true);
    }
  });

  test("any connects to everything", () => {
    const types: PortDataType[] = [
      "flow",
      "digital",
      "analog",
      "pwm",
      "integer",
      "float",
      "string",
      "boolean",
      "pin",
    ];
    for (const t of types) {
      expect(arePortsCompatible("any", t)).toBe(true);
    }
  });

  test("data types connect to any (flow is flow-only)", () => {
    const dataTypes: PortDataType[] = [
      "digital",
      "analog",
      "pwm",
      "integer",
      "float",
      "string",
      "boolean",
      "pin",
    ];
    for (const t of dataTypes) {
      expect(arePortsCompatible(t, "any")).toBe(true);
    }
    // flow only connects to flow, not to any
    expect(arePortsCompatible("flow", "any")).toBe(false);
  });

  test("incompatible types reject", () => {
    expect(arePortsCompatible("flow", "digital")).toBe(false);
    expect(arePortsCompatible("string", "integer")).toBe(false);
    expect(arePortsCompatible("pin", "float")).toBe(false);
  });

  test("cross-compatible types accept", () => {
    expect(arePortsCompatible("digital", "integer")).toBe(true);
    expect(arePortsCompatible("integer", "float")).toBe(true);
    expect(arePortsCompatible("boolean", "digital")).toBe(true);
    expect(arePortsCompatible("analog", "integer")).toBe(true);
  });
});

// ── Default ports ───────────────────────────────────────────────────────────

describe("getDefaultPorts", () => {
  test("digital_write has flow_in, pin, value, flow_out", () => {
    const ports = getDefaultPorts("digital_write");
    expect(ports).toHaveLength(4);
    const ids = ports.map((p) => p.id);
    expect(ids).toContain("flow_in");
    expect(ids).toContain("pin");
    expect(ids).toContain("value");
    expect(ids).toContain("flow_out");
  });

  test("all node types return valid ports", () => {
    const types: GraphNodeType[] = [
      "setup",
      "loop",
      "digital_write",
      "digital_read",
      "pin_mode",
      "analog_write",
      "analog_read",
      "delay",
      "millis",
      "micros",
      "serial_begin",
      "serial_print",
      "serial_read",
      "if_else",
      "comparison",
      "logic_gate",
      "math",
      "map_value",
      "constrain",
      "variable",
      "constant",
      "servo_write",
      "tone",
      "lcd_print",
      "code_block",
    ];
    for (const type of types) {
      const ports = getDefaultPorts(type);
      expect(Array.isArray(ports)).toBe(true);
      for (const port of ports) {
        expect(port.id).toBeTruthy();
        expect(port.name).toBeTruthy();
        expect(["in", "out"]).toContain(port.direction);
      }
    }
  });

  test("setup has only flow_out", () => {
    const ports = getDefaultPorts("setup");
    expect(ports).toHaveLength(1);
    expect(ports[0].id).toBe("flow_out");
    expect(ports[0].dataType).toBe("flow");
  });

  test("math has exactly 3 ports (a, b, result)", () => {
    const ports = getDefaultPorts("math");
    expect(ports).toHaveLength(3);
    expect(ports.filter((p) => p.direction === "in")).toHaveLength(2);
    expect(ports.filter((p) => p.direction === "out")).toHaveLength(1);
  });
});
