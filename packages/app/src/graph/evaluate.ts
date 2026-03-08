import type { GraphNode, Edge, PortDataType } from "@dreamer/schemas";
import { evaluateMathOp, type MathOperation } from "./node-factory";

// ── Types ───────────────────────────────────────────────────────────────────

export type PortValue = {
  type: PortDataType;
  value: unknown;
};

export type NodeOutputs = Record<string, PortValue>;

export type EvalResult = {
  outputs: Record<string, NodeOutputs>;
  errors: EvalError[];
  order: string[];
};

export type EvalError = {
  nodeId: string;
  edgeId?: string;
  message: string;
};

// ── Topological sort with cycle detection ───────────────────────────────────

type SortResult =
  | { ok: true; order: string[] }
  | { ok: false; cycle: string[] };

/**
 * Topological sort of nodes based on edge dependencies.
 * Returns evaluation order (sources first) or the cycle path.
 */
export function topologicalSort(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>
): SortResult {
  // Build adjacency: for each node, which nodes must be evaluated first (its inputs)
  const inDegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};

  for (const id of Object.keys(nodes)) {
    inDegree[id] = 0;
    dependents[id] = [];
  }

  for (const edge of Object.values(edges)) {
    if (!(edge.sourceNodeId in nodes) || !(edge.targetNodeId in nodes)) continue;
    inDegree[edge.targetNodeId]++;
    dependents[edge.sourceNodeId].push(edge.targetNodeId);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of Object.entries(inDegree)) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const dep of dependents[nodeId]) {
      inDegree[dep]--;
      if (inDegree[dep] === 0) queue.push(dep);
    }
  }

  if (order.length !== Object.keys(nodes).length) {
    // Cycle detected — find it via DFS
    const cycle = findCycle(nodes, edges);
    return { ok: false, cycle };
  }

  return { ok: true, order };
}

function findCycle(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>
): string[] {
  const adjacency: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) {
    adjacency[id] = [];
  }
  for (const edge of Object.values(edges)) {
    if (edge.sourceNodeId in adjacency) {
      adjacency[edge.sourceNodeId].push(edge.targetNodeId);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): string[] | null {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    for (const next of adjacency[nodeId] ?? []) {
      if (!visited.has(next)) {
        const result = dfs(next);
        if (result) return result;
      } else if (inStack.has(next)) {
        // Found cycle — extract it
        const cycleStart = path.indexOf(next);
        return path.slice(cycleStart);
      }
    }

    path.pop();
    inStack.delete(nodeId);
    return null;
  }

  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      const cycle = dfs(nodeId);
      if (cycle) return cycle;
    }
  }

  return [];
}

// ── Detect if adding an edge would create a cycle ───────────────────────────

/**
 * Check if connecting sourceNodeId → targetNodeId would create a cycle.
 * Uses DFS from target to see if source is reachable.
 */
export function wouldCreateCycle(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  if (sourceNodeId === targetNodeId) return true;

  // Build adjacency from existing edges
  const adjacency: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) {
    adjacency[id] = [];
  }
  for (const edge of Object.values(edges)) {
    if (edge.sourceNodeId in adjacency) {
      adjacency[edge.sourceNodeId].push(edge.targetNodeId);
    }
  }

  // Check if source is reachable from target (which would mean target→...→source exists)
  const visited = new Set<string>();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency[current] ?? []) {
      queue.push(next);
    }
  }

  return false;
}

// ── Graph evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate the entire graph, producing output values for every node.
 *
 * Pull-based: each node resolves its inputs from connected outputs,
 * then computes its own outputs. Evaluated in topological order.
 */
