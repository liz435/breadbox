import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";

type GenericRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function GenericRendererInner({ component, isSelected }: GenericRendererProps) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const width = 28;
  const height = 16;

  // Prettify the type name for display
  const label = component.type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={2}
        fill="#e5e7eb"
        stroke={isSelected ? "#3b82f6" : "#9ca3af"}
        strokeWidth={isSelected ? 2 : 1}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={5}
        fill="#374151"
      >
        {label}
      </text>
      <text
        x={x}
        y={y + height / 2 + 10}
        textAnchor="middle"
        fontSize={7}
        fill="#666"
      >
        {component.name}
      </text>
    </g>
  );
}

export const GenericRenderer = React.memo(GenericRendererInner);
