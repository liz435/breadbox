import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel, HOLE_SPACING } from "@/breadboard/breadboard-grid";
import { PinLabel } from "./pin-label";

type ResistorRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
};

const BAND_COLORS: Record<number, string> = {
  0: "#000000", // black
  1: "#8B4513", // brown
  2: "#ef4444", // red
  3: "#f97316", // orange
  4: "#eab308", // yellow
  5: "#22c55e", // green
  6: "#3b82f6", // blue
  7: "#8b5cf6", // violet
  8: "#6b7280", // gray
  9: "#ffffff", // white
};

const TOLERANCE_GOLD = "#CFB53B";

function resistanceToBands(resistance: number): string[] {
  if (resistance <= 0) return ["#000000", "#000000", "#000000", TOLERANCE_GOLD];
  const exp = Math.floor(Math.log10(resistance));
  const significant = Math.round(resistance / Math.pow(10, exp - 1));
  const d1 = Math.floor(significant / 10) % 10;
  const d2 = significant % 10;
  const multiplier = Math.max(0, exp - 1);
  return [
    BAND_COLORS[d1] ?? "#000000",
    BAND_COLORS[d2] ?? "#000000",
    BAND_COLORS[multiplier] ?? "#000000",
    TOLERANCE_GOLD, // 5% tolerance
  ];
}

function ResistorRendererInner({ component, isSelected, electricalState }: ResistorRendererProps) {
  const resistance = (component.properties.resistance as number) ?? 220;
  const bands = resistanceToBands(resistance);

  // Resistor spans from (row, col) to (row, col+4) — 5 holes horizontally
  const pinA = gridToPixel({ row: component.y, col: component.x });
  const pinB = gridToPixel({ row: component.y, col: component.x + 4 });

  const centerX = (pinA.x + pinB.x) / 2;
  const centerY = pinA.y;
  const bodyWidth = Math.abs(pinB.x - pinA.x) * 0.55;
  const bodyHeight = 10;
  const leadStartX = pinA.x;
  const leadEndX = pinB.x;
  const bodyLeftX = centerX - bodyWidth / 2;
  const bodyRightX = centerX + bodyWidth / 2;
  const gradientId = `res-grad-${component.id}`;

  return (
    <g>
      <defs>
        {/* Body gradient for 3D cylinder look */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5e6c8" />
          <stop offset="30%" stopColor="#e8d5b7" />
          <stop offset="70%" stopColor="#d4c4a0" />
          <stop offset="100%" stopColor="#c0a882" />
        </linearGradient>
      </defs>

      {/* Wire lead left */}
      <line
        x1={leadStartX}
        y1={centerY}
        x2={bodyLeftX}
        y2={centerY}
        stroke="#a0a0a0"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Wire lead right */}
      <line
        x1={bodyRightX}
        y1={centerY}
        x2={leadEndX}
        y2={centerY}
        stroke="#a0a0a0"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Body */}
      <rect
        x={bodyLeftX}
        y={centerY - bodyHeight / 2}
        width={bodyWidth}
        height={bodyHeight}
        rx={2}
        fill={`url(#${gradientId})`}
        stroke={isSelected ? "#3b82f6" : "#b0a080"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Color bands */}
      <g opacity={electricalState?.isActive === false ? 0.7 : 1}>
      {bands.map((color, i) => {
        const bandSpacing = bodyWidth / (bands.length + 1);
        const bx = bodyLeftX + bandSpacing * (i + 1) - 1.5;
        return (
          <rect
            key={i}
            x={bx}
            y={centerY - bodyHeight / 2 + 1}
            width={3}
            height={bodyHeight - 2}
            fill={color}
            rx={0.5}
            stroke={color === "#ffffff" ? "#ccc" : "none"}
            strokeWidth={0.3}
          />
        );
      })}
      </g>

      {/* Pin hole indicators */}
      <circle cx={pinA.x} cy={pinA.y} r={2} fill="#a0a0a0" opacity={0.5} />
      <circle cx={pinB.x} cy={pinB.y} r={2} fill="#a0a0a0" opacity={0.5} />

      {/* Pin labels */}
      <PinLabel x={pinA.x} y={pinA.y} name="a" side="above" symbol="A" />
      <PinLabel x={pinB.x} y={pinB.y} name="b" side="above" symbol="B" />

      {/* Label */}
      <text
        x={centerX}
        y={centerY + bodyHeight / 2 + 10}
        textAnchor="middle"
        fontSize={6}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name} ({resistance >= 1000 ? `${resistance / 1000}k` : resistance}&#937;)
      </text>

      {/* Current flow indicator when active */}
      {electricalState?.isActive && electricalState.current > 0.01 && (
        <text
          x={centerX}
          y={centerY - bodyHeight / 2 - 5}
          textAnchor="middle"
          fontSize={5}
          fill="#fbbf24"
          fontFamily="monospace"
        >
          {electricalState.current.toFixed(1)}mA
        </text>
      )}
    </g>
  );
}

export const ResistorRenderer = React.memo(ResistorRendererInner);
