import React from "react";
import type { Wire } from "@dreamer/schemas";
import { gridToPixel, ARDUINO_PINS } from "@/breadboard/breadboard-grid";

type WireRendererProps = {
  wire: Wire;
  isSelected: boolean;
  onSelect?: (id: string) => void;
  onDragEndpoint?: (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => void;
};

/**
 * Resolve the "from" pixel position of a wire.
 * If fromRow === -999, this is an Arduino pin wire — look up the pin position by pin number (fromCol).
 */
function resolveFromPosition(wire: Wire): { x: number; y: number } {
  if (wire.fromRow === -999) {
    const pinInfo = ARDUINO_PINS.find((p) => p.pin === wire.fromCol);
    if (pinInfo) {
      return { x: pinInfo.x, y: pinInfo.y };
    }
    return { x: 0, y: 0 };
  }
  return gridToPixel({ row: wire.fromRow, col: wire.fromCol });
}

function WireRendererInner({ wire, isSelected, onSelect, onDragEndpoint }: WireRendererProps) {
  const from = resolveFromPosition(wire);
  const to = gridToPixel({ row: wire.toRow, col: wire.toCol });
  const color = wire.color ?? "#22c55e";

  const isPower =
    wire.color === "#ef4444" || wire.color === "#ff0000" || wire.color === "red";
  const isGround =
    wire.color === "#000000" || wire.color === "black";

  const wireColor = isPower ? "#ef4444" : isGround ? "#1a1a1a" : color;

  const midY = (from.y + to.y) / 2;
  const curveOffset = Math.abs(from.x - to.x) * 0.15 + 4;
  const pathD = `M ${from.x} ${from.y} C ${from.x} ${midY - curveOffset}, ${to.x} ${midY + curveOffset}, ${to.x} ${to.y}`;

  const pinRadius = 3;
  const isArduinoPinWire = wire.fromRow === -999;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(wire.id);
  };

  const handleFromPointerDown = (e: React.PointerEvent) => {
    if (isArduinoPinWire) return; // Can't drag Arduino pin end
    e.stopPropagation();
    onDragEndpoint?.(wire.id, "from", e);
  };

  const handleToPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onDragEndpoint?.(wire.id, "to", e);
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

      {/* Draggable endpoint handles — shown when selected */}
      {isSelected && (
        <>
          {/* From endpoint handle */}
          {!isArduinoPinWire && (
            <circle
              cx={from.x}
              cy={from.y}
              r={6}
              fill="#3b82f6"
              fillOpacity={0.2}
              stroke="#3b82f6"
              strokeWidth={1.5}
              style={{ cursor: "grab" }}
              onPointerDown={handleFromPointerDown}
            />
          )}
          {/* To endpoint handle */}
          <circle
            cx={to.x}
            cy={to.y}
            r={6}
            fill="#3b82f6"
            fillOpacity={0.2}
            stroke="#3b82f6"
            strokeWidth={1.5}
            style={{ cursor: "grab" }}
            onPointerDown={handleToPointerDown}
          />
        </>
      )}
    </g>
  );
}

export const WireRenderer = React.memo(WireRendererInner);
