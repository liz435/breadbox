import React from "react";
import type { Wire, BoardComponent } from "@dreamer/schemas";
import { gridToPixel, type ArduinoPinInfo } from "@/breadboard/breadboard-grid";

type WireRendererProps = {
  wire: Wire;
  arduinoPins: ArduinoPinInfo[];
  isSelected: boolean;
  /**
   * Surface board components (breadboard_full / perfboard_generic). When a
   * wire endpoint references one of these via fromBoardId / toBoardId, the
   * board's worldX/worldY shifts the endpoint's pixel position so the wire
   * stays attached when the board moves.
   */
  surfaceBoards?: BoardComponent[];
  onSelect?: (id: string) => void;
  onDragEndpoint?: (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => void;
};

function offsetForBoard(
  boardId: string | undefined,
  surfaceBoards: BoardComponent[] | undefined,
): { dx: number; dy: number } {
  if (!boardId || !surfaceBoards) return { dx: 0, dy: 0 };
  const b = surfaceBoards.find((sb) => sb.id === boardId);
  if (!b) return { dx: 0, dy: 0 };
  return { dx: b.worldX ?? 0, dy: b.worldY ?? 0 };
}

/**
 * Resolve the "from" pixel position of a wire.
 * If fromRow === -999, this is an Arduino pin wire — look up the pin position by pin number (fromCol).
 */
function resolveFromPosition(
  wire: Wire,
  arduinoPins: ArduinoPinInfo[],
  surfaceBoards: BoardComponent[] | undefined,
): { x: number; y: number } {
  if (wire.fromRow === -999) {
    const pinInfo =
      (wire.fromPinLabel
        ? arduinoPins.find(
            (p) =>
              p.label === wire.fromPinLabel &&
              (wire.fromPinCategory ? p.category === wire.fromPinCategory : true),
          )
        : undefined) ??
      arduinoPins.find((p) => p.pin === wire.fromCol);
    if (pinInfo) {
      return { x: pinInfo.x, y: pinInfo.y };
    }
    return { x: 0, y: 0 };
  }
  const base = gridToPixel({ row: wire.fromRow, col: wire.fromCol });
  const { dx, dy } = offsetForBoard(wire.fromBoardId, surfaceBoards);
  return { x: base.x + dx, y: base.y + dy };
}

function resolveToPosition(
  wire: Wire,
  surfaceBoards: BoardComponent[] | undefined,
): { x: number; y: number } {
  const base = gridToPixel({ row: wire.toRow, col: wire.toCol });
  const { dx, dy } = offsetForBoard(wire.toBoardId, surfaceBoards);
  return { x: base.x + dx, y: base.y + dy };
}

function WireRendererInner({ wire, arduinoPins, isSelected, surfaceBoards, onSelect, onDragEndpoint }: WireRendererProps) {
  const from = resolveFromPosition(wire, arduinoPins, surfaceBoards);
  const to = resolveToPosition(wire, surfaceBoards);
  const color = wire.color ?? "#22c55e";

  const isPower =
    wire.color === "#ef4444" || wire.color === "#ff0000" || wire.color === "red";
  const isGround =
    wire.color === "#000000" || wire.color === "black";

  const wireColor = isPower ? "#ef4444" : isGround ? "#1a1a1a" : color;

  // Cross-board wires (between two different surface boards) draw as a
  // single quadratic arc — straight line with a slight midpoint nudge — so
  // the visual reads as "loose jumper crossing the gap" rather than "rigid
  // on-board jumper" (Q15 d). Same-board wires keep the existing cubic.
  const isCrossBoard =
    wire.fromBoardId != null &&
    wire.toBoardId != null &&
    wire.fromBoardId !== wire.toBoardId &&
    wire.fromBoardId !== "arduino-1" &&
    wire.toBoardId !== "arduino-1";

  let pathD: string;
  if (isCrossBoard) {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    // Nudge the control point perpendicular to the line so the wire arcs.
    const arcAmount = Math.min(40, len * 0.08);
    const nx = len > 0 ? -dy / len : 0;
    const ny = len > 0 ? dx / len : 0;
    const cx = midX + nx * arcAmount;
    const cy = midY + ny * arcAmount;
    pathD = `M ${from.x} ${from.y} Q ${cx} ${cy}, ${to.x} ${to.y}`;
  } else {
    const midY = (from.y + to.y) / 2;
    const curveOffset = Math.abs(from.x - to.x) * 0.15 + 4;
    pathD = `M ${from.x} ${from.y} C ${from.x} ${midY - curveOffset}, ${to.x} ${midY + curveOffset}, ${to.x} ${to.y}`;
  }

  const pinRadius = 3;
  const isArduinoPinWire = wire.fromRow === -999;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(wire.id);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Stop the press from bubbling to the canvas, where it would start a
    // fresh drag-to-wire gesture (and deselect) instead of selecting this
    // wire. Mirrors how component renderers guard their own pointer-down.
    e.stopPropagation();
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
    <g onClick={handleClick} onPointerDown={handlePointerDown} style={{ cursor: "pointer" }}>
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
