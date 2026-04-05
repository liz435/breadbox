import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";

type ServoRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function ServoRendererInner({ component, isSelected }: ServoRendererProps) {
  const angle = (component.properties.angle as number) ?? 90;
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const bodyRadius = 12;
  const armLength = 10;

  // Convert angle to radians (0 = pointing up, clockwise)
  const rad = ((angle - 90) * Math.PI) / 180;
  const armX = x + Math.cos(rad) * armLength;
  const armY = y + Math.sin(rad) * armLength;

  return (
    <g>
      {/* Body */}
      <rect
        x={x - bodyRadius}
        y={y - bodyRadius}
        width={bodyRadius * 2}
        height={bodyRadius * 2}
        rx={2}
        fill="#3b82f6"
        stroke={isSelected ? "#3b82f6" : "#1e40af"}
        strokeWidth={isSelected ? 2 : 1}
        opacity={0.8}
      />
      {/* Center hub */}
      <circle cx={x} cy={y} r={4} fill="#dbeafe" stroke="#1e40af" strokeWidth={1} />
      {/* Arm */}
      <line
        x1={x}
        y1={y}
        x2={armX}
        y2={armY}
        stroke="#fbbf24"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Arm tip */}
      <circle cx={armX} cy={armY} r={2} fill="#fbbf24" />
      <text
        x={x}
        y={y + bodyRadius + 10}
        textAnchor="middle"
        fontSize={7}
        fill="#666"
      >
        {component.name}
      </text>
    </g>
  );
}

export const ServoRenderer = React.memo(ServoRendererInner);
