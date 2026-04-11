import { useEffect, useRef } from "react";
import { useProject } from "./project-context";
import { useGraph } from "@/store/graph-context";
import { createGraphNode } from "@/graph/node-factory";
import { getDefaultPorts } from "@dreamer/schemas";
import type { GraphNodeType } from "@dreamer/schemas";

/**
 * Hydrates graph state from the project file when the project loads or
 * changes. Autosave is handled centrally by `useBoardPersistence`, which
 * persists board and graph atomically through a single `/state` request.
 *
 * Why two hooks share one save path:
 *   When board and graph were saved through separate POSTs, two concurrent
 *   read-modify-write cycles on the same project file would silently drop
 *   one half of the save. The combined endpoint reads once, applies both
 *   mutations, and writes once.
 */
export function useGraphPersistence() {
  const { projectFile, projectId } = useProject();
  const { send } = useGraph();
  // Track which projectId we have already hydrated for. Switching projects
  // changes `projectId`, which clears this guard and triggers a fresh
  // hydration into the (also fresh, via Provider remount) graph actor.
  const hydratedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedForRef.current === projectId) return;
    hydratedForRef.current = projectId;

    const graph = projectFile.graph;
    if (!graph) return;

    const nodeEntries = Object.values(graph.nodes);
    const edgeEntries = Object.values(graph.edges);

    // Seed empty graphs with a basic setup + loop scaffold
    if (nodeEntries.length === 0 && edgeEntries.length === 0) {
      const setupNode = createGraphNode("setup", { x: 60, y: 60 });
      const loopNode = createGraphNode("loop", { x: 60, y: 200 });
      send({ type: "ADD_NODE", node: setupNode });
      send({ type: "ADD_NODE", node: loopNode });
      send({ type: "CLEAR_SELECTION" });
      return;
    }

    // Replay saved nodes and edges into the graph machine.
    // Refresh ports from the current schema so saved projects pick up new ports.
    for (const node of nodeEntries) {
      node.ports = getDefaultPorts(node.type as GraphNodeType);
      send({ type: "ADD_NODE", node });
    }
    for (const edge of edgeEntries) {
      send({ type: "ADD_EDGE", edge });
    }
    send({ type: "CLEAR_SELECTION" });
  }, [projectFile, projectId, send]);
}
