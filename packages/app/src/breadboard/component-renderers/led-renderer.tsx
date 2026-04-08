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

/**
 * Parse a hex color into [r, g, b] 0-255.
 * Falls back to red if unparseable.
 */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [239, 68, 68];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Blend a color toward white by t (0 = original, 1 = white). */
function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Blend a color toward black by t (0 = original, 1 = black). */
function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - t));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function LedRendererInner({ component, pinStates, isSelected, electricalState }: LedRendererProps) {
  const color = (component.properties.color as string) ?? "#ef4444";

  // Prefer electrical state from circuit solver when available
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

  // Anode position (top leg)
  const anode = gridToPixel({ row: component.y, col: component.x });
  // Cathode position (bottom leg, one row down)
  const cathode = gridToPixel({ row: component.y + 1, col: component.x });

  const domeRadius = LED_DOME_RADIUS;
  const domeCenter = { x: anode.x, y: (anode.y + cathode.y) / 2 - 2 };
  const legWidth = LEG_WIDTH;
  const filterId = `led-glow-${component.id}`;
  const gradientId = `led-grad-${component.id}`;
  const reversePolarityFilterId = `led-reverse-${component.id}`;

  // ── Brightness-responsive visuals ──────────────────────────────────────

  // Dome fill: blends from dark grey (off) → saturated color → whitish (max brightness)
  const offColor = "#4a4a4a";
  const domeColor = isOn
    ? brightness > 0.7
      ? lighten(color, (brightness - 0.7) / 0.3 * 0.4)  // wash out toward white at high current
      : color
    : isReversed
      ? "#ef4444"
      : offColor;

  // Dome opacity: dim when off, fully opaque when on
  const domeOpacity = isOn ? 0.7 + brightness * 0.3 : 0.35;

  // Glow blur scales with brightness
  const glowBlur = 2 + brightness * 8;

  // Halo radius and opacity scale with brightness
  const haloBaseR = domeRadius + 2 + brightness * 6;
  const haloMaxR = haloBaseR + 2 + brightness * 8;
  const haloOpacity = 0.1 + brightness * 0.35;

  // Highlight specular spot intensity
  const specularOpacity = isOn ? 0.15 + brightness * 0.55 : 0.1;

  // Overcurrent indicator: LED gets a hot white center above 25 mA
  const isOverdriven = isOn && currentMa > 25;

  return (
    <g>
      <defs>
        {/* Dome gradient — brightness-responsive */}
        <radialGradient id={gradientId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={specularOpacity} />
          <stop offset="35%" stopColor={isOverdriven ? lighten(color, 0.6) : domeColor} stopOpacity={1} />
          <stop offset="100%" stopColor={isOn ? darken(color, 0.2) : (isReversed ? "#ef444488" : offColor)} stopOpacity={0.85} />
        </radialGradient>
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

      {/* Anode leg (longer) */}
      <line
        x1={anode.x - 1}
        y1={anode.y}
        x2={domeCenter.x - 1}
        y2={domeCenter.y + domeRadius - 1}
        stroke="#c0c0c0"
        strokeWidth={legWidth}
        strokeLinecap="round"
      />

      {/* Cathode leg (shorter, with flat mark) */}
      <line
        x1={cathode.x + 1}
        y1={cathode.y}
        x2={domeCenter.x + 1}
        y2={domeCenter.y + domeRadius - 1}
        stroke="#c0c0c0"
        strokeWidth={legWidth}
        strokeLinecap="round"
      />

      {/* LED dome */}
      <g filter={isOn ? `url(#${filterId})` : undefined} opacity={domeOpacity}>
        {/* Outer halo — scales with brightness */}
        {isOn && (
          <circle
            cx={domeCenter.x}
            cy={domeCenter.y}
            r={haloBaseR}
            fill={color}
            opacity={haloOpacity * 0.6}
          >
            <animate
              attributeName="r"
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
          </circle>
        )}

        {/* Inner glow ring — visible at medium+ brightness */}
        {isOn && brightness > 0.3 && (
          <circle
            cx={domeCenter.x}
            cy={domeCenter.y}
            r={domeRadius + 1 + brightness * 2}
            fill="none"
            stroke={lighten(color, 0.3)}
            strokeWidth={0.5 + brightness}
            opacity={brightness * 0.5}
          />
        )}

        {/* Dome body */}
        <ellipse
          cx={domeCenter.x}
          cy={domeCenter.y}
          rx={domeRadius}
          ry={domeRadius + 1}
          fill={`url(#${gradientId})`}
          stroke={isSelected ? "#3b82f6" : "#888"}
          strokeWidth={isSelected ? 1.5 : 0.8}
        />

        {/* Hot center spot when overdriven */}
        {isOverdriven && (
          <circle
            cx={domeCenter.x - 1}
            cy={domeCenter.y - 1}
            r={3}
            fill="#fff"
            opacity={0.3 + (currentMa - 25) / 50 * 0.4}
          />
        )}

        {/* Flat bottom edge (cathode indicator) */}
        <line
          x1={domeCenter.x - domeRadius + 1}
          y1={domeCenter.y + domeRadius}
          x2={domeCenter.x + domeRadius - 1}
          y2={domeCenter.y + domeRadius}
          stroke={isSelected ? "#3b82f6" : "#666"}
          strokeWidth={1.5}
        />
      </g>

      {/* Reverse polarity warning glow */}
      {isReversed && (
        <circle
          cx={domeCenter.x}
          cy={domeCenter.y}
          r={domeRadius + 5}
          fill="#ef4444"
          filter={`url(#${reversePolarityFilterId})`}
        >
          <animate
            attributeName="opacity"
            values="0.15;0.35;0.15"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Pin hole indicators */}
      <circle cx={anode.x} cy={anode.y} r={2} fill={color} opacity={0.5} />
      <circle cx={cathode.x} cy={cathode.y} r={2} fill={color} opacity={0.5} />

      {/* Pin labels */}
      <PinLabel x={anode.x} y={anode.y} name="anode" side="left" />
      <PinLabel x={cathode.x} y={cathode.y} name="cathode" side="left" />

      {/* Label + electrical readout */}
      <text
        x={domeCenter.x + domeRadius + 4}
        y={domeCenter.y - 1}
        textAnchor="start"
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
      {isOn && (
        <text
          x={domeCenter.x + domeRadius + 4}
          y={domeCenter.y + 7}
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
