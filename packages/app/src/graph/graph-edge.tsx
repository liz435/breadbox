import { useMemo } from "react";
import type { Edge, GraphNode } from "@dreamer/schemas";
import { getPortColor } from "./port-colors";

type GraphEdgeProps = {
  edge: Edge;
  nodes: Record<string, GraphNode>;
  isSelected: boolean;
  onClick: (edgeId: string) => void;
};

/**
 * Compute the screen position of a port on a node.
 * Ports are laid out vertically; we estimate position based on port index.
 */
function getPortPosition(
  node: GraphNode,
  portId: string,
  direction: "in" | "out"
): { x: number; y: number } {
  const ports = node.ports.filter((p) => p.direction === direction);
  const idx = ports.findIndex((p) => p.id === portId);
  const portIndex = idx >= 0 ? idx : 0;

  const headerHeight = 28;
  const portSpacing = 20;
  const portStartY = headerHeight + 10;

  const x = direction === "out" ? node.x + node.width : node.x;
  const y = node.y + portStartY + portIndex * portSpacing;

  return { x, y };
}

function computeBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.max(50, dx * 0.4);
  return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
}

export function GraphEdge({ edge, nodes, isSelected, onClick }: GraphEdgeProps) {
  const sourceNode = nodes[edge.sourceNodeId];
  const targetNode = nodes[edge.targetNodeId];

  const path = useMemo(() => {
    if (!sourceNode || !targetNode) return null;
    const from = getPortPosition(sourceNode, edge.sourcePortId, "out");
    const to = getPortPosition(targetNode, edge.targetPortId, "in");
    return computeBezierPath(from.x, from.y, to.x, to.y);
  }, [sourceNode, targetNode, edge.sourcePortId, edge.targetPortId]);

  const color = useMemo(() => {
    if (!sourceNode) return "#6b7280";
    const port = sourceNode.ports.find((p) => p.id === edge.sourcePortId);
    return port ? getPortColor(port.dataType) : "#6b7280";
  }, [sourceNode, edge.sourcePortId]);

  if (!path) return null;

  return (
    <g>
      {/* Wider invisible hit area */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        className="cursor-pointer"
        onClick={() => onClick(edge.id)}
      />
      {/* Visible edge */}
      <path
        d={path}
        fill="none"
        stroke={isSelected ? "#3b82f6" : color}
        strokeWidth={isSelected ? 2.5 : 2}
        strokeOpacity={isSelected ? 1 : 0.7}
        className="pointer-events-none"
      />
    </g>
  );
}

type PendingEdgeProps = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color?: string;
};

export function PendingEdge({
  fromX,
  fromY,
  toX,
  toY,
  color = "#6b7280",
}: PendingEdgeProps) {
  const path = computeBezierPath(fromX, fromY, toX, toY);
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeDasharray="6 3"
      strokeOpacity={0.6}
      className="pointer-events-none"
    />
  );
}