export function evaluateGraph(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>
): EvalResult {
  const sortResult = topologicalSort(nodes, edges);
  const errors: EvalError[] = [];

  if (!sortResult.ok) {
    errors.push({
      nodeId: sortResult.cycle[0] ?? "",
      message: `Cycle detected: ${sortResult.cycle.join(" → ")}`,
    });
    return { outputs: {}, errors, order: [] };
  }

  const { order } = sortResult;
  const outputs: Record<string, NodeOutputs> = {};

  // Build edge lookup: for each (targetNodeId, targetPortId) → source info
  // A port may have multiple edges (multi-input, e.g. composer entities_in)
  const inputConnections: Record<
    string,
    Record<string, Array<{ sourceNodeId: string; sourcePortId: string; edgeId: string }>>
  > = {};
  for (const edge of Object.values(edges)) {
    if (!inputConnections[edge.targetNodeId]) {
      inputConnections[edge.targetNodeId] = {};
    }
    if (!inputConnections[edge.targetNodeId][edge.targetPortId]) {
      inputConnections[edge.targetNodeId][edge.targetPortId] = [];
    }
    inputConnections[edge.targetNodeId][edge.targetPortId].push({
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      edgeId: edge.id,
    });
  }

  for (const nodeId of order) {
    const node = nodes[nodeId];
    if (!node) continue;

    // Resolve inputs (use first connection per port for single-input, all for multi)
    const resolvedInputs: Record<string, PortValue> = {};
    const multiInputs: Record<string, PortValue[]> = {};
    const connections = inputConnections[nodeId] ?? {};
    for (const [portId, conns] of Object.entries(connections)) {
      const values: PortValue[] = [];
      for (const conn of conns) {
        const sourceOutputs = outputs[conn.sourceNodeId];
        if (sourceOutputs && conn.sourcePortId in sourceOutputs) {
          values.push(sourceOutputs[conn.sourcePortId]);
        }
      }
      if (values.length > 0) {
        resolvedInputs[portId] = values[0];
      }
      if (values.length > 1) {
        multiInputs[portId] = values;
      }
    }

    // Evaluate node
    outputs[nodeId] = evaluateNode(node, resolvedInputs, errors, multiInputs);
  }

  return { outputs, errors, order };
}

/**
 * Evaluate a single node given its resolved input values.
 * Returns the node's output port values.
 */
