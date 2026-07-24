import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LED_DOME_RADIUS, LEG_WIDTH, LABEL_FONT_SIZE, ANNOTATION_FONT_SIZE, PX_PER_MM } from "@/breadboard/breadboard-constants";
import { REALISTIC_LED_LIGHTING_PILOT } from "@/breadboard/lighting-pilot";
import { PinLabel } from "@/breadboard/component-renderers/pin-label";

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

  const brightness = electricalState?.brightness ?? (isOn ? 1 : 0);
  const currentMa = electricalState?.current ?? 0;
  const voltage = electricalState?.voltage ?? 0;

  const anode = gridToPixel({ row: component.y, col: component.x });
  const cathode = gridToPixel({ row: component.y + 1, col: component.x });

  // Body dimensions at true board scale — a real 5mm through-hole LED.
  const R = LED_DOME_RADIUS; // 5mm epoxy dome (2.5mm radius), from breadboard-constants
  const FLANGE_RADIUS = 2.9 * PX_PER_MM; // 5.8mm-dia base flange ring
  const cx = anode.x;
  const cy = (anode.y + cathode.y) / 2 - 2;
  const legWidth = LEG_WIDTH;
  const filterId = `led-glow-${component.id}`;
  const gradientId = `led-grad-${component.id}`;
  const bodyGradId = `led-body-${component.id}`;
  const auraGradId = `led-aura-${component.id}`;
  const coreGradId = `led-core-${component.id}`;

  // Dome shape: bullet profile (rounded top, straight sides, flat bottom)
  // Centered at (cx, cy), radius R
  const domeTop = cy - R - 1;
  const domeBottom = cy + R;
  const flangeY = domeBottom;
  const flangeH = 0.9 * PX_PER_MM; // ~0.9mm plastic rim lip at the flange base

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
  // A reversed LED simply doesn't light — the dome looks off. The circuit
  // overlay's ReversePolarityGlow carries the diagnostic warning.
  const offColor = "#4a4a4a";
  const domeColor = isOn
    ? brightness > 0.7
      ? lighten(color, (brightness - 0.7) / 0.3 * 0.4)
      : color
    : offColor;

  const domeOpacity = isOn ? 0.7 + brightness * 0.3 : 0.35;
  const visualStrength = Math.max(0, Math.min(1, brightness));
  const perceptualStrength = Math.pow(visualStrength, REALISTIC_LED_LIGHTING_PILOT ? 0.72 : 1);
  const glowBlur = REALISTIC_LED_LIGHTING_PILOT ? 1.1 + perceptualStrength * 4.6 : 1.5 + visualStrength * 7.5;
  const haloBaseR = REALISTIC_LED_LIGHTING_PILOT ? R + 1.8 + perceptualStrength * 4.2 : R + 2 + visualStrength * 7;
  const haloMaxR = REALISTIC_LED_LIGHTING_PILOT ? haloBaseR + 0.8 + perceptualStrength * 3.6 : haloBaseR + 1.5 + visualStrength * 9;
  const haloOpacity = REALISTIC_LED_LIGHTING_PILOT ? 0.03 + perceptualStrength * 0.18 : 0.06 + visualStrength * 0.42;
  const ambientR = REALISTIC_LED_LIGHTING_PILOT ? R + 5 + perceptualStrength * 10 : R + 4 + visualStrength * 14;
  const ambientMaxR = REALISTIC_LED_LIGHTING_PILOT ? ambientR + 1.2 + perceptualStrength * 4 : ambientR + 2 + visualStrength * 10;
  const pulseDur = `${1.05 + (1 - visualStrength) * 1.55}s`;
  const coreR = REALISTIC_LED_LIGHTING_PILOT ? R * 0.35 + perceptualStrength * R * 0.22 : R * 0.48 + visualStrength * R * 0.42;
  const specularOpacity = isOn ? 0.15 + brightness * 0.55 : 0.1;
  const isOverdriven = isOn && currentMa > 25;
  const spillOpacity = REALISTIC_LED_LIGHTING_PILOT ? 0.035 + perceptualStrength * 0.11 : 0;
  const spillWidth = 6 + perceptualStrength * 5;
  const spillDepth = 10 + perceptualStrength * 8;

  return (
    <g>
      <defs>
        {/* Dome gradient — 3D translucent epoxy look */}
        <radialGradient id={gradientId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={specularOpacity} />
          <stop offset="30%" stopColor={isOverdriven ? lighten(color, 0.6) : domeColor} stopOpacity={0.95} />
          <stop offset="85%" stopColor={isOn ? darken(color, 0.25) : offColor} stopOpacity={0.9} />
          <stop offset="100%" stopColor={isOn ? darken(color, 0.4) : darken(offColor, 0.3)} stopOpacity={1} />
        </radialGradient>
        {/* Vertical body gradient for 3D cylinder effect */}
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={darken(domeColor, 0.15)} stopOpacity={0.9} />
          <stop offset="50%" stopColor={domeColor} stopOpacity={1} />
          <stop offset="100%" stopColor={darken(domeColor, 0.2)} stopOpacity={0.9} />
        </linearGradient>
        <radialGradient id={auraGradId} cx="50%" cy="48%" r="60%">
          <stop offset="0%" stopColor={lighten(color, 0.55)} stopOpacity={0.72} />
          <stop offset="42%" stopColor={color} stopOpacity={0.34} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={coreGradId} cx="42%" cy="34%" r="58%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="32%" stopColor={lighten(color, 0.68)} stopOpacity={0.8} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
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

      {/* Light field behind the epoxy: pilot mode keeps the emitter stable and moves the realism into bloom + spill. */}
      {isOn && (
        <g filter={`url(#${filterId})`} pointerEvents="none">
          {REALISTIC_LED_LIGHTING_PILOT ? (
            <>
              <ellipse
                cx={cx - 0.6}
                cy={cy - 1.2}
                rx={ambientR}
                ry={ambientR * 1.05}
                fill={`url(#${auraGradId})`}
                opacity={haloOpacity * 0.45}
              />
              <ellipse
                cx={cx - 0.4}
                cy={cy - 1}
                rx={haloBaseR}
                ry={haloBaseR * 1.02}
                fill={color}
                opacity={haloOpacity * 0.72}
              />
              <ellipse
                cx={cx - 0.2}
                cy={flangeY + flangeH + spillDepth * 0.38}
                rx={spillWidth}
                ry={spillDepth}
                fill={color}
                opacity={spillOpacity}
              />
              <path
                d={`M ${cx - 1.4} ${flangeY + flangeH} C ${cx - 4.2} ${flangeY + flangeH + 4}, ${cx - spillWidth * 0.62} ${flangeY + flangeH + spillDepth * 0.55}, ${cx - spillWidth * 0.28} ${flangeY + flangeH + spillDepth}`}
                fill="none"
                stroke={lighten(color, 0.18)}
                strokeWidth={1.2 + perceptualStrength * 0.85}
                strokeLinecap="round"
                opacity={spillOpacity * 0.7}
              />
              <path
                d={`M ${cx + 1.2} ${flangeY + flangeH + 1} C ${cx + 3.6} ${flangeY + flangeH + 5}, ${cx + spillWidth * 0.42} ${flangeY + flangeH + spillDepth * 0.5}, ${cx + spillWidth * 0.12} ${flangeY + flangeH + spillDepth * 0.92}`}
                fill="none"
                stroke={lighten(color, 0.08)}
                strokeWidth={0.9 + perceptualStrength * 0.55}
                strokeLinecap="round"
                opacity={spillOpacity * 0.42}
              />
            </>
          ) : (
            <>
              <ellipse
                cx={cx}
                cy={cy - 1}
                rx={ambientR}
                ry={ambientR * 1.15}
                fill={`url(#${auraGradId})`}
                opacity={haloOpacity * 0.55}
              >
                <animate
                  attributeName="rx"
                  values={`${ambientR};${ambientMaxR};${ambientR}`}
                  dur={pulseDur}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="ry"
                  values={`${ambientR * 1.1};${ambientMaxR * 1.18};${ambientR * 1.1}`}
                  dur={pulseDur}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values={`${haloOpacity * 0.22};${haloOpacity * 0.7};${haloOpacity * 0.22}`}
                  dur={pulseDur}
                  repeatCount="indefinite"
                />
              </ellipse>
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
                  dur={pulseDur}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="ry"
                  values={`${haloBaseR * 1.05};${haloMaxR * 1.14};${haloBaseR * 1.05}`}
                  dur={pulseDur}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values={`${haloOpacity * 0.25};${haloOpacity};${haloOpacity * 0.25}`}
                  dur={pulseDur}
                  repeatCount="indefinite"
                />
              </ellipse>
              {visualStrength > 0.58 && (
                <g opacity={(visualStrength - 0.58) * 1.2}>
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                    const rad = (angle * Math.PI) / 180;
                    const inner = R + 4;
                    const outer = R + 7 + visualStrength * 10;
                    return (
                      <line
                        key={angle}
                        x1={cx + Math.cos(rad) * inner}
                        y1={cy - 1 + Math.sin(rad) * inner}
                        x2={cx + Math.cos(rad) * outer}
                        y2={cy - 1 + Math.sin(rad) * outer}
                        stroke={lighten(color, 0.42)}
                        strokeWidth={0.55 + visualStrength * 0.55}
                        strokeLinecap="round"
                        opacity={0.38}
                      >
                        <animate attributeName="opacity" values="0.12;0.5;0.12" dur={pulseDur} repeatCount="indefinite" />
                      </line>
                    );
                  })}
                </g>
              )}
            </>
          )}
        </g>
      )}

      {/* LED dome */}
      <g opacity={domeOpacity}>

        {/* Inner glow ring */}
        {isOn && brightness > 0.3 && !REALISTIC_LED_LIGHTING_PILOT && (
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

        {isOn && (
          <circle
            cx={cx}
            cy={cy - R * 0.18}
            r={coreR}
            fill={`url(#${coreGradId})`}
            opacity={REALISTIC_LED_LIGHTING_PILOT ? 0.14 + perceptualStrength * 0.18 : 0.16 + visualStrength * 0.42}
            pointerEvents="none"
          >
            {!REALISTIC_LED_LIGHTING_PILOT && (
              <animate
                attributeName="opacity"
                values={`${0.1 + visualStrength * 0.2};${0.22 + visualStrength * 0.5};${0.1 + visualStrength * 0.2}`}
                dur={pulseDur}
                repeatCount="indefinite"
              />
            )}
          </circle>
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
          opacity={REALISTIC_LED_LIGHTING_PILOT ? (isOn ? 0.12 + perceptualStrength * 0.1 : 0.08) : (isOn ? 0.15 + brightness * 0.2 : 0.08)}
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

        {/* Flange / rim at base (the plastic lip) — 5.8mm dia, wider than the dome */}
        <rect
          x={cx - FLANGE_RADIUS}
          y={flangeY}
          width={FLANGE_RADIUS * 2}
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
