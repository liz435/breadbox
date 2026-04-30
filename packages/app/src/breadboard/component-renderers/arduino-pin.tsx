import React, { useCallback } from "react";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";
import { usePinState } from "@/simulator/use-pin-state";

type ArduinoPinProps = {
  pin: ArduinoPinInfo;
  isWiring: boolean;
  onStartWire: (pin: ArduinoPinInfo) => void;
};

const RADIUS_DEFAULT = 3.5;

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

function ArduinoPinInner({ pin, isWiring, onStartWire }: ArduinoPinProps) {
  // Subscribe to only this pin's state via the PinStateStore.
  const pinState = usePinState(pin.pin);

  const strokeColor = getPinStrokeColor(pin);

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
  const pwmStrength = Math.max(0, Math.min(1, (pinState?.pwmValue ?? 0) / 255));

  const labelPos = (() => {
    switch (pin.labelSide) {
      case "left":
        return { x: pin.x - 9, y: pin.y, anchor: "end" as const };
      case "right":
        return { x: pin.x + 9, y: pin.y, anchor: "start" as const };
      case "top":
        return { x: pin.x, y: pin.y - 8, anchor: "middle" as const };
      case "bottom":
        return { x: pin.x, y: pin.y + 12, anchor: "middle" as const };
      default: {
        // Backward-compatible fallback for legacy pin maps.
        const isTopPin = pin.y < 100;
        return {
          x: pin.x,
          y: isTopPin ? pin.y + 12 : pin.y - 8,
          anchor: "middle" as const,
        };
      }
    }
  })();

  return (
    <g
      onPointerDown={handlePointerDown}
      className="arduino-pin"
      style={{ cursor: "crosshair" }}
    >
      {/* Native SVG tooltip — no useState needed */}
      <title>{getPinTooltip(pin)}</title>

      {/* Invisible hit area for easier hovering */}
      <circle cx={pin.x} cy={pin.y} r={8} fill="transparent" />

      {/* PWM indicator — stable intensity so duty-cycle changes don't read as jitter */}
      {isPwmActive && (
        <>
          <circle
            cx={pin.x}
            cy={pin.y}
            r={7.5}
            fill="#ff9800"
            fillOpacity={0.08 + pwmStrength * 0.12}
            pointerEvents="none"
          />
          <circle
            cx={pin.x}
            cy={pin.y}
            r={7.5}
            fill="none"
            stroke="#ff9800"
            strokeWidth={1.5}
            opacity={0.22 + pwmStrength * 0.38}
            pointerEvents="none"
          />
        </>
      )}

      {/* Output HIGH glow */}
      {isOutput && isHigh && !isPwmActive && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={6}
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
          r={6}
          fill="#ffd54f"
          fillOpacity={0.3}
          pointerEvents="none"
        />
      )}

      {/* Pin hole base — hover effect handled via CSS */}
      <circle
        cx={pin.x}
        cy={pin.y}
        r={RADIUS_DEFAULT}
        fill="#1a1a1a"
        stroke={isWiring ? "#ffffff" : strokeColor}
        strokeWidth={1.2}
        className="pin-hole"
      />

      {/* Output LOW dim overlay */}
      {isOutput && !isHigh && !isPwmActive && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={RADIUS_DEFAULT - 1}
          fill="#333333"
          fillOpacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* Pin label */}
      <text
        x={labelPos.x}
        y={labelPos.y}
        textAnchor={labelPos.anchor}
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
