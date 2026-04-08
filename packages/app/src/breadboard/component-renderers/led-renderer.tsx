import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LED_DOME_RADIUS, LEG_WIDTH, LABEL_FONT_SIZE, ANNOTATION_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { PinLabel } from "./pin-label";

type LedRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [239, 68, 68];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - t));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function LedRendererInner({ component, pinStates, isSelected, electricalState }: LedRendererProps) {
  const color = (component.properties.color as string) ?? "#ef4444";

  const isOn = electricalState
    ? electricalState.isActive
    : (() => {
        const anodePin = component.pins.anode;
        return (
          anodePin != null &&
          pinStates.some(
            (ps) => ps.pin === anodePin && (ps.digitalValue === 1 || ps.pwmValue > 0)
          )
        );
      })();

  const isReversed = electricalState?.isReversed ?? false;
  const brightness = electricalState?.brightness ?? (isOn ? 1 : 0);
  const currentMa = electricalState?.current ?? 0;
  const voltage = electricalState?.voltage ?? 0;

  const anode = gridToPixel({ row: component.y, col: component.x });
  const cathode = gridToPixel({ row: component.y + 1, col: component.x });

  const R = LED_DOME_RADIUS;
  const cx = anode.x;
  const cy = (anode.y + cathode.y) / 2 - 2;
  const legWidth = LEG_WIDTH;
  const filterId = `led-glow-${component.id}`;
  const gradientId = `led-grad-${component.id}`;
  const bodyGradId = `led-body-${component.id}`;
  const reversePolarityFilterId = `led-reverse-${component.id}`;

  // Dome shape: bullet profile (rounded top, straight sides, flat bottom)
  // Centered at (cx, cy), radius R
  const domeTop = cy - R - 1;
  const domeBottom = cy + R;
  const flangeY = domeBottom;
  const flangeH = 2.5;

  // Bullet dome path: flat bottom → straight sides → rounded top
  const domePath = [
    `M ${cx - R} ${flangeY}`,                              // bottom-left
    `L ${cx - R} ${cy - R * 0.3}`,                         // left wall
    `C ${cx - R} ${domeTop}, ${cx - R * 0.4} ${domeTop - 2}, ${cx} ${domeTop - 2}`, // top-left curve
    `C ${cx + R * 0.4} ${domeTop - 2}, ${cx + R} ${domeTop}, ${cx + R} ${cy - R * 0.3}`, // top-right curve
    `L ${cx + R} ${flangeY}`,                              // right wall
    `Z`,
  ].join(" ");

  // Brightness-responsive visuals
  const offColor = "#4a4a4a";
  const domeColor = isOn
    ? brightness > 0.7
      ? lighten(color, (brightness - 0.7) / 0.3 * 0.4)
      : color
    : isReversed
      ? "#ef4444"
      : offColor;

  const domeOpacity = isOn ? 0.7 + brightness * 0.3 : 0.35;
  const glowBlur = 2 + brightness * 8;
  const haloBaseR = R + 2 + brightness * 6;
  const haloMaxR = haloBaseR + 2 + brightness * 8;
  const haloOpacity = 0.1 + brightness * 0.35;
  const specularOpacity = isOn ? 0.15 + brightness * 0.55 : 0.1;
  const isOverdriven = isOn && currentMa > 25;

  return (
    <g>
      <defs>
        {/* Dome gradient — 3D translucent epoxy look */}
        <radialGradient id={gradientId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={specularOpacity} />
          <stop offset="30%" stopColor={isOverdriven ? lighten(color, 0.6) : domeColor} stopOpacity={0.95} />
          <stop offset="85%" stopColor={isOn ? darken(color, 0.25) : (isReversed ? "#ef444488" : offColor)} stopOpacity={0.9} />
          <stop offset="100%" stopColor={isOn ? darken(color, 0.4) : darken(offColor, 0.3)} stopOpacity={1} />
        </radialGradient>
        {/* Vertical body gradient for 3D cylinder effect */}
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={darken(domeColor, 0.15)} stopOpacity={0.9} />
          <stop offset="50%" stopColor={domeColor} stopOpacity={1} />
          <stop offset="100%" stopColor={darken(domeColor, 0.2)} stopOpacity={0.9} />
        </linearGradient>
        {isOn && (
          <filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={glowBlur} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        {isReversed && (
          <filter id={reversePolarityFilterId} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Anode leg (longer, slight offset left) — straight with small kink at base */}
      <path
        d={`M ${anode.x - 1.5} ${anode.y} L ${anode.x - 1.5} ${flangeY + flangeH + 1}`}
        stroke="#c0c0c0"
        strokeWidth={legWidth}
        strokeLinecap="round"
        fill="none"
      />

      {/* Cathode leg (shorter, offset right, with identification kink) */}
      <path
        d={`M ${cathode.x + 1.5} ${cathode.y} L ${cathode.x + 1.5} ${flangeY + flangeH + 3} L ${cathode.x + 2.5} ${flangeY + flangeH + 2} L ${cathode.x + 2.5} ${flangeY + flangeH + 1}`}
        stroke="#c0c0c0"
        strokeWidth={legWidth}
        strokeLinecap="round"
        fill="none"
      />

      {/* LED dome with glow filter */}
      <g filter={isOn ? `url(#${filterId})` : undefined} opacity={domeOpacity}>
        {/* Outer halo — scales with brightness */}
        {isOn && (
          <ellipse
            cx={cx}
            cy={cy - 1}
            rx={haloBaseR}
            ry={haloBaseR * 1.1}
            fill={color}
            opacity={haloOpacity * 0.6}
          >
            <animate
              attributeName="rx"
              values={`${haloBaseR};${haloMaxR};${haloBaseR}`}
              dur={1.5 + (1 - brightness) * 1.5 + "s"}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values={`${haloOpacity * 0.4};${haloOpacity};${haloOpacity * 0.4}`}
              dur={1.5 + (1 - brightness) * 1.5 + "s"}
              repeatCount="indefinite"
            />
          </ellipse>
        )}

        {/* Inner glow ring */}
        {isOn && brightness > 0.3 && (
          <ellipse
            cx={cx}
            cy={cy - 1}
            rx={R + 1 + brightness * 2}
            ry={R + 2 + brightness * 2}
            fill="none"
            stroke={lighten(color, 0.3)}
            strokeWidth={0.5 + brightness}
            opacity={brightness * 0.5}
          />
        )}

        {/* Dome body — bullet shape */}
        <path
          d={domePath}
          fill={`url(#${gradientId})`}
          stroke={isSelected ? "#3b82f6" : "#888"}
          strokeWidth={isSelected ? 1.5 : 0.6}
        />

        {/* Epoxy highlight — specular reflection on dome top */}
        <ellipse
          cx={cx - R * 0.2}
          cy={cy - R * 0.5}
          rx={R * 0.35}
          ry={R * 0.25}
          fill="#ffffff"
          opacity={isOn ? 0.15 + brightness * 0.2 : 0.08}
        />

        {/* Hot center spot when overdriven */}
        {isOverdriven && (
          <circle
            cx={cx}
            cy={cy - 2}
            r={3}
            fill="#fff"
            opacity={0.3 + (currentMa - 25) / 50 * 0.4}
          />
        )}

        {/* Flange / rim at base (the plastic lip) */}
        <rect
          x={cx - R - 0.5}
          y={flangeY}
          width={R * 2 + 1}
          height={flangeH}
          rx={0.5}
          fill={isOn ? darken(color, 0.3) : "#555"}
          stroke={isSelected ? "#3b82f6" : "#666"}
          strokeWidth={0.5}
        />

        {/* Cathode flat mark on rim */}
        <rect
          x={cx + R * 0.3}
          y={flangeY}
          width={R * 0.7 + 0.5}
          height={flangeH}
          fill={isOn ? darken(color, 0.45) : "#444"}
        />
      </g>

      {/* Reverse polarity warning glow */}
      {isReversed && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={R + 5}
          ry={R + 6}
          fill="#ef4444"
          filter={`url(#${reversePolarityFilterId})`}
        >
          <animate
            attributeName="opacity"
            values="0.15;0.35;0.15"
            dur="1s"
            repeatCount="indefinite"
          />
        </ellipse>
      )}

      {/* Pin hole indicators */}
      <circle cx={anode.x} cy={anode.y} r={2} fill={color} opacity={0.5} />
      <circle cx={cathode.x} cy={cathode.y} r={2} fill={color} opacity={0.5} />

      {/* Pin labels */}
      <PinLabel x={anode.x} y={anode.y} name="anode" side="left" />
      <PinLabel x={cathode.x} y={cathode.y} name="cathode" side="left" />

      {/* Label + electrical readout */}
      <text
        x={cx + R + 4}
        y={cy - 1}
        textAnchor="start"
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
      {isOn && (
        <text
          x={cx + R + 4}
          y={cy + 7}
          textAnchor="start"
          fontSize={ANNOTATION_FONT_SIZE}
          fill="#fbbf24"
          fontFamily="monospace"
        >
          {currentMa.toFixed(1)}mA {voltage.toFixed(1)}V
        </text>
      )}
    </g>
  );
}

export const LedRenderer = React.memo(LedRendererInner);
