import React, { useCallback } from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { useBoard } from "@/store/board-context";

type ButtonRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function ButtonRendererInner({ component, pinStates, isSelected }: ButtonRendererProps) {
  const { send } = useBoard();
  const inputPin = component.pins.input;
  const isPressed =
    inputPin != null &&
    pinStates.some((ps) => ps.pin === inputPin && ps.digitalValue === 1);

  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const width = 14;
  const height = 14;
  const rx = 3;

  const handlePointerDown = useCallback(() => {
    if (inputPin != null) {
      send({ type: "SET_PIN_STATE", pin: inputPin, changes: { digitalValue: 1 } });
    }
  }, [inputPin, send]);

  const handlePointerUp = useCallback(() => {
    if (inputPin != null) {
      send({ type: "SET_PIN_STATE", pin: inputPin, changes: { digitalValue: 0 } });
    }
  }, [inputPin, send]);

  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={rx}
        fill={isPressed ? "#a3a3a3" : "#d4d4d4"}
        stroke={isSelected ? "#3b82f6" : "#737373"}
        strokeWidth={isSelected ? 2 : 1}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: "pointer" }}
      />
      <circle
        cx={x}
        cy={y}
        r={3}
        fill={isPressed ? "#525252" : "#737373"}
        pointerEvents="none"
      />
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

export const ButtonRenderer = React.memo(ButtonRendererInner);
