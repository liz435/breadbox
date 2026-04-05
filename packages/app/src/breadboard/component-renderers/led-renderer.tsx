import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";

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

  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = 6;
  const filterId = `led-glow-${component.id}`;

  return (
    <g>
      {isOn && (
        <defs>
          <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={isOn ? color : `${color}44`}
        stroke={isSelected ? "#3b82f6" : "#555"}
        strokeWidth={isSelected ? 2 : 1}
        filter={isOn ? `url(#${filterId})` : undefined}
      />
      <text
        x={x}
        y={y + radius + 10}
        textAnchor="middle"
        fontSize={7}
        fill="#666"
      >
        {component.name}
      </text>
    </g>
  );
}

export const LedRenderer = React.memo(LedRendererInner);