function evaluateNode(
  node: GraphNode,
  inputs: Record<string, PortValue>,
  errors: EvalError[],
  multiInputs: Record<string, PortValue[]> = {}
): NodeOutputs {
  const result: NodeOutputs = {};

  switch (node.type) {
    case "sprite": {
      result["texture_out"] = {
        type: "texture",
        value: {
          nodeId: node.id,
          tint: node.data.tint ?? "#4a9eff",
          width: node.data.width ?? 64,
          height: node.data.height ?? 64,
        },
      };
      result["entity_out"] = {
        type: "entity",
        value: { nodeId: node.id },
      };
      break;
    }

    case "shader": {
      result["shader_out"] = {
        type: "shader",
        value: {
          nodeId: node.id,
          code: node.data.code ?? "",
          language: node.data.language ?? "glsl",
          uniforms: {
            texture: inputs["texture_in"]?.value,
            float: inputs["float_in"]?.value,
            color: inputs["color_in"]?.value,
          },
        },
      };
      break;
    }

    case "code": {
      // Include resolved inputs so the runtime loop can pass them to scripts
      for (const [portId, value] of Object.entries(inputs)) {
        result[portId] = value;
      }
      result["trigger_out"] = { type: "trigger", value: true };
      result["data_out"] = {
        type: "any",
        value: { nodeId: node.id, code: node.data.code ?? "" },
      };
      break;
    }

    case "audio": {
      result["audio_out"] = {
        type: "audio",
        value: {
          nodeId: node.id,
          volume: node.data.volume ?? 1,
          pitch: node.data.pitch ?? 1,
          loop: node.data.loop ?? false,
        },
      };
      result["on_complete"] = { type: "trigger", value: false };
      break;
    }

    case "video": {
      result["texture_out"] = {
        type: "texture",
        value: { nodeId: node.id, source: "video" },
      };
      result["audio_out"] = {
        type: "audio",
        value: { nodeId: node.id, source: "video" },
      };
      break;
    }

    case "text": {
      const content =
        typeof node.data.content === "string" ? node.data.content : "";
      result["string_out"] = { type: "string", value: content };
      break;
    }

    case "material": {
      result["material_out"] = {
        type: "material",
        value: {
          nodeId: node.id,
          baseTexture: inputs["base_texture_in"]?.value,
          normalMap: inputs["normal_in"]?.value,
          shader: inputs["shader_in"]?.value,
          blend: node.data.blend ?? "normal",
        },
      };
      break;
    }

    case "math": {
      const op = (node.data.operation ?? "add") as MathOperation;
      const a = resolveFloat(inputs["a_in"]);
      const b = resolveFloat(inputs["b_in"]);
      const val = evaluateMathOp(op, a, b);
      result["result_out"] = { type: "float", value: val };
      break;
    }

    case "group": {
      // Groups don't produce values — they're organizational
      break;
    }

    case "on_start": {
      result["trigger_out"] = { type: "trigger", value: true };
      break;
    }

    case "on_update": {
      result["trigger_out"] = { type: "trigger", value: true };
      result["dt_out"] = { type: "float", value: node.data._dt ?? 0.016 };
      break;
    }

    case "on_input": {
      result["trigger_out"] = { type: "trigger", value: node.data._pressed === true };
      result["key_out"] = { type: "string", value: node.data._key ?? "" };
      break;
    }

    case "input_map": {
      // Runtime loop injects _actionStates: Record<string, boolean>
      result["actions_out"] = {
        type: "any",
        value: node.data._actionStates ?? {},
      };
      break;
    }
    case "composer": {
      // Collect all entity references from multi-input entities_in port
      const entityRefs: Array<{ nodeId: string }> = [];
      const multi = multiInputs["entities_in"];
      if (multi) {
        for (const pv of multi) {
          if (pv.type === "entity" && pv.value && typeof pv.value === "object") {
            entityRefs.push(pv.value as { nodeId: string });
          }
        }
      } else if (inputs["entities_in"]) {
        const pv = inputs["entities_in"];
        if (pv.type === "entity" && pv.value && typeof pv.value === "object") {
          entityRefs.push(pv.value as { nodeId: string });
        }
      }
      result["scene_out"] = {
        type: "any",
        value: { nodeId: node.id, entities: entityRefs },
      };
      break;
    }

    case "output": {
      // Output node is a sink — it collects inputs for the rendering pipeline
      // No outputs to produce; the runtime reads its resolved inputs directly
      break;
    }
  }

  return result;
}

function resolveFloat(portValue: PortValue | undefined): number {
  if (!portValue) return 0;
  if (typeof portValue.value === "number") return portValue.value;
  return 0;
}

// ── Output-node reachability ─────────────────────────────────────────────────

/**
 * Walk backwards from all output nodes to find which sprite node IDs
 * are reachable. Only these sprites should render during play mode.
 *
 * If no output nodes exist, ALL sprites render (Godot-style: everything
 * in the scene is visible by default). Output nodes are optional gates
 * for advanced rendering control.
 */
export function getReachableSpriteIds(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>
): Set<string> {
  // Find output nodes
  const outputNodeIds: string[] = [];
  for (const node of Object.values(nodes)) {
    if (node.type === "output") outputNodeIds.push(node.id);
  }

  // No output nodes → all sprites render (Godot-style default)
  if (outputNodeIds.length === 0) {
    const allSprites = new Set<string>();
    for (const node of Object.values(nodes)) {
      if (node.type === "sprite") allSprites.add(node.id);
    }
    return allSprites;
  }

  // Build reverse adjacency (target → sources)
  const reverseAdj: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) {
    reverseAdj[id] = [];
  }
  for (const edge of Object.values(edges)) {
    if (edge.targetNodeId in reverseAdj) {
      reverseAdj[edge.targetNodeId].push(edge.sourceNodeId);
    }
  }

  // BFS backwards from output nodes
  const reachable = new Set<string>();
  const queue = [...outputNodeIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const src of reverseAdj[current] ?? []) {
      if (!reachable.has(src)) queue.push(src);
    }
  }

  // Filter to only sprite nodes
  const spriteIds = new Set<string>();
  for (const id of reachable) {
    if (nodes[id]?.type === "sprite") spriteIds.add(id);
  }

  return spriteIds;
}


