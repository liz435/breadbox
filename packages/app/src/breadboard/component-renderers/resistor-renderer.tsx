import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE, ANNOTATION_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { PinLabel } from "./pin-label";

type ResistorRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
};

const BAND_COLORS: Record<number, string> = {
  0: "#000000",
  1: "#8B4513",
  2: "#ef4444",
  3: "#f97316",
  4: "#eab308",
  5: "#22c55e",
  6: "#3b82f6",
  7: "#8b5cf6",
  8: "#6b7280",
  9: "#ffffff",
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
    TOLERANCE_GOLD,
  ];
}

function ResistorRendererInner({ component, isSelected, electricalState }: ResistorRendererProps) {
  const resistance = (component.properties.resistance as number) ?? 220;
  const bands = resistanceToBands(resistance);

  // The resistor's footprint hardcodes its two legs to col 3 (left half) and
  // col 6 (right half) so it always straddles the center gap — the placement
  // col (component.x) is ignored for pin positions, only the row matters.
  const pinA = gridToPixel({ row: component.y, col: 3 });
  const pinB = gridToPixel({ row: component.y, col: 6 });

  const centerX = (pinA.x + pinB.x) / 2;
  const centerY = pinA.y;
  const bodyW = Math.abs(pinB.x - pinA.x) * 0.52;
  const bodyH = 10;
  const halfH = bodyH / 2;
  const bodyL = centerX - bodyW / 2;
  const bodyR = centerX + bodyW / 2;
  const endR = 3; // radius of the rounded ends

  const gradientId = `res-grad-${component.id}`;
  const highlightId = `res-hi-${component.id}`;

  // Rounded-end body path (capsule / pill shape)
  const bodyPath = [
    `M ${bodyL + endR} ${centerY - halfH}`,
    `L ${bodyR - endR} ${centerY - halfH}`,
    `Q ${bodyR} ${centerY - halfH} ${bodyR} ${centerY - halfH + endR}`,
    `L ${bodyR} ${centerY + halfH - endR}`,
    `Q ${bodyR} ${centerY + halfH} ${bodyR - endR} ${centerY + halfH}`,
    `L ${bodyL + endR} ${centerY + halfH}`,
    `Q ${bodyL} ${centerY + halfH} ${bodyL} ${centerY + halfH - endR}`,
    `L ${bodyL} ${centerY - halfH + endR}`,
    `Q ${bodyL} ${centerY - halfH} ${bodyL + endR} ${centerY - halfH}`,
    `Z`,
  ].join(" ");

  return (
    <g>
      <defs>
        {/* Body gradient — 3D cylinder with warm ceramic color */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0dfc0" />
          <stop offset="20%" stopColor="#ebd5b0" />
          <stop offset="50%" stopColor="#dcc8a0" />
          <stop offset="80%" stopColor="#cdb890" />
          <stop offset="100%" stopColor="#bea878" />
        </linearGradient>
        {/* Top highlight for cylinder illusion */}
        <linearGradient id={highlightId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.25} />
          <stop offset="40%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Wire lead left — bends into body */}
      <path
        d={`M ${pinA.x} ${centerY} L ${bodyL - 1} ${centerY}`}
        stroke="#a0a0a0"
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Left lead entry kink */}
      <path
        d={`M ${bodyL - 1} ${centerY} L ${bodyL + 1} ${centerY}`}
        stroke="#b0b0b0"
        strokeWidth={1.8}
        strokeLinecap="butt"
        fill="none"
      />

      {/* Wire lead right — bends into body */}
      <path
        d={`M ${bodyR + 1} ${centerY} L ${pinB.x} ${centerY}`}
        stroke="#a0a0a0"
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Right lead entry */}
      <path
        d={`M ${bodyR - 1} ${centerY} L ${bodyR + 1} ${centerY}`}
        stroke="#b0b0b0"
        strokeWidth={1.8}
        strokeLinecap="butt"
        fill="none"
      />

      {/* Body shadow */}
      <path
        d={bodyPath}
        fill="#00000020"
        transform={`translate(0.8, 1)`}
      />

      {/* Body — rounded pill shape */}
      <path
        d={bodyPath}
        fill={`url(#${gradientId})`}
        stroke={isSelected ? "#3b82f6" : "#b0a080"}
        strokeWidth={isSelected ? 1.5 : 0.6}
      />

      {/* Top highlight overlay */}
      <path
        d={bodyPath}
        fill={`url(#${highlightId})`}
      />

      {/* Color bands — curved to follow body */}
      <g opacity={electricalState?.isActive === false ? 0.7 : 1}>
        {bands.map((color, i) => {
          const bandSpacing = bodyW / (bands.length + 1);
          const bx = bodyL + bandSpacing * (i + 1);
          // Tolerance band (last) is thinner with a gap
          const bw = i === bands.length - 1 ? 2 : 2.5;
          const gap = i === bands.length - 1 ? 1 : 0;
          return (
            <rect
              key={i}
              x={bx - bw / 2 + gap}
              y={centerY - halfH + 1.5}
              width={bw}
              height={bodyH - 3}
              fill={color}
              rx={0.3}
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
        y={centerY + halfH + 10}
        textAnchor="middle"
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name} ({resistance >= 1000 ? `${resistance / 1000}k` : resistance}&#937;)
      </text>

      {/* Current flow indicator */}
      {electricalState?.isActive && electricalState.current > 0.01 && (
        <text
          x={centerX}
          y={centerY - halfH - 5}
          textAnchor="middle"
          fontSize={ANNOTATION_FONT_SIZE}
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
