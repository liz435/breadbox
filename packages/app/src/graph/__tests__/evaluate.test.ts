import { describe, test, expect } from "bun:test";
import {
  topologicalSort,
  wouldCreateCycle,
  evaluateGraph,
  evaluatePartial,
  getDirtySubgraph,
  type EvalResult,
} from "../evaluate";
import { createGraphNode } from "../node-factory";
import type { GraphNode, Edge } from "@dreamer/schemas";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNodes(...types: Parameters<typeof createGraphNode>[0][]) {
  const nodes: Record<string, GraphNode> = {};
  const ids: string[] = [];
  for (const type of types) {
    const node = createGraphNode(type);
    nodes[node.id] = node;
    ids.push(node.id);
  }
  return { nodes, ids };
}

function makeEdge(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): Edge {
  const id = `e-${sourceNodeId.slice(0, 4)}-${targetNodeId.slice(0, 4)}`;
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}

// ── topologicalSort ──────────────────────────────────────────────────────────

describe("topologicalSort", () => {
  test("returns empty order for empty graph", () => {
    const result = topologicalSort({}, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).toEqual([]);
    }
  });

  test("single node", () => {
    const { nodes } = makeNodes("sprite");
    const result = topologicalSort(nodes, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).toHaveLength(1);
    }
  });

  test("two disconnected nodes", () => {
    const { nodes } = makeNodes("sprite", "shader");
    const result = topologicalSort(nodes, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).toHaveLength(2);
    }
  });

  test("linear chain A → B → C", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "material");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "shader_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const orderA = result.order.indexOf(a);
      const orderB = result.order.indexOf(b);
      const orderC = result.order.indexOf(c);
      expect(orderA).toBeLessThan(orderB);
      expect(orderB).toBeLessThan(orderC);
    }
  });

  test("diamond: A → B, A → C, B → D, C → D", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "code", "material");
    const [a, b, c, d] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(a, "texture_out", c, "trigger_out"),
      e3: makeEdge(b, "shader_out", d, "shader_in"),
      e4: makeEdge(c, "data_out", d, "base_texture_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.indexOf(a)).toBeLessThan(result.order.indexOf(b));
      expect(result.order.indexOf(a)).toBeLessThan(result.order.indexOf(c));
      expect(result.order.indexOf(b)).toBeLessThan(result.order.indexOf(d));
      expect(result.order.indexOf(c)).toBeLessThan(result.order.indexOf(d));
    }
  });

  test("detects simple cycle A → B → A", () => {
    const { nodes, ids } = makeNodes("sprite", "shader");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", a, "shader_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cycle.length).toBeGreaterThan(0);
    }
  });

  test("detects 3-node cycle A → B → C → A", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "code");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "trigger_out"),
      e3: makeEdge(c, "data_out", a, "shader_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(false);
  });

  test("ignores edges referencing missing nodes", () => {
    const { nodes, ids } = makeNodes("sprite");
    const edges: Record<string, Edge> = {
      e1: makeEdge(ids[0], "texture_out", "nonexistent", "texture_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).toHaveLength(1);
    }
  });
});

// ── wouldCreateCycle ─────────────────────────────────────────────────────────

describe("wouldCreateCycle", () => {
  test("self-loop is a cycle", () => {
    const { nodes, ids } = makeNodes("sprite");
    expect(wouldCreateCycle(nodes, {}, ids[0], ids[0])).toBe(true);
  });

  test("no cycle for new edge in empty graph", () => {
    const { nodes, ids } = makeNodes("sprite", "shader");
    expect(wouldCreateCycle(nodes, {}, ids[0], ids[1])).toBe(false);
  });

  test("detects cycle when reverse path exists", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "code");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "trigger_out"),
    };
    // Adding c → a would create A→B→C→A
    expect(wouldCreateCycle(nodes, edges, c, a)).toBe(true);
  });

  test("no cycle for valid forward edge", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "code");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
    };
    // Adding a → c is fine
    expect(wouldCreateCycle(nodes, edges, a, c)).toBe(false);
  });

  test("no cycle for parallel edge", () => {
    const { nodes, ids } = makeNodes("sprite", "shader");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
    };
    // Adding another a → b is fine (no cycle)
    expect(wouldCreateCycle(nodes, edges, a, b)).toBe(false);
  });
});

// ── evaluateGraph ────────────────────────────────────────────────────────────

