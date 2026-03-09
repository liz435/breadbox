import type { GraphOp } from "@dreamer/schemas";
import type { GraphEvent } from "@/store/graph-machine";

/**
 * Translates an array of GraphOps into GraphEvents
 * and dispatches them to the XState graph machine.
 *
 * Graph ops come from the graph specialist agent and describe
 * node/edge mutations to apply to the visual node graph.
 */
export function applyGraphOpsToGraph(
  ops: GraphOp[],
  send: (event: GraphEvent) => void
): void {
  for (const op of ops) {
    switch (op.kind) {
      case "create_graph_node": {
        send({ type: "ADD_NODE", node: op.payload.node });
        break;
      }

      case "delete_graph_node": {
        send({ type: "REMOVE_NODE", nodeId: op.payload.nodeId });
        break;
      }

      case "move_graph_node": {
        send({
          type: "MOVE_NODE",
          nodeId: op.payload.nodeId,
          x: op.payload.x,
          y: op.payload.y,
        });
        break;
      }

      case "update_graph_node_data": {
        send({
          type: "UPDATE_NODE",
          nodeId: op.payload.nodeId,
          patch: op.payload.patch,
        });
        break;
      }

      case "create_edge": {
        send({ type: "ADD_EDGE", edge: op.payload.edge });
        break;
      }

      case "delete_edge": {
        send({ type: "REMOVE_EDGE", edgeId: op.payload.edgeId });
        break;
      }
    }
  }
}

/**
 * Check if a SceneOp-shaped object is actually a GraphOp.
 * Graph ops have kinds that start with graph-specific prefixes.
 */
const GRAPH_OP_KINDS = new Set([
  "create_graph_node",
  "delete_graph_node",
  "move_graph_node",
  "update_graph_node_data",
  "create_edge",
  "delete_edge",
]);

export function isGraphOp(op: { kind: string }): boolean {
  return GRAPH_OP_KINDS.has(op.kind);
}
