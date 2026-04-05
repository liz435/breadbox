import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";

type ResistorRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
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
  8: "#6b7280", // grey
  9: "#ffffff", // white
};

function resistanceToBands(resistance: number): string[] {
  if (resistance <= 0) return ["#000000", "#000000", "#000000"];
  const exp = Math.floor(Math.log10(resistance));
  const significant = Math.round(resistance / Math.pow(10, exp - 1));
  const d1 = Math.floor(significant / 10) % 10;
  const d2 = significant % 10;
  const multiplier = Math.max(0, exp - 1);
  return [
    BAND_COLORS[d1] ?? "#000000",
    BAND_COLORS[d2] ?? "#000000",
    BAND_COLORS[multiplier] ?? "#000000",
  ];
}

function ResistorRendererInner({ component, isSelected }: ResistorRendererProps) {
  const resistance = (component.properties.resistance as number) ?? 220;
  const bands = resistanceToBands(resistance);
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const bodyWidth = 24;
  const bodyHeight = 8;
  const leadLength = 6;

  return (
    <g>
      {/* Leads */}
      <line
        x1={x - bodyWidth / 2 - leadLength}
        y1={y}
        x2={x - bodyWidth / 2}
        y2={y}
        stroke="#a3a3a3"
        strokeWidth={1.5}
      />
      <line
        x1={x + bodyWidth / 2}
        y1={y}
        x2={x + bodyWidth / 2 + leadLength}
        y2={y}
        stroke="#a3a3a3"
        strokeWidth={1.5}
      />
      {/* Body */}
      <rect
        x={x - bodyWidth / 2}
        y={y - bodyHeight / 2}
        width={bodyWidth}
        height={bodyHeight}
        rx={1}
        fill="#e8d5b7"
        stroke={isSelected ? "#3b82f6" : "#a3a3a3"}
        strokeWidth={isSelected ? 2 : 1}
      />
      {/* Color bands */}
      {bands.map((color, i) => (
        <rect
          key={i}
          x={x - bodyWidth / 2 + 4 + i * 6}
          y={y - bodyHeight / 2 + 1}
          width={3}
          height={bodyHeight - 2}
          fill={color}
          rx={0.5}
        />
      ))}
      <text
        x={x}
        y={y + bodyHeight / 2 + 10}
        textAnchor="middle"
        fontSize={7}
        fill="#666"
      >
        {component.name}
      </text>
    </g>
  );
}

export const ResistorRenderer = React.memo(ResistorRendererInner);
