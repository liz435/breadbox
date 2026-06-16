import { useMemo, useCallback } from "react";
import { useGraph } from "@/store/graph-context";
import {
  getGraphCamera,
  setGraphCamera,
} from "./graph-camera";
import { getNodeColor } from "./port-colors";

const MINIMAP_W = 160;
const MINIMAP_H = 100;
const PADDING = 10;

export function GraphMinimap() {
  const { state } = useGraph();

  const nodeList = useMemo(() => Object.values(state.nodes), [state.nodes]);

  // Compute bounding box of all nodes
  const bounds = useMemo(() => {
    if (nodeList.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodeList) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    }
    // Add padding
    const pw = (maxX - minX) * 0.1 + PADDING;
    const ph = (maxY - minY) * 0.1 + PADDING;
    return {
      minX: minX - pw,
      minY: minY - ph,
      maxX: maxX + pw,
      maxY: maxY + ph,
    };
  }, [nodeList]);

  const worldW = bounds.maxX - bounds.minX || 1;
  const worldH = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH);

  const toMinimap = useCallback(
    (wx: number, wy: number) => ({
      x: (wx - bounds.minX) * scale,
      y: (wy - bounds.minY) * scale,
    }),
    [bounds, scale]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Convert minimap coords to world coords
      const worldX = mx / scale + bounds.minX;
      const worldY = my / scale + bounds.minY;
      const cam = getGraphCamera();
      // Center the viewport on this world point
      // We need the container size — estimate from current camera
      setGraphCamera({
        offsetX: -worldX * cam.zoom + 400,
        offsetY: -worldY * cam.zoom + 300,
        zoom: cam.zoom,
      });
    },
    [scale, bounds]
  );

  if (nodeList.length === 0) return null;

  return (
    <svg
      width={MINIMAP_W}
      height={MINIMAP_H}
      className="bg-card/80 border border-border rounded cursor-pointer"
      onClick={handleClick}
    >
      {/* Edges */}
      {Object.values(state.edges).map((edge) => {
        const src = state.nodes[edge.sourceNodeId];
        const tgt = state.nodes[edge.targetNodeId];
        if (!src || !tgt) return null;
        const from = toMinimap(
          src.x + src.width,
          src.y + src.height / 2
        );
        const to = toMinimap(tgt.x, tgt.y + tgt.height / 2);
        return (
          <line
            key={edge.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#555"
            strokeWidth={0.5}
          />
        );
      })}
      {/* Nodes */}
      {nodeList.map((node) => {
        const pos = toMinimap(node.x, node.y);
        const w = Math.max(node.width * scale, 2);
        const h = Math.max(node.height * scale, 2);
        return (
          <rect
            key={node.id}
            x={pos.x}
            y={pos.y}
            width={w}
            height={h}
            fill={getNodeColor(node.type)}
            opacity={0.8}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
