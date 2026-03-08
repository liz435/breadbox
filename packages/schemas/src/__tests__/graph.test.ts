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
    type: "sprite",
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
      "sprite",
      "shader",
      "audio",
      "video",
      "text",
      "code",
      "material",
      "math",
      "group",
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
        { id: "p1", name: "In", direction: "in", dataType: "float" },
        { id: "p2", name: "Out", direction: "out", dataType: "texture" },
      ],
    });
    const result = graphNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  test("validates node with data", () => {
    const node = makeNode({
      data: { shaderCode: "void main() {}", version: 1 },
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
      "texture",
      "float",
      "vec2",
      "color",
      "audio",
      "trigger",
      "entity",
      "string",
      "shader",
      "material",
    ];
    for (const t of types) {
      expect(arePortsCompatible(t, t)).toBe(true);
    }
  });

  test("any connects to everything", () => {
    const types: PortDataType[] = [
      "texture",
      "float",
      "vec2",
      "color",
      "audio",
      "trigger",
      "entity",
      "string",
      "shader",
      "material",
    ];
    for (const t of types) {
      expect(arePortsCompatible("any", t)).toBe(true);
      expect(arePortsCompatible(t, "any")).toBe(true);
    }
  });

  test("incompatible types reject", () => {
    expect(arePortsCompatible("float", "texture")).toBe(false);
    expect(arePortsCompatible("audio", "shader")).toBe(false);
    expect(arePortsCompatible("string", "vec2")).toBe(false);
  });
});

// ── Default ports ───────────────────────────────────────────────────────────

describe("getDefaultPorts", () => {
  test("sprite has shader_in, material_in, texture_out, entity_out", () => {
    const ports = getDefaultPorts("sprite");
    expect(ports).toHaveLength(4);
    const ids = ports.map((p) => p.id);
    expect(ids).toContain("shader_in");
    expect(ids).toContain("material_in");
    expect(ids).toContain("texture_out");
    expect(ids).toContain("entity_out");
  });

  test("all node types return valid ports", () => {
    const types: GraphNodeType[] = [
      "sprite",
      "shader",
      "audio",
      "video",
      "text",
      "code",
      "material",
      "math",
      "group",
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

  test("group has no ports", () => {
    expect(getDefaultPorts("group")).toHaveLength(0);
  });

  test("math has exactly 3 ports (a, b, result)", () => {
    const ports = getDefaultPorts("math");
    expect(ports).toHaveLength(3);
    expect(ports.filter((p) => p.direction === "in")).toHaveLength(2);
    expect(ports.filter((p) => p.direction === "out")).toHaveLength(1);
  });
});
