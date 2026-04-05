import { useEffect, useRef } from "react";
import { useProject } from "./project-context";
import { useGraph } from "@/store/graph-context";
import { saveProjectGraph } from "./api-client";
import { createGraphNode } from "@/graph/node-factory";
import { getDefaultPorts } from "@dreamer/schemas";
import type { GraphNodeType } from "@dreamer/schemas";

const SAVE_DEBOUNCE_MS = 2000;

/**
 * Hydrates graph state from the project file on mount,
 * then auto-saves graph changes back to the server.
 */
export function useGraphPersistence() {
  const { projectFile, projectId } = useProject();
  const { state, send } = useGraph();
  const hasHydrated = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef<string>("");

  // Hydrate graph state from project file on mount
  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;

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

    // Replay saved nodes and edges into the graph machine
    // Refresh ports from current schema so saved projects pick up new ports
    for (const node of nodeEntries) {
      node.ports = getDefaultPorts(node.type as GraphNodeType);
      send({ type: "ADD_NODE", node });
    }
    for (const edge of edgeEntries) {
      send({ type: "ADD_EDGE", edge });
    }
    send({ type: "CLEAR_SELECTION" });
  }, [projectFile, send]);

  // Auto-save graph changes to server (debounced)
  useEffect(() => {
    if (!hasHydrated.current) return;

    const snapshot = JSON.stringify({ nodes: state.nodes, edges: state.edges });

    // Skip if nothing changed since last save
    if (snapshot === lastSavedRef.current) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastSavedRef.current = snapshot;
      saveProjectGraph(projectId, {
        nodes: state.nodes,
        edges: state.edges,
      }).catch(() => {
        // Best-effort save — don't block the UI
      });
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [state.nodes, state.edges, projectId]);
}
