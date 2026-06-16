import type { GraphNode } from "@dreamer/schemas";
import type { InputAction } from "@/graph/node-factory";
import { useGraph } from "@/store/graph-context";

type InputMapContentProps = {
  node: GraphNode;
};

export function InputMapContent({ node }: InputMapContentProps) {
  const { state } = useGraph();
  const actions = Array.isArray(node.data.actions)
    ? (node.data.actions as InputAction[])
    : [];

  // Find what this input map's actions_out port is connected to
  const outEdge = Object.values(state.edges).find(
    (e) => e.sourceNodeId === node.id && e.sourcePortId === "actions_out"
  );
  const targetNode = outEdge ? state.nodes[outEdge.targetNodeId] : null;
  const targetPort = targetNode
    ? targetNode.ports.find((p) => p.id === outEdge!.targetPortId)
    : null;

  return (
    <div className="px-2 py-1">
      {targetNode && (
        <div className="text-[9px] text-violet-400 mb-1 truncate">
          → {targetNode.name}
          {targetPort ? ` (${targetPort.name})` : ""}
        </div>
      )}
      {actions.map((action) => (
        <div
          key={action.name}
          className="flex items-center justify-between text-[9px] py-0.5"
        >
          <span className="text-foreground truncate">{action.name}</span>
          <span className="text-muted-foreground font-mono ml-1">
            {action.keys.slice(0, 2).join("/")}
          </span>
        </div>
      ))}
    </div>
  );
}