describe("evaluateGraph", () => {
  test("empty graph", () => {
    const result = evaluateGraph({}, {});
    expect(result.outputs).toEqual({});
    expect(result.errors).toEqual([]);
    expect(result.order).toEqual([]);
  });

  test("single sprite node produces texture and entity outputs", () => {
    const node = createGraphNode("sprite");
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.errors).toEqual([]);
    expect(result.outputs[node.id]).toBeDefined();
    expect(result.outputs[node.id]["texture_out"]).toBeDefined();
    expect(result.outputs[node.id]["texture_out"].type).toBe("texture");
    expect(result.outputs[node.id]["entity_out"]).toBeDefined();
    expect(result.outputs[node.id]["entity_out"].type).toBe("entity");
  });

  test("single text node produces string output", () => {
    const node = createGraphNode("text", { data: { content: "hello" } });
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.outputs[node.id]["string_out"]).toEqual({
      type: "string",
      value: "hello",
    });
  });

  test("math node evaluates add with default inputs (0 + 0 = 0)", () => {
    const node = createGraphNode("math", { data: { operation: "add" } });
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.outputs[node.id]["result_out"]).toEqual({
      type: "float",
      value: 0,
    });
  });

  test("connected math nodes propagate values", () => {
    const mathA = createGraphNode("math", { data: { operation: "add" } });
    const mathB = createGraphNode("math", { data: { operation: "multiply" } });
    const nodes = { [mathA.id]: mathA, [mathB.id]: mathB };
    const edges: Record<string, Edge> = {
      e1: makeEdge(mathA.id, "result_out", mathB.id, "a_in"),
    };
    const result = evaluateGraph(nodes, edges);

    // mathA: 0 + 0 = 0, mathB: 0 * 0 = 0
    expect(result.outputs[mathA.id]["result_out"].value).toBe(0);
    expect(result.outputs[mathB.id]["result_out"].value).toBe(0);
    expect(result.errors).toEqual([]);
  });

  test("shader node receives texture input", () => {
    const sprite = createGraphNode("sprite");
    const shader = createGraphNode("shader");
    const nodes = { [sprite.id]: sprite, [shader.id]: shader };
    const edges: Record<string, Edge> = {
      e1: makeEdge(sprite.id, "texture_out", shader.id, "texture_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.errors).toEqual([]);
    const shaderOutput = result.outputs[shader.id]["shader_out"];
    expect(shaderOutput.type).toBe("shader");
    const shaderValue = shaderOutput.value as Record<string, unknown>;
    const uniforms = shaderValue.uniforms as Record<string, unknown>;
    expect(uniforms.texture).toBeDefined();
  });

  test("audio node produces audio output", () => {
    const node = createGraphNode("audio");
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.outputs[node.id]["audio_out"].type).toBe("audio");
    expect(result.outputs[node.id]["on_complete"].type).toBe("trigger");
  });

  test("video node produces texture and audio outputs", () => {
    const node = createGraphNode("video");
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.outputs[node.id]["texture_out"].type).toBe("texture");
    expect(result.outputs[node.id]["audio_out"].type).toBe("audio");
  });

  test("code node produces trigger and data outputs", () => {
    const node = createGraphNode("code");
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.outputs[node.id]["trigger_out"].type).toBe("trigger");
    expect(result.outputs[node.id]["data_out"].type).toBe("any");
  });

  test("material node receives inputs from sprite and shader", () => {
    const sprite = createGraphNode("sprite");
    const shader = createGraphNode("shader");
    const material = createGraphNode("material");
    const nodes = {
      [sprite.id]: sprite,
      [shader.id]: shader,
      [material.id]: material,
    };
    const edges: Record<string, Edge> = {
      e1: makeEdge(sprite.id, "texture_out", material.id, "base_texture_in"),
      e2: makeEdge(shader.id, "shader_out", material.id, "shader_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.errors).toEqual([]);
    const matOutput = result.outputs[material.id]["material_out"];
    expect(matOutput.type).toBe("material");
    const matValue = matOutput.value as Record<string, unknown>;
    expect(matValue.baseTexture).toBeDefined();
    expect(matValue.shader).toBeDefined();
  });

  test("group node produces no outputs", () => {
    const node = createGraphNode("group");
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.outputs[node.id]).toEqual({});
  });

  test("cycle produces error", () => {
    const { nodes, ids } = makeNodes("sprite", "shader");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", a, "shader_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Cycle");
  });

  test("order matches topological sort", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "material");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "shader_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.order.indexOf(a)).toBeLessThan(result.order.indexOf(b));
    expect(result.order.indexOf(b)).toBeLessThan(result.order.indexOf(c));
  });
});

