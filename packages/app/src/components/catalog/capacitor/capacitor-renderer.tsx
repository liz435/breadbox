import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE, PX_PER_MM } from "@/breadboard/breadboard-constants";
import { PinLabel } from "@/breadboard/component-renderers/pin-label";

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

  // Electrolytic capacitor (default) — a real radial can, drawn top-down.
  const CAN_RADIUS = 3.15 * PX_PER_MM; // 6.3mm-dia aluminium can
  const leadInset = CAN_RADIUS * 0.34; // visible lead stub from each hole into the can
  const clipId = `cap-clip-${component.id}`;

  return (
    <g>
      <defs>
        {/* Can top — aluminium, lit from the upper-left */}
        <radialGradient id={gradientId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#3b5a86" />
          <stop offset="60%" stopColor="#22406b" />
          <stop offset="100%" stopColor="#152e4d" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx={centerX} cy={centerY} r={CAN_RADIUS} />
        </clipPath>
      </defs>

      {/* Can body */}
      <circle
        cx={centerX}
        cy={centerY}
        r={CAN_RADIUS}
        fill={`url(#${gradientId})`}
        stroke={isSelected ? "#3b82f6" : "#1e3a5f"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Negative stripe down the negative (bottom / pinB) side, with minus marks */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={centerX - CAN_RADIUS}
          y={centerY + CAN_RADIUS * 0.34}
          width={CAN_RADIUS * 2}
          height={CAN_RADIUS * 0.66}
          fill="#cdd8e6"
          opacity={0.9}
        />
        {[-0.42, 0, 0.42].map((f) => (
          <rect
            key={f}
            x={centerX + f * CAN_RADIUS - CAN_RADIUS * 0.11}
            y={centerY + CAN_RADIUS * 0.62}
            width={CAN_RADIUS * 0.22}
            height={CAN_RADIUS * 0.09}
            rx={0.4}
            fill="#1e3a5f"
          />
        ))}
      </g>

      {/* Pressure-relief vent cross scored into the top */}
      <g stroke="#16283f" strokeWidth={1} opacity={0.7} strokeLinecap="round">
        <line x1={centerX - CAN_RADIUS * 0.6} y1={centerY} x2={centerX + CAN_RADIUS * 0.6} y2={centerY} />
        <line x1={centerX} y1={centerY - CAN_RADIUS * 0.6} x2={centerX} y2={centerY + CAN_RADIUS * 0.6} />
      </g>

      {/* Specular highlight on the metal top */}
      <ellipse
        cx={centerX - CAN_RADIUS * 0.32}
        cy={centerY - CAN_RADIUS * 0.36}
        rx={CAN_RADIUS * 0.3}
        ry={CAN_RADIUS * 0.2}
        fill="#ffffff"
        opacity={0.25}
      />

      {/* Two leads — silver stubs from each hole toward the can body */}
      <line
        x1={pinA.x}
        y1={pinA.y}
        x2={centerX}
        y2={pinA.y + leadInset}
        stroke="#a0a0a0"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <line
        x1={pinB.x}
        y1={pinB.y}
        x2={centerX}
        y2={pinB.y - leadInset}
        stroke="#a0a0a0"
        strokeWidth={1.2}
        strokeLinecap="round"
      />

      {/* Pin hole indicators */}
      <circle cx={pinA.x} cy={pinA.y} r={2} fill="#3b82f6" opacity={0.5} />
      <circle cx={pinB.x} cy={pinB.y} r={2} fill="#3b82f6" opacity={0.5} />

      {/* Pin labels */}
      <PinLabel x={pinA.x} y={pinA.y} name="positive" side="left" />
      <PinLabel x={pinB.x} y={pinB.y} name="negative" side="left" />

      {/* Label */}
      <text
        x={centerX + CAN_RADIUS + 4}
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