// ── Dirty tracking ──────────────────────────────────────────────────────────

/**
 * Given a set of dirty (changed) node IDs, find all downstream nodes
 * that need re-evaluation.
 */
export function getDirtySubgraph(
  dirtyNodeIds: Set<string>,
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>
): Set<string> {
  // Build forward adjacency (source → targets)
  const adjacency: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) {
    adjacency[id] = [];
  }
  for (const edge of Object.values(edges)) {
    if (edge.sourceNodeId in adjacency) {
      adjacency[edge.sourceNodeId].push(edge.targetNodeId);
    }
  }

  const dirty = new Set(dirtyNodeIds);
  const queue = [...dirtyNodeIds];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    for (const dep of adjacency[nodeId] ?? []) {
      if (!dirty.has(dep)) {
        dirty.add(dep);
        queue.push(dep);
      }
    }
  }

  return dirty;
}

// ── Partial evaluation ──────────────────────────────────────────────────────

/**
 * Re-evaluate only the dirty subgraph, reusing cached outputs for clean nodes.
 */
export function evaluatePartial(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
  dirtyNodeIds: Set<string>,
  cachedOutputs: Record<string, NodeOutputs>
): EvalResult {
  const dirty = getDirtySubgraph(dirtyNodeIds, nodes, edges);
  const sortResult = topologicalSort(nodes, edges);
  const errors: EvalError[] = [];

  if (!sortResult.ok) {
    errors.push({
      nodeId: sortResult.cycle[0] ?? "",
      message: `Cycle detected: ${sortResult.cycle.join(" → ")}`,
    });
    return { outputs: cachedOutputs, errors, order: [] };
  }

  const { order } = sortResult;
  const outputs: Record<string, NodeOutputs> = { ...cachedOutputs };

  // Build edge lookup (multi-input aware)
  const inputConnections: Record<
    string,
    Record<string, Array<{ sourceNodeId: string; sourcePortId: string; edgeId: string }>>
  > = {};
  for (const edge of Object.values(edges)) {
    if (!inputConnections[edge.targetNodeId]) {
      inputConnections[edge.targetNodeId] = {};
    }
    if (!inputConnections[edge.targetNodeId][edge.targetPortId]) {
      inputConnections[edge.targetNodeId][edge.targetPortId] = [];
    }
    inputConnections[edge.targetNodeId][edge.targetPortId].push({
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      edgeId: edge.id,
    });
  }

  for (const nodeId of order) {
    if (!dirty.has(nodeId)) continue;

    const node = nodes[nodeId];
    if (!node) continue;

    const resolvedInputs: Record<string, PortValue> = {};
    const multiInputs: Record<string, PortValue[]> = {};
    const connections = inputConnections[nodeId] ?? {};
    for (const [portId, conns] of Object.entries(connections)) {
      const values: PortValue[] = [];
      for (const conn of conns) {
        const sourceOutputs = outputs[conn.sourceNodeId];
        if (sourceOutputs && conn.sourcePortId in sourceOutputs) {
          values.push(sourceOutputs[conn.sourcePortId]);
        }
      }
      if (values.length > 0) {
        resolvedInputs[portId] = values[0];
      }
      if (values.length > 1) {
        multiInputs[portId] = values;
      }
    }

    outputs[nodeId] = evaluateNode(node, resolvedInputs, errors, multiInputs);
  }

  return { outputs, errors, order };
}
