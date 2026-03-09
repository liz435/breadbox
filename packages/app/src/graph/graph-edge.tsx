import { useLayoutEffect, useRef, useState } from "react";
import type { Edge, GraphNode } from "@dreamer/schemas";
import { getPortColor } from "./port-colors";

type GraphEdgeProps = {
  edge: Edge;
  nodes: Record<string, GraphNode>;
  isSelected: boolean;
  onClick: (edgeId: string) => void;
  /** The transform-container element that holds both SVG and node layers */
  containerEl: HTMLElement | null;
};

/**
 * Walk up the offsetParent chain to compute the element's position
 * relative to a given ancestor.
 */
function offsetRelativeTo(
  el: HTMLElement,
  ancestor: HTMLElement
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = el;
  while (current && current !== ancestor) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * Find the center of a port circle in graph-world coordinates
 * by querying the DOM for the actual rendered element.
 */
function getPortCenter(
  container: HTMLElement,
  nodeId: string,
  portId: string
): { x: number; y: number } | null {
  const el = container.querySelector(
    `[data-port-id="${portId}"][data-port-node-id="${nodeId}"]`
  ) as HTMLElement | null;
  if (!el) return null;
  const pos = offsetRelativeTo(el, container);
  return {
    x: pos.x + el.offsetWidth / 2,
    y: pos.y + el.offsetHeight / 2,
  };
}

/**
 * Fallback: estimate port position from node geometry when DOM isn't ready.
 */
function estimatePortPosition(
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

export function GraphEdge({
  edge,
  nodes,
  isSelected,
  onClick,
  containerEl,
}: GraphEdgeProps) {
  const sourceNode = nodes[edge.sourceNodeId];
  const targetNode = nodes[edge.targetNodeId];
  const [path, setPath] = useState<string | null>(null);
  const prevPathRef = useRef<string | null>(null);

  // Measure actual DOM positions after layout
  useLayoutEffect(() => {
    if (!sourceNode || !targetNode) {
      setPath(null);
      return;
    }

    let from: { x: number; y: number };
    let to: { x: number; y: number };

    if (containerEl) {
      from =
        getPortCenter(containerEl, edge.sourceNodeId, edge.sourcePortId) ??
        estimatePortPosition(sourceNode, edge.sourcePortId, "out");
      to =
        getPortCenter(containerEl, edge.targetNodeId, edge.targetPortId) ??
        estimatePortPosition(targetNode, edge.targetPortId, "in");
    } else {
      from = estimatePortPosition(sourceNode, edge.sourcePortId, "out");
      to = estimatePortPosition(targetNode, edge.targetPortId, "in");
    }

    const newPath = computeBezierPath(from.x, from.y, to.x, to.y);
    if (newPath !== prevPathRef.current) {
      prevPathRef.current = newPath;
      setPath(newPath);
    }
  });

  const color = (() => {
    if (!sourceNode) return "#6b7280";
    const port = sourceNode.ports.find((p) => p.id === edge.sourcePortId);
    return port ? getPortColor(port.dataType) : "#6b7280";
  })();

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
