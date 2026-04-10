import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { PinLabel } from "./pin-label";

type CapacitorRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
};

function CapacitorRendererInner({ component, isSelected, electricalState }: CapacitorRendererProps) {
  const isCeramic = component.properties.ceramic === true;

  // Pin A (top) and Pin B (bottom, 2 rows down)
  const pinA = gridToPixel({ row: component.y, col: component.x });
  const pinB = gridToPixel({ row: component.y + 2, col: component.x });
  const centerX = pinA.x;
  const centerY = (pinA.y + pinB.y) / 2;
  const gradientId = `cap-grad-${component.id}`;

  if (isCeramic) {
    // Ceramic disc capacitor
    const discWidth = 6;
    const discHeight = 4;

    return (
      <g>
        {/* Top leg */}
        <line
          x1={pinA.x}
          y1={pinA.y}
          x2={centerX}
          y2={centerY - discHeight / 2}
          stroke="#a0a0a0"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        {/* Bottom leg */}
        <line
          x1={pinB.x}
          y1={pinB.y}
          x2={centerX}
          y2={centerY + discHeight / 2}
          stroke="#a0a0a0"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        {/* Disc body */}
        <ellipse
          cx={centerX}
          cy={centerY}
          rx={discWidth}
          ry={discHeight}
          fill="#d97706"
          stroke={isSelected ? "#3b82f6" : "#b45309"}
          strokeWidth={isSelected ? 1.5 : 0.8}
        />
        {/* Label */}
        <text
          x={centerX + discWidth + 4}
          y={centerY + 2}
          textAnchor="start"
          fontSize={LABEL_FONT_SIZE}
          fill="#888"
          fontFamily="monospace"
        >
          {component.name}
        </text>
        {/* Pin labels */}
        <PinLabel x={pinA.x} y={pinA.y} name="positive" side="left" />
        <PinLabel x={pinB.x} y={pinB.y} name="negative" side="left" />
      </g>
    );
  }

  // Electrolytic capacitor (default)
  const bodyWidth = 8;
  const bodyHeight = 14;
  const bodyTopY = centerY - bodyHeight / 2;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="50%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
      </defs>

      {/* Top leg */}
      <line
        x1={pinA.x}
        y1={pinA.y}
        x2={centerX}
        y2={bodyTopY + bodyHeight}
        stroke="#a0a0a0"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {/* Bottom leg */}
      <line
        x1={pinB.x}
        y1={pinB.y}
        x2={centerX}
        y2={bodyTopY + bodyHeight}
        stroke="#a0a0a0"
        strokeWidth={1.2}
        strokeLinecap="round"
      />

      {/* Cylindrical body */}
      <rect
        x={centerX - bodyWidth / 2}
        y={bodyTopY}
        width={bodyWidth}
        height={bodyHeight}
        rx={1}
        ry={0}
        fill={`url(#${gradientId})`}
        stroke={isSelected ? "#3b82f6" : "#1e3a5f"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Rounded top cap */}
      <ellipse
        cx={centerX}
        cy={bodyTopY}
        rx={bodyWidth / 2}
        ry={2}
        fill="#2563eb"
        stroke={isSelected ? "#3b82f6" : "#1e3a5f"}
        strokeWidth={0.5}
      />

      {/* Negative stripe (silver band near bottom) */}
      <rect
        x={centerX - bodyWidth / 2}
        y={bodyTopY + bodyHeight - 4}
        width={bodyWidth}
        height={3}
        fill="#c0c0c0"
        opacity={0.6}
      />

      {/* "-" marking */}
      <text
        x={centerX - bodyWidth / 2 - 4}
        y={bodyTopY + bodyHeight - 1}
        textAnchor="middle"
        fontSize={5}
        fill="#888"
        fontWeight="bold"
        fontFamily="monospace"
      >
        -
      </text>

      {/* Pin hole indicators */}
      <circle cx={pinA.x} cy={pinA.y} r={2} fill="#3b82f6" opacity={0.5} />
      <circle cx={pinB.x} cy={pinB.y} r={2} fill="#3b82f6" opacity={0.5} />

      {/* Pin labels */}
      <PinLabel x={pinA.x} y={pinA.y} name="positive" side="left" />
      <PinLabel x={pinB.x} y={pinB.y} name="negative" side="left" />

      {/* Label */}
      <text
        x={centerX + bodyWidth / 2 + 4}
        y={centerY + 2}
        textAnchor="start"
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  );
}

export const CapacitorRenderer = React.memo(CapacitorRendererInner);
