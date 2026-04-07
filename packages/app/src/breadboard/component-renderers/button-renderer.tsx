import React, { useCallback } from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel, HOLE_SPACING, GAP_WIDTH, TERMINAL_WIDTH } from "@/breadboard/breadboard-grid";
import { useBoard } from "@/store/board-context";
import { PinLabel } from "./pin-label";

type ButtonRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function ButtonRendererInner({ component, pinStates, isSelected }: ButtonRendererProps) {
  const { send } = useBoard();
  const inputPin = component.pins.a ?? component.pins.input;
  const isPressed =
    inputPin != null &&
    pinStates.some((ps) => ps.pin === inputPin && ps.digitalValue === 1);

  // Button spans center gap in DIP layout:
  // Pins at (row, col=3), (row+1, col=3) on left side
  // Pins at (row, col=6), (row+1, col=6) on right side
  const topLeft = gridToPixel({ row: component.y, col: 3 });
  const bottomLeft = gridToPixel({ row: component.y + 1, col: 3 });
  const topRight = gridToPixel({ row: component.y, col: 6 });
  const bottomRight = gridToPixel({ row: component.y + 1, col: 6 });

  // Body center
  const centerX = (topLeft.x + topRight.x) / 2;
  const centerY = (topLeft.y + bottomLeft.y) / 2;
  const bodyWidth = topRight.x - topLeft.x + 8;
  const bodyHeight = bottomLeft.y - topLeft.y + 8;
  const buttonCapRadius = Math.min(bodyWidth, bodyHeight) * 0.28;

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

  const pins = [topLeft, bottomLeft, topRight, bottomRight];

  return (
    <g>
      {/* Pin legs */}
      {pins.map((pin, i) => (
        <g key={i}>
          {/* Pin wire going into the hole */}
          <line
            x1={pin.x}
            y1={pin.y}
            x2={pin.x + (i < 2 ? 4 : -4)}
            y2={pin.y}
            stroke="#a0a0a0"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          {/* Pin hole indicator */}
          <circle cx={pin.x} cy={pin.y} r={1.8} fill="#a0a0a0" opacity={0.5} />
        </g>
      ))}

      {/* Button body (black plastic housing) */}
      <rect
        x={centerX - bodyWidth / 2}
        y={centerY - bodyHeight / 2}
        width={bodyWidth}
        height={bodyHeight}
        rx={2}
        fill="#2a2a2a"
        stroke={isSelected ? "#3b82f6" : "#444"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Inner edge detail */}
      <rect
        x={centerX - bodyWidth / 2 + 2}
        y={centerY - bodyHeight / 2 + 2}
        width={bodyWidth - 4}
        height={bodyHeight - 4}
        rx={1}
        fill="none"
        stroke="#3a3a3a"
        strokeWidth={0.5}
      />

      {/* Button cap (circular, depresses on press) */}
      <circle
        cx={centerX}
        cy={centerY + (isPressed ? 1 : 0)}
        r={buttonCapRadius}
        fill={isPressed ? "#555" : "#666"}
        stroke="#444"
        strokeWidth={1}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: "pointer" }}
      />
      {/* Cap highlight */}
      {!isPressed && (
        <circle
          cx={centerX - buttonCapRadius * 0.2}
          cy={centerY - buttonCapRadius * 0.2}
          r={buttonCapRadius * 0.4}
          fill="#888"
          opacity={0.3}
          pointerEvents="none"
        />
      )}

      {/* Pin labels */}
      <PinLabel x={topLeft.x} y={topLeft.y} name="a" side="left" />
      <PinLabel x={bottomLeft.x} y={bottomLeft.y} name="a" side="left" />
      <PinLabel x={topRight.x} y={topRight.y} name="b" side="right" />
      <PinLabel x={bottomRight.x} y={bottomRight.y} name="b" side="right" />

      {/* Label */}
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

export const ButtonRenderer = React.memo(ButtonRendererInner);
