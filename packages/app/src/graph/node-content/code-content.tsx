import { useCallback } from "react";
import type { GraphNode } from "@dreamer/schemas";
import { useGraph } from "@/store/graph-context";

type CodeContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

/** Port IDs that carry named/structured data worth showing on the node card */
const WIRING_PORTS = ["data_0_in", "data_1_in", "entity_0_in", "entity_1_in"] as const;

export function CodeContent({ node, onDataChange }: CodeContentProps) {
  const { state } = useGraph();
  const code = typeof node.data.code === "string" ? node.data.code : "";
  const language =
    typeof node.data.language === "string" ? node.data.language : "typescript";
  const lines = code.split("\n");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDataChange?.(node.id, { code: e.target.value });
    },
    [node.id, onDataChange]
  );

  // Build connection labels for data/entity input ports
  const connections: Array<{ portName: string; sourceName: string; portId: string }> = [];
  for (const portId of WIRING_PORTS) {
    const port = node.ports.find((p) => p.id === portId);
    if (!port) continue;
    const edge = Object.values(state.edges).find(
      (e) => e.targetNodeId === node.id && e.targetPortId === portId
    );
    if (!edge) continue;
    const sourceNode = state.nodes[edge.sourceNodeId];
    if (!sourceNode) continue;
    connections.push({ portName: port.name, sourceName: sourceNode.name, portId });
  }

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500">
          {language}
        </span>
        <span className="text-[9px] text-neutral-600">
          {lines.length} lines
        </span>
      </div>
      {connections.length > 0 && (
        <div className="mb-1 space-y-0.5">
          {connections.map((c) => (
            <div key={c.portId} className="text-[9px] truncate">
              <span className="text-neutral-500">{c.portName}</span>
              <span className="text-neutral-600"> ← </span>
              <span className="text-emerald-400">{c.sourceName}</span>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="w-full bg-neutral-950 text-[10px] text-emerald-400 font-mono p-1.5 rounded border border-neutral-700 resize-none outline-none focus:border-green-500"
        rows={4}
        value={code}
        onChange={handleChange}
        spellCheck={false}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
