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
    const { nodes } = makeNodes("setup");
    const result = topologicalSort(nodes, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).toHaveLength(1);
    }
  });

  test("two disconnected nodes", () => {
    const { nodes } = makeNodes("setup", "delay");
    const result = topologicalSort(nodes, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).toHaveLength(2);
    }
  });

  test("linear chain A → B → C", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
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
    const { nodes, ids } = makeNodes("setup", "digital_write", "analog_write", "serial_print");
    const [a, b, c, d] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(a, "flow_out", c, "flow_in"),
      e3: makeEdge(b, "flow_out", d, "flow_in"),
      e4: makeEdge(c, "flow_out", d, "flow_in"),
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
    const { nodes, ids } = makeNodes("digital_write", "delay");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", a, "flow_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cycle.length).toBeGreaterThan(0);
    }
  });

  test("detects 3-node cycle A → B → C → A", () => {
    const { nodes, ids } = makeNodes("digital_write", "delay", "serial_print");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
      e3: makeEdge(c, "flow_out", a, "flow_in"),
    };
    const result = topologicalSort(nodes, edges);
    expect(result.ok).toBe(false);
  });

  test("ignores edges referencing missing nodes", () => {
    const { nodes, ids } = makeNodes("setup");
    const edges: Record<string, Edge> = {
      e1: makeEdge(ids[0], "flow_out", "nonexistent", "flow_in"),
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
    const { nodes, ids } = makeNodes("setup");
    expect(wouldCreateCycle(nodes, {}, ids[0], ids[0])).toBe(true);
  });

  test("no cycle for new edge in empty graph", () => {
    const { nodes, ids } = makeNodes("setup", "delay");
    expect(wouldCreateCycle(nodes, {}, ids[0], ids[1])).toBe(false);
  });

  test("detects cycle when reverse path exists", () => {
    const { nodes, ids } = makeNodes("digital_write", "delay", "serial_print");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
    };
    // Adding c → a would create A→B→C→A
    expect(wouldCreateCycle(nodes, edges, c, a)).toBe(true);
  });

  test("no cycle for valid forward edge", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
    };
    // Adding a → c is fine
    expect(wouldCreateCycle(nodes, edges, a, c)).toBe(false);
  });

  test("no cycle for parallel edge", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
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

  test("single node produces empty outputs (evaluator is TODO)", () => {
    const node = createGraphNode("setup");
    const nodes = { [node.id]: node };
    const result = evaluateGraph(nodes, {});

    expect(result.errors).toEqual([]);
    expect(result.outputs[node.id]).toBeDefined();
  });

  test("connected nodes evaluate without errors", () => {
    const setup = createGraphNode("setup");
    const dw = createGraphNode("digital_write");
    const nodes = { [setup.id]: setup, [dw.id]: dw };
    const edges: Record<string, Edge> = {
      e1: makeEdge(setup.id, "flow_out", dw.id, "flow_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.errors).toEqual([]);
  });

  test("cycle produces error", () => {
    const { nodes, ids } = makeNodes("digital_write", "delay");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", a, "flow_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Cycle");
  });

  test("order matches topological sort", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
    };
    const result = evaluateGraph(nodes, edges);

    expect(result.order.indexOf(a)).toBeLessThan(result.order.indexOf(b));
    expect(result.order.indexOf(b)).toBeLessThan(result.order.indexOf(c));
  });
});

// ── getDirtySubgraph ─────────────────────────────────────────────────────────

describe("getDirtySubgraph", () => {
  test("empty dirty set returns empty", () => {
    const { nodes } = makeNodes("setup");
    const dirty = getDirtySubgraph(new Set(), nodes, {});
    expect(dirty.size).toBe(0);
  });

  test("dirty root propagates to all downstream", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
    };
    const dirty = getDirtySubgraph(new Set([a]), nodes, edges);
    expect(dirty.has(a)).toBe(true);
    expect(dirty.has(b)).toBe(true);
    expect(dirty.has(c)).toBe(true);
  });

  test("dirty middle node propagates only downstream", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
    };
    const dirty = getDirtySubgraph(new Set([b]), nodes, edges);
    expect(dirty.has(a)).toBe(false);
    expect(dirty.has(b)).toBe(true);
    expect(dirty.has(c)).toBe(true);
  });

  test("dirty leaf stays as leaf only", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
    };
    const dirty = getDirtySubgraph(new Set([c]), nodes, edges);
    expect(dirty.has(a)).toBe(false);
    expect(dirty.has(b)).toBe(false);
    expect(dirty.has(c)).toBe(true);
  });

  test("diamond propagation", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "analog_write", "serial_print");
    const [a, b, c, d] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(a, "flow_out", c, "flow_in"),
      e3: makeEdge(b, "flow_out", d, "flow_in"),
      e4: makeEdge(c, "flow_out", d, "flow_in"),
    };
    const dirty = getDirtySubgraph(new Set([a]), nodes, edges);
    expect(dirty.size).toBe(4); // all nodes dirty
  });
});

// ── evaluatePartial ──────────────────────────────────────────────────────────

describe("evaluatePartial", () => {
  test("reuses cached outputs for clean nodes", () => {
    const { nodes, ids } = makeNodes("setup", "digital_write", "delay");
    const [a, b, c] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", c, "flow_in"),
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
      e1: makeEdge(mathA.id, "result", mathB.id, "a"),
    };

    const fullResult = evaluateGraph(nodes, edges);

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
    const { nodes, ids } = makeNodes("digital_write", "delay");
    const [a, b] = ids;
    const edges: Record<string, Edge> = {
      e1: makeEdge(a, "flow_out", b, "flow_in"),
      e2: makeEdge(b, "flow_out", a, "flow_in"),
    };
    const cached = { [a]: { flow_out: { type: "flow" as const, value: {} } } };

    const result = evaluatePartial(nodes, edges, new Set([a]), cached);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should still return cached outputs
    expect(result.outputs[a]).toBeDefined();
  });
});
