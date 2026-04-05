import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel, HOLE_SPACING } from "@/breadboard/breadboard-grid";

type LedRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function LedRendererInner({ component, pinStates, isSelected }: LedRendererProps) {
  const color = (component.properties.color as string) ?? "#ef4444";
  const anodePin = component.pins.anode;
  const isOn =
    anodePin != null &&
    pinStates.some(
      (ps) => ps.pin === anodePin && (ps.digitalValue === 1 || ps.pwmValue > 0)
    );

  // Anode position (top leg)
  const anode = gridToPixel({ row: component.y, col: component.x });
  // Cathode position (bottom leg, one row down)
  const cathode = gridToPixel({ row: component.y + 1, col: component.x });

  const domeRadius = 7;
  const domeCenter = { x: anode.x, y: (anode.y + cathode.y) / 2 - 2 };
  const legWidth = 1.2;
  const filterId = `led-glow-${component.id}`;
  const gradientId = `led-grad-${component.id}`;

  // Dim version of color for off state
  const offColor = `${color}55`;

  return (
    <g>
      <defs>
        {/* Dome gradient for 3D effect */}
        <radialGradient id={gradientId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={isOn ? 0.7 : 0.2} />
          <stop offset="40%" stopColor={isOn ? color : offColor} stopOpacity={1} />
          <stop offset="100%" stopColor={isOn ? color : offColor} stopOpacity={0.8} />
        </radialGradient>
        {isOn && (
          <filter id={filterId} x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Anode leg (longer) */}
      <line
        x1={anode.x - 1}
        y1={anode.y}
        x2={domeCenter.x - 1}
        y2={domeCenter.y + domeRadius - 1}
        stroke="#c0c0c0"
        strokeWidth={legWidth}
        strokeLinecap="round"
      />

      {/* Cathode leg (shorter, with flat mark) */}
      <line
        x1={cathode.x + 1}
        y1={cathode.y}
        x2={domeCenter.x + 1}
        y2={domeCenter.y + domeRadius - 1}
        stroke="#c0c0c0"
        strokeWidth={legWidth}
        strokeLinecap="round"
      />

      {/* LED dome (semicircle top + flat bottom) */}
      <g filter={isOn ? `url(#${filterId})` : undefined}>
        {/* Glow halo when on */}
        {isOn && (
          <circle
            cx={domeCenter.x}
            cy={domeCenter.y}
            r={domeRadius + 4}
            fill={color}
            opacity={0.2}
          />
        )}

        {/* Dome body */}
        <ellipse
          cx={domeCenter.x}
          cy={domeCenter.y}
          rx={domeRadius}
          ry={domeRadius + 1}
          fill={`url(#${gradientId})`}
          stroke={isSelected ? "#3b82f6" : "#888"}
          strokeWidth={isSelected ? 1.5 : 0.8}
        />

        {/* Flat bottom edge (cathode indicator) */}
        <line
          x1={domeCenter.x - domeRadius + 1}
          y1={domeCenter.y + domeRadius}
          x2={domeCenter.x + domeRadius - 1}
          y2={domeCenter.y + domeRadius}
          stroke={isSelected ? "#3b82f6" : "#666"}
          strokeWidth={1.5}
        />
      </g>

      {/* Pin hole indicators */}
      <circle cx={anode.x} cy={anode.y} r={2} fill={color} opacity={0.5} />
      <circle cx={cathode.x} cy={cathode.y} r={2} fill={color} opacity={0.5} />

      {/* Label */}
      <text
        x={domeCenter.x + domeRadius + 4}
        y={domeCenter.y + 2}
        textAnchor="start"
        fontSize={6}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  );
}

export const LedRenderer = React.memo(LedRendererInner);
