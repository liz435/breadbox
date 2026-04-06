import React, { useState, useCallback } from "react";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";
import type { PinState } from "@dreamer/schemas";

type ArduinoPinProps = {
  pin: ArduinoPinInfo;
  pinState?: PinState;
  isWiring: boolean;
  onStartWire: (pin: ArduinoPinInfo) => void;
};

const RADIUS_DEFAULT = 3.5;
const RADIUS_HOVER = 5;

function getPinStrokeColor(pin: ArduinoPinInfo): string {
  // GND pins
  if (pin.label === "GND") return "#42a5f5";
  // Power pins
  if (
    pin.label === "5V" ||
    pin.label === "3V3" ||
    pin.label === "3.3V" ||
    pin.label === "VIN"
  )
    return "#ef5350";
  // Non-voltage power pins
  if (pin.category === "power") return "#9e9e9e";
  // PWM digital
  if (pin.isPwm) return "#ff9800";
  // Analog
  if (pin.category === "analog") return "#81c784";
  // Regular digital
  return "#ffd54f";
}

function getPinTooltip(pin: ArduinoPinInfo): string {
  if (pin.isPwm) return `${pin.label} (PWM)`;
  if (pin.label.startsWith("A")) return `${pin.label} (Analog Input)`;
  if (pin.label === "GND") return "GND (Ground)";
  if (pin.label === "5V") return "5V Power";
  if (pin.label === "3V3" || pin.label === "3.3V") return "3.3V Power";
  if (pin.label === "VIN") return "VIN (Voltage Input)";
  if (pin.label === "AREF") return "AREF (Analog Reference)";
  if (pin.label === "IOREF") return "IOREF (I/O Reference)";
  if (pin.label === "RESET") return "RESET";
  return pin.label;
}

function ArduinoPinInner({ pin, pinState, isWiring, onStartWire }: ArduinoPinProps) {
  const [hovered, setHovered] = useState(false);

  const strokeColor = getPinStrokeColor(pin);
  const r = hovered ? RADIUS_HOVER : RADIUS_DEFAULT;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onStartWire(pin);
    },
    [onStartWire, pin],
  );

  // Determine simulation visual state
  const isOutput = pinState?.mode === "OUTPUT";
  const isHigh = pinState?.digitalValue === 1;
  const isPwmActive = pinState?.isPwm && (pinState?.pwmValue ?? 0) > 0;

  // Label position: top pins show label below, bottom pins show label above
  const isTopPin = pin.y < 100; // rough heuristic based on y position
  const labelY = isTopPin ? pin.y + 12 : pin.y - 8;

  return (
    <g
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      style={{ cursor: "crosshair" }}
    >
      {/* Hover tooltip background */}
      {hovered && (
        <g pointerEvents="none">
          <rect
            x={pin.x - 24}
            y={isTopPin ? pin.y + 16 : pin.y - 22}
            width={48}
            height={12}
            rx={2}
            fill="#1a1a1a"
            fillOpacity={0.9}
            stroke={strokeColor}
            strokeWidth={0.5}
          />
          <text
            x={pin.x}
            y={isTopPin ? pin.y + 24 : pin.y - 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={4.5}
            fill="#ffffff"
            fontFamily="monospace"
          >
            {getPinTooltip(pin)}
          </text>
        </g>
      )}

      {/* PWM pulsing glow */}
      {isPwmActive && (
        <circle cx={pin.x} cy={pin.y} r={RADIUS_HOVER + 2} fill="none" stroke="#ff9800" strokeWidth={1.5}>
          <animate
            attributeName="opacity"
            values="0.2;0.8;0.2"
            dur={`${Math.max(0.2, 1 - (pinState?.pwmValue ?? 0) / 255)}s`}
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Output HIGH glow */}
      {isOutput && isHigh && !isPwmActive && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={RADIUS_HOVER + 1}
          fill="#4caf50"
          fillOpacity={0.35}
          pointerEvents="none"
        />
      )}

      {/* Input HIGH indicator */}
      {pinState?.mode === "INPUT" && isHigh && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={RADIUS_HOVER + 1}
          fill="#ffd54f"
          fillOpacity={0.3}
          pointerEvents="none"
        />
      )}

      {/* Pin hole base */}
      <circle
        cx={pin.x}
        cy={pin.y}
        r={r}
        fill="#1a1a1a"
        stroke={hovered || isWiring ? "#ffffff" : strokeColor}
        strokeWidth={hovered ? 1.5 : 1}
        style={{ transition: "r 0.1s ease, stroke-width 0.1s ease" }}
      />

      {/* Output LOW dim overlay */}
      {isOutput && !isHigh && !isPwmActive && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={r - 1}
          fill="#333333"
          fillOpacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* Pin label */}
      <text
        x={pin.x}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={5}
        fill="#ffffff"
        fontFamily="monospace"
        pointerEvents="none"
      >
        {pin.label}
      </text>
    </g>
  );
}

export const ArduinoPin = React.memo(ArduinoPinInner);
