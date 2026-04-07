import React from "react";
import type { Wire } from "@dreamer/schemas";
import { gridToPixel, ARDUINO_PINS } from "@/breadboard/breadboard-grid";

type WireRendererProps = {
  wire: Wire;
  isSelected: boolean;
  onSelect?: (id: string) => void;
};

/**
 * Resolve the "from" pixel position of a wire.
 * If fromRow === -999, this is an Arduino pin wire — look up the pin position by pin number (fromCol).
 * Otherwise, use normal grid-to-pixel conversion.
 */
function resolveFromPosition(wire: Wire): { x: number; y: number } {
  if (wire.fromRow === -999) {
    // Arduino pin wire: fromCol is the Arduino pin number
    const pinInfo = ARDUINO_PINS.find((p) => p.pin === wire.fromCol);
    if (pinInfo) {
      return { x: pinInfo.x, y: pinInfo.y };
    }
    // Fallback for unknown pin
    return { x: 0, y: 0 };
  }
  return gridToPixel({ row: wire.fromRow, col: wire.fromCol });
}

function WireRendererInner({ wire, isSelected, onSelect }: WireRendererProps) {
  const from = resolveFromPosition(wire);
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(wire.id);
  };

  return (
    <g onClick={handleClick} style={{ cursor: "pointer" }}>
      {/* Invisible wide hit area for easier clicking */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        strokeLinecap="round"
      />
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
