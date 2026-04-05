import React from "react";
import {
  ARDUINO_BOARD_WIDTH,
  ARDUINO_BOARD_HEIGHT,
  ARDUINO_DIGITAL_PINS,
  ARDUINO_ANALOG_PINS,
  ARDUINO_POWER_PINS,
} from "@/breadboard/breadboard-grid";

const ARDUINO_X = 10;
const ARDUINO_Y = 20;
const PIN_HOLE_RADIUS = 3;

/**
 * Arduino Uno rendered as a fixed board to the left of the breadboard.
 * This is NOT a BoardComponent — it's rendered directly in the canvas.
 */
function ArduinoUnoBoardInner() {
  const x = ARDUINO_X;
  const y = ARDUINO_Y;
  const w = ARDUINO_BOARD_WIDTH;
  const h = ARDUINO_BOARD_HEIGHT;

  return (
    <g>
      {/* PCB shadow */}
      <rect
        x={x + 2}
        y={y + 2}
        width={w}
        height={h}
        rx={6}
        fill="#00000040"
      />

      {/* PCB body - dark teal */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill="#00796b"
        stroke="#004d40"
        strokeWidth={1.5}
      />

      {/* PCB texture overlay */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill="url(#pcb-texture)"
        opacity={0.1}
      />
      <defs>
        <pattern id="pcb-texture" width={4} height={4} patternUnits="userSpaceOnUse">
          <rect width={4} height={4} fill="none" />
          <circle cx={2} cy={2} r={0.3} fill="#ffffff" />
        </pattern>
      </defs>

      {/* USB port (top center) */}
      <rect
        x={x + w / 2 - 18}
        y={y - 4}
        width={36}
        height={16}
        rx={2}
        fill="#a0a0a0"
        stroke="#808080"
        strokeWidth={1}
      />
      <rect
        x={x + w / 2 - 14}
        y={y - 2}
        width={28}
        height={10}
        rx={1}
        fill="#d0d0d0"
      />

      {/* Power barrel jack (top-left) */}
      <rect
        x={x + 8}
        y={y - 2}
        width={20}
        height={12}
        rx={2}
        fill="#1a1a1a"
        stroke="#333"
        strokeWidth={1}
      />
      <circle cx={x + 18} cy={y + 4} r={3} fill="#333" stroke="#555" strokeWidth={0.5} />

      {/* ATmega328P chip (center) */}
      <rect
        x={x + w / 2 - 30}
        y={y + h / 2 - 15}
        width={60}
        height={30}
        rx={2}
        fill="#1a1a1a"
        stroke="#333"
        strokeWidth={0.5}
      />
      {/* Chip notch */}
      <circle
        cx={x + w / 2 - 25}
        cy={y + h / 2}
        r={3}
        fill="none"
        stroke="#444"
        strokeWidth={0.5}
      />
      {/* Chip label */}
      <text
        x={x + w / 2}
        y={y + h / 2 + 2}
        textAnchor="middle"
        fontSize={6}
        fill="#666"
        fontFamily="monospace"
      >
        ATmega328P
      </text>
      {/* Chip pins (decorative) */}
      {Array.from({ length: 14 }, (_, i) => (
        <React.Fragment key={`chip-pin-${i}`}>
          <rect
            x={x + w / 2 - 30 - 3}
            y={y + h / 2 - 13 + i * 2}
            width={3}
            height={1.2}
            fill="#a0a0a0"
          />
          <rect
            x={x + w / 2 + 30}
            y={y + h / 2 - 13 + i * 2}
            width={3}
            height={1.2}
            fill="#a0a0a0"
          />
        </React.Fragment>
      ))}

      {/* Board label */}
      <text
        x={x + w / 2}
        y={y + 28}
        textAnchor="middle"
        fontSize={14}
        fontWeight="bold"
        fill="#ffffff"
        fontFamily="sans-serif"
      >
        Arduino Uno
      </text>
      <text
        x={x + w / 2}
        y={y + 38}
        textAnchor="middle"
        fontSize={7}
        fill="#b2dfdb"
        fontFamily="monospace"
      >
        ATmega328P
      </text>

      {/* Power LED (green, near bottom-left) */}
      <circle
        cx={x + 50}
        cy={y + h - 20}
        r={2.5}
        fill="#4caf50"
        stroke="#2e7d32"
        strokeWidth={0.5}
      />
      <text
        x={x + 50}
        y={y + h - 12}
        textAnchor="middle"
        fontSize={4}
        fill="#b2dfdb"
      >
        PWR
      </text>

      {/* LED_BUILTIN indicator (near D13) */}
      <circle
        cx={x + w - 35}
        cy={y + 35}
        r={2}
        fill="#ff9800"
        stroke="#e65100"
        strokeWidth={0.5}
      />
      <text
        x={x + w - 35}
        y={y + 30}
        textAnchor="middle"
        fontSize={3.5}
        fill="#b2dfdb"
      >
        L
      </text>

      {/* Reset button */}
      <circle
        cx={x + w / 2 + 50}
        cy={y + 20}
        r={5}
        fill="#d32f2f"
        stroke="#b71c1c"
        strokeWidth={0.5}
      />
      <text
        x={x + w / 2 + 50}
        y={y + 30}
        textAnchor="middle"
        fontSize={4}
        fill="#b2dfdb"
      >
        RST
      </text>

      {/* Digital pin headers (right side) */}
      <text
        x={x + w - 8}
        y={y + 24}
        textAnchor="middle"
        fontSize={5}
        fill="#b2dfdb"
        fontWeight="bold"
      >
        DIGITAL
      </text>
      {ARDUINO_DIGITAL_PINS.map((pin) => (
        <g key={`dpin-${pin.pin}`}>
          <circle
            cx={pin.x}
            cy={pin.y}
            r={PIN_HOLE_RADIUS}
            fill="#1a1a1a"
            stroke="#ffd54f"
            strokeWidth={1}
          />
          <text
            x={pin.x - PIN_HOLE_RADIUS - 4}
            y={pin.y + 1.5}
            textAnchor="end"
            fontSize={5}
            fill="#e0f2f1"
            fontFamily="monospace"
          >
            {pin.label}
          </text>
        </g>
      ))}

      {/* Analog pin headers (left side, bottom) */}
      <text
        x={x + 8}
        y={y + h - 56}
        textAnchor="start"
        fontSize={5}
        fill="#b2dfdb"
        fontWeight="bold"
      >
        ANALOG
      </text>
      {ARDUINO_ANALOG_PINS.map((pin) => (
        <g key={`apin-${pin.pin}`}>
          <circle
            cx={pin.x}
            cy={pin.y}
            r={PIN_HOLE_RADIUS}
            fill="#1a1a1a"
            stroke="#81c784"
            strokeWidth={1}
          />
          <text
            x={pin.x + PIN_HOLE_RADIUS + 4}
            y={pin.y + 1.5}
            textAnchor="start"
            fontSize={5}
            fill="#e0f2f1"
            fontFamily="monospace"
          >
            {pin.label}
          </text>
        </g>
      ))}

      {/* Power pin headers (left side, top) */}
      <text
        x={x + 8}
        y={y + 24}
        textAnchor="start"
        fontSize={5}
        fill="#b2dfdb"
        fontWeight="bold"
      >
        POWER
      </text>
      {ARDUINO_POWER_PINS.map((pin, i) => (
        <g key={`ppin-${i}`}>
          <circle
            cx={pin.x}
            cy={pin.y}
            r={PIN_HOLE_RADIUS}
            fill="#1a1a1a"
            stroke={
              pin.label === "GND"
                ? "#42a5f5"
                : pin.label === "VIN"
                  ? "#ef5350"
                  : "#ef5350"
            }
            strokeWidth={1}
          />
          <text
            x={pin.x + PIN_HOLE_RADIUS + 4}
            y={pin.y + 1.5}
            textAnchor="start"
            fontSize={5}
            fill="#e0f2f1"
            fontFamily="monospace"
          >
            {pin.label}
          </text>
        </g>
      ))}
    </g>
  );
}

export const ArduinoUnoBoard = React.memo(ArduinoUnoBoardInner);

// Keep backward-compatible export for the component renderer map,
// though it should no longer be placed as a board component.
export const ArduinoUnoRenderer = ArduinoUnoBoard;
