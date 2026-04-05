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

  // Determine if this is a power/ground wire for coloring
  const isPower =
    wire.color === "#ef4444" || wire.color === "#ff0000" || wire.color === "red";
  const isGround =
    wire.color === "#000000" || wire.color === "black";

  const wireColor = isPower ? "#ef4444" : isGround ? "#1a1a1a" : color;

  // Create a slightly curved path for visual clarity
  const midY = (from.y + to.y) / 2;
  const curveOffset = Math.abs(from.x - to.x) * 0.15 + 4;
  const pathD = `M ${from.x} ${from.y} C ${from.x} ${midY - curveOffset}, ${to.x} ${midY + curveOffset}, ${to.x} ${to.y}`;

  const pinRadius = 3;

  return (
    <g>
      {/* Wire shadow for selection visibility */}
      {isSelected && (
        <path
          d={pathD}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={0.4}
        />
      )}

      {/* Wire insulation (thicker, colored) */}
      <path
        d={pathD}
        fill="none"
        stroke={wireColor}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.9}
      />

      {/* Wire core highlight (thinner, lighter) */}
      <path
        d={pathD}
        fill="none"
        stroke={wireColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.5}
        filter="url(#wire-highlight)"
      />

      {/* End point pins (male jumper wire ends) */}
      <circle
        cx={from.x}
        cy={from.y}
        r={pinRadius}
        fill={wireColor}
        stroke="#888"
        strokeWidth={0.5}
      />
      <circle
        cx={from.x}
        cy={from.y}
        r={pinRadius - 1.2}
        fill={wireColor}
        opacity={0.7}
      />

      <circle
        cx={to.x}
        cy={to.y}
        r={pinRadius}
        fill={wireColor}
        stroke="#888"
        strokeWidth={0.5}
      />
      <circle
        cx={to.x}
        cy={to.y}
        r={pinRadius - 1.2}
        fill={wireColor}
        opacity={0.7}
      />
    </g>
  );
}

export const WireRenderer = React.memo(WireRendererInner);
