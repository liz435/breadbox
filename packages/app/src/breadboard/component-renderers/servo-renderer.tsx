import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel, HOLE_SPACING } from "@/breadboard/breadboard-grid";

type ServoRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function ServoRendererInner({ component, isSelected }: ServoRendererProps) {
  const angle = (component.properties.angle as number) ?? 90;

  // Servo occupies 3 adjacent holes: signal, vcc, gnd
  const pinSignal = gridToPixel({ row: component.y, col: component.x });
  const pinVcc = gridToPixel({ row: component.y, col: component.x + 1 });
  const pinGnd = gridToPixel({ row: component.y, col: component.x + 2 });

  // Body dimensions
  const bodyWidth = 30;
  const bodyHeight = 22;
  const centerX = pinVcc.x;
  const centerY = pinVcc.y - bodyHeight / 2 - 8;

  // Horn rotation
  const rad = ((angle - 90) * Math.PI) / 180;
  const hornLength = 12;
  const hornX = centerX + Math.cos(rad) * hornLength;
  const hornY = centerY - 4 + Math.sin(rad) * hornLength;

  return (
    <g>
      {/* Cable wires from body down to pins */}
      <line
        x1={pinSignal.x}
        y1={pinSignal.y}
        x2={centerX - 8}
        y2={centerY + bodyHeight / 2}
        stroke="#ff9800"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={pinVcc.x}
        y1={pinVcc.y}
        x2={centerX}
        y2={centerY + bodyHeight / 2}
        stroke="#f44336"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={pinGnd.x}
        y1={pinGnd.y}
        x2={centerX + 8}
        y2={centerY + bodyHeight / 2}
        stroke="#795548"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Pin indicators */}
      <circle cx={pinSignal.x} cy={pinSignal.y} r={2} fill="#ff9800" opacity={0.6} />
      <circle cx={pinVcc.x} cy={pinVcc.y} r={2} fill="#f44336" opacity={0.6} />
      <circle cx={pinGnd.x} cy={pinGnd.y} r={2} fill="#795548" opacity={0.6} />

      {/* Body shadow */}
      <rect
        x={centerX - bodyWidth / 2 + 1}
        y={centerY - bodyHeight / 2 + 1}
        width={bodyWidth}
        height={bodyHeight}
        rx={3}
        fill="#00000030"
      />

      {/* Body (blue rectangular housing) */}
      <rect
        x={centerX - bodyWidth / 2}
        y={centerY - bodyHeight / 2}
        width={bodyWidth}
        height={bodyHeight}
        rx={3}
        fill="#1565c0"
        stroke={isSelected ? "#3b82f6" : "#0d47a1"}
        strokeWidth={isSelected ? 1.5 : 1}
      />

      {/* Body detail lines */}
      <line
        x1={centerX - bodyWidth / 2 + 3}
        y1={centerY - bodyHeight / 2 + 3}
        x2={centerX + bodyWidth / 2 - 3}
        y2={centerY - bodyHeight / 2 + 3}
        stroke="#1976d2"
        strokeWidth={0.5}
      />
      <line
        x1={centerX - bodyWidth / 2 + 3}
        y1={centerY + bodyHeight / 2 - 3}
        x2={centerX + bodyWidth / 2 - 3}
        y2={centerY + bodyHeight / 2 - 3}
        stroke="#0d47a1"
        strokeWidth={0.5}
      />

      {/* Servo shaft mount (white circle) */}
      <circle
        cx={centerX}
        cy={centerY - 4}
        r={6}
        fill="#e0e0e0"
        stroke="#bdbdbd"
        strokeWidth={0.8}
      />
      <circle
        cx={centerX}
        cy={centerY - 4}
        r={2}
        fill="#9e9e9e"
      />

      {/* Horn arm */}
      <line
        x1={centerX}
        y1={centerY - 4}
        x2={hornX}
        y2={hornY}
        stroke="#f5f5f5"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={hornX} cy={hornY} r={2} fill="#e0e0e0" stroke="#bdbdbd" strokeWidth={0.5} />

      {/* Body label */}
      <text
        x={centerX}
        y={centerY + 6}
        textAnchor="middle"
        fontSize={5}
        fill="#bbdefb"
        fontFamily="monospace"
      >
        SERVO
      </text>

      {/* Component name label */}
      <text
        x={centerX}
        y={centerY + bodyHeight / 2 + 10}
        textAnchor="middle"
        fontSize={6}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  );
}

export const ServoRenderer = React.memo(ServoRendererInner);
