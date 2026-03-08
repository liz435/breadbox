import { useEffect, useRef } from "react";
import { useProject } from "./project-context";
import { useGraph } from "@/store/graph-context";
import { saveProjectGraph } from "./api-client";

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

    if (nodeEntries.length === 0 && edgeEntries.length === 0) return;

    // Replay nodes and edges into the graph machine
    for (const node of nodeEntries) {
      send({ type: "ADD_NODE", node });
    }
    for (const edge of edgeEntries) {
      send({ type: "ADD_EDGE", edge });
    }
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