// ── getDirtySubgraph ─────────────────────────────────────────────────────────

describe("getDirtySubgraph", () => {
  test("empty dirty set returns empty", () => {
    const { nodes } = makeNodes("sprite");
    const dirty = getDirtySubgraph(new Set(), nodes, {});
    expect(dirty.size).toBe(0);
  });

  test("dirty root propagates to all downstream", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "material");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "shader_in"),
    };
    const dirty = getDirtySubgraph(new Set([a]), nodes, edges);
    expect(dirty.has(a)).toBe(true);
    expect(dirty.has(b)).toBe(true);
    expect(dirty.has(c)).toBe(true);
  });

  test("dirty middle node propagates only downstream", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "material");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "shader_in"),
    };
    const dirty = getDirtySubgraph(new Set([b]), nodes, edges);
    expect(dirty.has(a)).toBe(false);
    expect(dirty.has(b)).toBe(true);
    expect(dirty.has(c)).toBe(true);
  });

  test("dirty leaf stays as leaf only", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "material");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "shader_in"),
    };
    const dirty = getDirtySubgraph(new Set([c]), nodes, edges);
    expect(dirty.has(a)).toBe(false);
    expect(dirty.has(b)).toBe(false);
    expect(dirty.has(c)).toBe(true);
  });

  test("diamond propagation", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "code", "material");
    const [a, b, c, d] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(a, "texture_out", c, "trigger_out"),
      e3: makeEdge(b, "shader_out", d, "shader_in"),
      e4: makeEdge(c, "data_out", d, "base_texture_in"),
    };
    const dirty = getDirtySubgraph(new Set([a]), nodes, edges);
    expect(dirty.size).toBe(4); // all nodes dirty
  });
});

// ── evaluatePartial ──────────────────────────────────────────────────────────

describe("evaluatePartial", () => {
  test("reuses cached outputs for clean nodes", () => {
    const { nodes, ids } = makeNodes("sprite", "shader", "material");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", c, "shader_in"),
    };

    // Full evaluation first
    const fullResult = evaluateGraph(nodes, edges);

    // Mark only c as dirty — a and b should use cache
    const partialResult = evaluatePartial(
      nodes,
      edges,
      new Set([c]),
      fullResult.outputs
    );

    expect(partialResult.errors).toEqual([]);
    // All nodes should have outputs
    expect(partialResult.outputs[a]).toBeDefined();
    expect(partialResult.outputs[b]).toBeDefined();
    expect(partialResult.outputs[c]).toBeDefined();
  });

  test("dirty node gets re-evaluated with fresh inputs", () => {
    const mathA = createGraphNode("math", { data: { operation: "add" } });
    const mathB = createGraphNode("math", { data: { operation: "add" } });
    const nodes = { [mathA.id]: mathA, [mathB.id]: mathB };
    const edges: Record<string, Edge> = {
      e1: makeEdge(mathA.id, "result_out", mathB.id, "a_in"),
    };

    const fullResult = evaluateGraph(nodes, edges);
    expect(fullResult.outputs[mathB.id]["result_out"].value).toBe(0);

    // Partial re-eval with mathA dirty
    const partialResult = evaluatePartial(
      nodes,
      edges,
      new Set([mathA.id]),
      fullResult.outputs
    );

    // Both should be re-evaluated (mathA is dirty, mathB is downstream)
    expect(partialResult.outputs[mathA.id]).toBeDefined();
    expect(partialResult.outputs[mathB.id]).toBeDefined();
  });

  test("cycle returns error with cached outputs", () => {
    const { nodes, ids } = makeNodes("sprite", "shader");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "texture_out", b, "texture_in"),
      e2: makeEdge(b, "shader_out", a, "shader_in"),
    };
    const cached = { [a]: { texture_out: { type: "texture" as const, value: {} } } };

    const result = evaluatePartial(nodes, edges, new Set([a]), cached);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should still return cached outputs
    expect(result.outputs[a]).toBeDefined();
  });
});
