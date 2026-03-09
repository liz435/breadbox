import { useCallback, useRef } from "react";
import type { GraphNode as GraphNodeType } from "@dreamer/schemas";
import { cn } from "@/utils/classnames";
import { getNodeColor } from "./port-colors";
import { GraphPort } from "./graph-port";
import { NodeContent } from "./node-content";

type GraphNodeProps = {
  node: GraphNodeType;
  isSelected: boolean;
  zoom: number;
  onMouseDown: (nodeId: string, e: React.MouseEvent) => void;
  onConnectionStart?: (nodeId: string, portId: string) => void;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function GraphNode({
  node,
  isSelected,
  zoom,
  onMouseDown,
  onConnectionStart,
  onDataChange,
}: GraphNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const headerColor = getNodeColor(node.type);

  const inputPorts = node.ports.filter((p) => p.direction === "in");
  const outputPorts = node.ports.filter((p) => p.direction === "out");

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseDown(node.id, e);
    },
    [node.id, onMouseDown]
  );

  return (
    <div
      ref={nodeRef}
      data-node-id={node.id}
      className={cn(
        "absolute rounded-lg overflow-hidden shadow-lg select-none",
        "bg-neutral-900 border",
        isSelected ? "border-blue-500" : "border-neutral-700"
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        minHeight: node.height,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 text-xs font-medium text-white truncate cursor-grab active:cursor-grabbing"
        style={{ backgroundColor: headerColor }}
      >
        <span className="opacity-60 mr-1.5 uppercase text-[9px] tracking-wider">
          {node.type}
        </span>
        {node.name}
      </div>

      {/* Content preview */}
      <NodeContent node={node} onDataChange={onDataChange} />

      {/* Ports */}
      <div className="flex justify-between px-2 py-1.5 gap-4">
        {/* Input ports */}
        <div className="flex flex-col gap-0.5 min-w-0">
          {inputPorts.map((port) => (
            <GraphPort
              key={port.id}
              port={port}
              nodeId={node.id}
              onConnectionStart={onConnectionStart}
            />
          ))}
        </div>

        {/* Output ports */}
        <div className="flex flex-col gap-0.5 min-w-0">
          {outputPorts.map((port) => (
            <GraphPort
              key={port.id}
              port={port}
              nodeId={node.id}
              onConnectionStart={onConnectionStart}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
