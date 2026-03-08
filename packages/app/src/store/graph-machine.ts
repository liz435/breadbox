import { setup, assign } from "xstate";
import type { GraphNode, Edge, GraphNodeType } from "@dreamer/schemas";
import { getDefaultPorts } from "@dreamer/schemas";

// ── Graph State ─────────────────────────────────────────────────────────────

export type GraphState = {
  nodes: Record<string, GraphNode>;
  edges: Record<string, Edge>;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
};

export type GraphEvent =
  | { type: "ADD_NODE"; node: GraphNode }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "MOVE_NODE"; nodeId: string; x: number; y: number }
  | { type: "UPDATE_NODE"; nodeId: string; patch: Record<string, unknown> }
  | { type: "RENAME_NODE"; nodeId: string; name: string }
  | { type: "CHANGE_NODE_TYPE"; nodeId: string; newType: GraphNodeType }
  | { type: "ADD_EDGE"; edge: Edge }
  | { type: "REMOVE_EDGE"; edgeId: string }
  | { type: "SELECT_NODES"; nodeIds: string[] }
  | { type: "SELECT_EDGES"; edgeIds: string[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "SNAPSHOT" }
  | { type: "UNDO" }
  | { type: "REDO" };

const MAX_HISTORY = 100;

export type GraphMachineContext = GraphState & {
  _past: GraphState[];
  _future: GraphState[];
};

function graphData(ctx: GraphMachineContext): GraphState {
  return {
    nodes: ctx.nodes,
    edges: ctx.edges,
    selectedNodeIds: ctx.selectedNodeIds,
    selectedEdgeIds: ctx.selectedEdgeIds,
  };
}

function pushHistory(ctx: GraphMachineContext): {
  _past: GraphState[];
  _future: GraphState[];
} {
  const past = [...ctx._past, graphData(ctx)];
  if (past.length > MAX_HISTORY) past.shift();
  return { _past: past, _future: [] };
}

const NODE_SIZE: Record<GraphNodeType, { width: number; height: number }> = {
  sprite: { width: 200, height: 150 },
  shader: { width: 240, height: 160 },
  code: { width: 240, height: 160 },
  audio: { width: 200, height: 140 },
  video: { width: 200, height: 170 },
  text: { width: 200, height: 130 },
  material: { width: 200, height: 120 },
  math: { width: 160, height: 90 },
  group: { width: 240, height: 160 },
  on_start: { width: 160, height: 70 },
  on_update: { width: 160, height: 80 },
  on_input: { width: 160, height: 80 },
  input_map: { width: 200, height: 120 },
  composer: { width: 200, height: 100 },
  output: { width: 200, height: 120 },
};

function removeEdgesWithStalePorts(
  edges: Record<string, Edge>,
  nodeId: string,
  validPortIds: Set<string>,
): Record<string, Edge> {
  const result: Record<string, Edge> = {};
  for (const [id, edge] of Object.entries(edges)) {
    if (
      (edge.sourceNodeId === nodeId && !validPortIds.has(edge.sourcePortId)) ||
      (edge.targetNodeId === nodeId && !validPortIds.has(edge.targetPortId))
    ) {
      continue;
    }
    result[id] = edge;
  }
  return result;
}

function removeEdgesForNode(
  edges: Record<string, Edge>,
  nodeId: string
): Record<string, Edge> {
  const result: Record<string, Edge> = {};
  for (const [id, edge] of Object.entries(edges)) {
    if (edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId) {
      result[id] = edge;
    }
  }
  return result;
}

const initialContext: GraphMachineContext = {
  nodes: {},
  edges: {},
  selectedNodeIds: new Set(),
  selectedEdgeIds: new Set(),
  _past: [],
  _future: [],
};

export const graphMachine = setup({
  types: {
    context: {} as GraphMachineContext,
    events: {} as GraphEvent,
  },
  guards: {
    canUndo: ({ context }) => context._past.length > 0,
    canRedo: ({ context }) => context._future.length > 0,
  },
}).createMachine({
  id: "graph",
  context: initialContext,
  on: {
    SNAPSHOT: {
      actions: assign(({ context }) => pushHistory(context)),
    },

    UNDO: {
      guard: "canUndo",
      actions: assign(({ context }) => {
        const past = [...context._past];
        const prev = past.pop()!;
        return {
          ...prev,
          _past: past,
          _future: [graphData(context), ...context._future],
        };
      }),
    },

    REDO: {
      guard: "canRedo",
      actions: assign(({ context }) => {
        const future = [...context._future];
        const next = future.shift()!;
        return {
          ...next,
          _past: [...context._past, graphData(context)],
          _future: future,
        };
      }),
    },

    // ── Discrete actions: auto-snapshot ──

    ADD_NODE: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        nodes: { ...context.nodes, [event.node.id]: event.node },
        selectedNodeIds: new Set([event.node.id]),
        selectedEdgeIds: new Set<string>(),
      })),
    },

    REMOVE_NODE: {
      actions: assign(({ context, event }) => {
        const { [event.nodeId]: _, ...remainingNodes } = context.nodes;
        const remainingEdges = removeEdgesForNode(context.edges, event.nodeId);
        const selectedNodeIds = new Set(context.selectedNodeIds);
        selectedNodeIds.delete(event.nodeId);
        return {
          ...pushHistory(context),
          nodes: remainingNodes,
          edges: remainingEdges,
          selectedNodeIds,
        };
      }),
    },

    ADD_EDGE: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        edges: { ...context.edges, [event.edge.id]: event.edge },
      })),
    },

    REMOVE_EDGE: {
      actions: assign(({ context, event }) => {
        const { [event.edgeId]: _, ...remainingEdges } = context.edges;
        const selectedEdgeIds = new Set(context.selectedEdgeIds);
        selectedEdgeIds.delete(event.edgeId);
        return {
          ...pushHistory(context),
          edges: remainingEdges,
          selectedEdgeIds,
        };
      }),
    },

    // ── Continuous actions: caller sends SNAPSHOT before gesture ──

    MOVE_NODE: {
      actions: assign(({ context, event }) => {
        const node = context.nodes[event.nodeId];
        if (!node) return {};
        return {
          nodes: {
            ...context.nodes,
            [event.nodeId]: { ...node, x: event.x, y: event.y },
          },
        };
      }),
    },

    UPDATE_NODE: {
      actions: assign(({ context, event }) => {
        const node = context.nodes[event.nodeId];
        if (!node) return {};
        return {
          nodes: {
            ...context.nodes,
            [event.nodeId]: {
              ...node,
              data: { ...node.data, ...event.patch },
            },
          },
        };
      }),
    },

    RENAME_NODE: {
      actions: assign(({ context, event }) => {
        const node = context.nodes[event.nodeId];
        if (!node) return {};
        return {
          ...pushHistory(context),
          nodes: {
            ...context.nodes,
            [event.nodeId]: { ...node, name: event.name },
          },
        };
      }),
    },

    CHANGE_NODE_TYPE: {
      actions: assign(({ context, event }) => {
        const node = context.nodes[event.nodeId];
        if (!node || node.type === event.newType) return {};
        const newPorts = getDefaultPorts(event.newType);
        const newPortIds = new Set(newPorts.map((p) => p.id));
        const size = NODE_SIZE[event.newType];
        const updatedNode: GraphNode = {
          ...node,
          type: event.newType,
          ports: newPorts,
          width: size.width,
          height: size.height,
        };
        const edges = removeEdgesWithStalePorts(context.edges, event.nodeId, newPortIds);
        return {
          ...pushHistory(context),
          nodes: { ...context.nodes, [event.nodeId]: updatedNode },
          edges,
        };
      }),
    },

    // ── Selection (non-undoable) ──

    SELECT_NODES: {
      actions: assign({
        selectedNodeIds: ({ event }) => new Set(event.nodeIds),
        selectedEdgeIds: () => new Set<string>(),
      }),
    },

    SELECT_EDGES: {
      actions: assign({
        selectedEdgeIds: ({ event }) => new Set(event.edgeIds),
        selectedNodeIds: () => new Set<string>(),
      }),
    },

    CLEAR_SELECTION: {
      actions: assign({
        selectedNodeIds: () => new Set<string>(),
        selectedEdgeIds: () => new Set<string>(),
      }),
    },
  },
});
