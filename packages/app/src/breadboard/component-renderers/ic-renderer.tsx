import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel, HOLE_SPACING, GAP_WIDTH } from "@/breadboard/breadboard-grid";

type IcRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
};

function IcRendererInner({ component, isSelected }: IcRendererProps) {
  const pinCount = (component.properties.pinCount as number) ?? 8;
  const label = (component.properties.label as string) ?? component.name;

  // IC straddles the center gap
  // Left pins on cols 2-4, right pins on cols 5-7
  const rowCount = pinCount / 2; // pins per side

  const topLeft = gridToPixel({ row: component.y, col: 2 });
  const topRight = gridToPixel({ row: component.y, col: 7 });
  const bottomLeft = gridToPixel({ row: component.y + rowCount - 1, col: 2 });

  const bodyX = topLeft.x - 2;
  const bodyY = topLeft.y - HOLE_SPACING / 2;
  const bodyWidth = topRight.x - topLeft.x + 4;
  const bodyHeight = (rowCount - 1) * HOLE_SPACING + HOLE_SPACING;

  const legWidth = 4;
  const legHeight = 1.5;

  return (
    <g>
      {/* IC body */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx={1}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#333"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Notch (semicircle) at pin 1 end */}
      <path
        d={`M ${bodyX + bodyWidth / 2 - 4} ${bodyY}
            A 4 4 0 0 1 ${bodyX + bodyWidth / 2 + 4} ${bodyY}`}
        fill="#2a2a2a"
        stroke="#444"
        strokeWidth={0.5}
      />

      {/* Pin 1 dot */}
      <circle
        cx={bodyX + 4}
        cy={bodyY + 5}
        r={1.5}
        fill="#666"
      />

      {/* Left-side legs (pins 1 to rowCount) */}
      {Array.from({ length: rowCount }, (_, i) => {
        const pos = gridToPixel({ row: component.y + i, col: 2 });
        return (
          <rect
            key={`lleg-${i}`}
            x={bodyX - legWidth}
            y={pos.y - legHeight / 2}
            width={legWidth}
            height={legHeight}
            fill="#a0a0a0"
            rx={0.3}
          />
        );
      })}

      {/* Right-side legs (pins rowCount+1 to pinCount) */}
      {Array.from({ length: rowCount }, (_, i) => {
        const pos = gridToPixel({ row: component.y + (rowCount - 1 - i), col: 7 });
        return (
          <rect
            key={`rleg-${i}`}
            x={bodyX + bodyWidth}
            y={pos.y - legHeight / 2}
            width={legWidth}
            height={legHeight}
            fill="#a0a0a0"
            rx={0.3}
          />
        );
      })}

      {/* Label text on body */}
      <text
        x={bodyX + bodyWidth / 2}
        y={bodyY + bodyHeight / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={5}
        fill="#aaa"
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
}

export const IcRenderer = React.memo(IcRendererInner);
