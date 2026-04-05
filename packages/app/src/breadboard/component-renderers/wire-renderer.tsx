import React from "react";
import type { Wire } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";

type WireRendererProps = {
  wire: Wire;
  isSelected: boolean;
};

function WireRendererInner({ wire, isSelected }: WireRendererProps) {
  const from = gridToPixel({ row: wire.fromRow, col: wire.fromCol });
  const to = gridToPixel({ row: wire.toRow, col: wire.toCol });
  const color = wire.color ?? "#22c55e";

  // Create a slightly curved path for visual clarity
  const midY = (from.y + to.y) / 2;
  const curveOffset = Math.abs(from.x - to.x) * 0.15;
  const pathD = `M ${from.x} ${from.y} C ${from.x} ${midY - curveOffset}, ${to.x} ${midY + curveOffset}, ${to.x} ${to.y}`;

  return (
    <g>
      {/* Wire shadow for selection visibility */}
      {isSelected && (
        <path
          d={pathD}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.5}
        />
      )}
      {/* Main wire */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* End points */}
      <circle cx={from.x} cy={from.y} r={2.5} fill={color} />
      <circle cx={to.x} cy={to.y} r={2.5} fill={color} />
    </g>
  );
}

export const WireRenderer = React.memo(WireRendererInner);
