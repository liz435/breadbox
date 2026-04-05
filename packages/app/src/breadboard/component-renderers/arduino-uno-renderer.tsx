import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";

type ArduinoUnoRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

const DIGITAL_PINS = ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"];
const ANALOG_PINS = ["A0", "A1", "A2", "A3", "A4", "A5"];
const POWER_PINS = ["5V", "3.3V", "GND", "VIN"];

function ArduinoUnoRendererInner({ component, isSelected }: ArduinoUnoRendererProps) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const boardWidth = 120;
  const boardHeight = 70;
  const pinSpacing = 7;
  const pinRadius = 1.5;

  return (
    <g>
      {/* Board outline */}
      <rect
        x={x - boardWidth / 2}
        y={y - boardHeight / 2}
        width={boardWidth}
        height={boardHeight}
        rx={3}
        fill="#0066a2"
        stroke={isSelected ? "#3b82f6" : "#004c7a"}
        strokeWidth={isSelected ? 2 : 1}
      />
      {/* Board label */}
      <text
        x={x}
        y={y - 5}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill="#ffffff"
      >
        Arduino Uno
      </text>
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontSize={6}
        fill="#bfdbfe"
      >
        {component.name}
      </text>

      {/* Digital pin headers (top row) */}
      {DIGITAL_PINS.map((label, i) => {
        const px = x - boardWidth / 2 + 10 + i * pinSpacing;
        const py = y - boardHeight / 2 + 10;
        return (
          <g key={label}>
            <circle cx={px} cy={py} r={pinRadius} fill="#fbbf24" stroke="#92400e" strokeWidth={0.5} />
            <text x={px} y={py - 4} textAnchor="middle" fontSize={3.5} fill="#e0f2fe">
              {label}
            </text>
          </g>
        );
      })}

      {/* Analog pin headers (bottom-left) */}
      {ANALOG_PINS.map((label, i) => {
        const px = x - boardWidth / 2 + 10 + i * pinSpacing;
        const py = y + boardHeight / 2 - 10;
        return (
          <g key={label}>
            <circle cx={px} cy={py} r={pinRadius} fill="#4ade80" stroke="#166534" strokeWidth={0.5} />
            <text x={px} y={py + 8} textAnchor="middle" fontSize={3.5} fill="#e0f2fe">
              {label}
            </text>
          </g>
        );
      })}

      {/* Power pin headers (bottom-right) */}
      {POWER_PINS.map((label, i) => {
        const px = x + boardWidth / 2 - 10 - i * pinSpacing;
        const py = y + boardHeight / 2 - 10;
        return (
          <g key={label}>
            <circle cx={px} cy={py} r={pinRadius} fill="#f87171" stroke="#991b1b" strokeWidth={0.5} />
            <text x={px} y={py + 8} textAnchor="middle" fontSize={3.5} fill="#e0f2fe">
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export const ArduinoUnoRenderer = React.memo(ArduinoUnoRendererInner);
