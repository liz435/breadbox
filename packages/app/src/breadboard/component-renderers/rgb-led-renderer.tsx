import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LED_DOME_RADIUS, LEG_WIDTH, LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { PinLabel } from "./pin-label";

// ── RGB LED renderer ──────────────────────────────────────────────────────
//
// Mixes the red, green, and blue channel PWM values directly off the pin
// states to produce a composite dome color. Bypasses the SPICE electrical
// state because the circuit solver only models the LED as a single element —
// per-channel brightness has to come from the pins the user actually wired.

type RgbLedProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function channelBrightness(pin: number | null | undefined, pinStates: PinState[]): number {
  if (pin == null) return 0;
  const state = pinStates[pin];
  if (!state) return 0;
  if (state.isPwm) return state.pwmValue / 255;
  return state.digitalValue;
}

function RgbLedRendererInner({ component, pinStates, isSelected }: RgbLedProps) {
  const rBright = channelBrightness(component.pins.red, pinStates);
  const gBright = channelBrightness(component.pins.green, pinStates);
  const bBright = channelBrightness(component.pins.blue, pinStates);

  const isOn = rBright > 0.02 || gBright > 0.02 || bBright > 0.02;
  const maxChannel = Math.max(rBright, gBright, bBright);

  // Synthesize the dome color from the three channels. We scale each channel
  // proportionally so the dome colour matches the intended hue even at low
  // brightness, but dim the alpha/glow based on the max channel.
  const red = Math.round(rBright * 255);
  const green = Math.round(gBright * 255);
  const blue = Math.round(bBright * 255);
  const dimRed = Math.round(rBright * 150 + 40);
  const dimGreen = Math.round(gBright * 150 + 40);
  const dimBlue = Math.round(bBright * 150 + 40);
  const litColor = `rgb(${red},${green},${blue})`;
  const midColor = isOn ? `rgb(${dimRed},${dimGreen},${dimBlue})` : "#4a4a4a";
  const darkColor = isOn
    ? `rgb(${Math.round(dimRed * 0.5)},${Math.round(dimGreen * 0.5)},${Math.round(dimBlue * 0.5)})`
    : "#2a2a2a";

  // RGB LED has 4 pins laid out vertically: red, green, blue, cathode
  const pR = gridToPixel({ row: component.y, col: component.x });
  const pG = gridToPixel({ row: component.y + 1, col: component.x });
  const pB = gridToPixel({ row: component.y + 2, col: component.x });
  const pK = gridToPixel({ row: component.y + 3, col: component.x });

  const cx = pR.x;
  const cy = (pR.y + pK.y) / 2;

  const R = LED_DOME_RADIUS + 1.5;
  const filterId = `rgb-led-glow-${component.id}`;
  const gradId = `rgb-led-grad-${component.id}`;
  const rimGradId = `rgb-led-rim-${component.id}`;
  const bodyGradId = `rgb-led-body-${component.id}`;
  const glowBlur = 2 + maxChannel * 10;
  const haloR = R + 2 + maxChannel * 8;
  const haloMaxR = haloR + 3 + maxChannel * 6;
  const haloOpacity = 0.15 + maxChannel * 0.45;

  // Dome geometry: bullet profile (rounded top, straight walls, flat bottom)
  const domeTop = cy - R - 1;
  const domeBottom = cy + R;
  const flangeY = domeBottom;
  const flangeH = 2.8;

  const domePath = [
    `M ${cx - R} ${flangeY}`,
    `L ${cx - R} ${cy - R * 0.3}`,
    `C ${cx - R} ${domeTop}, ${cx - R * 0.4} ${domeTop - 2}, ${cx} ${domeTop - 2}`,
    `C ${cx + R * 0.4} ${domeTop - 2}, ${cx + R} ${domeTop}, ${cx + R} ${cy - R * 0.3}`,
    `L ${cx + R} ${flangeY}`,
    `Z`,
  ].join(" ");

  return (
    <g>
      <defs>
        {/* Main dome gradient — 3D translucent epoxy with colour-shifting core */}
        <radialGradient id={gradId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={isOn ? 0.4 + maxChannel * 0.5 : 0.12} />
          <stop offset="25%" stopColor={isOn ? litColor : midColor} stopOpacity={isOn ? 0.95 : 0.85} />
          <stop offset="70%" stopColor={midColor} stopOpacity={0.9} />
          <stop offset="100%" stopColor={darkColor} stopOpacity={1} />
        </radialGradient>
        {/* Rim gradient — gives the dome edge a glassy depth */}
        <linearGradient id={rimGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={darkColor} stopOpacity={0.95} />
          <stop offset="50%" stopColor={midColor} stopOpacity={0.5} />
          <stop offset="100%" stopColor={darkColor} stopOpacity={0.95} />
        </linearGradient>
        {/* Flange (base) gradient */}
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isOn ? darkColor : "#555"} />
          <stop offset="100%" stopColor={isOn ? `rgb(${Math.round(dimRed * 0.3)},${Math.round(dimGreen * 0.3)},${Math.round(dimBlue * 0.3)})` : "#333"} />
        </linearGradient>
        {isOn && (
          <filter id={filterId} x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation={glowBlur} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Legs */}
      <line x1={pR.x} y1={pR.y} x2={pR.x - 3.5} y2={cy + R + 3.5} stroke="#c0c0c0" strokeWidth={LEG_WIDTH} strokeLinecap="round" />
      <line x1={pG.x} y1={pG.y} x2={pG.x - 1.2} y2={cy + R + 3.5} stroke="#c0c0c0" strokeWidth={LEG_WIDTH} strokeLinecap="round" />
      <line x1={pB.x} y1={pB.y} x2={pB.x + 1.2} y2={cy + R + 3.5} stroke="#c0c0c0" strokeWidth={LEG_WIDTH} strokeLinecap="round" />
      <line x1={pK.x} y1={pK.y} x2={pK.x + 3.5} y2={cy + R + 3.5} stroke="#c0c0c0" strokeWidth={LEG_WIDTH} strokeLinecap="round" />

      {/* Big outer halo */}
      {isOn && (
        <>
          <ellipse cx={cx} cy={cy - 1} rx={haloMaxR} ry={haloMaxR * 1.05}
            fill={litColor} opacity={haloOpacity * 0.35}>
            <animate attributeName="opacity" values={`${haloOpacity * 0.2};${haloOpacity * 0.45};${haloOpacity * 0.2}`} dur="2s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={cx} cy={cy - 1} rx={haloR} ry={haloR * 1.05}
            fill={litColor} opacity={haloOpacity}>
            <animate attributeName="rx" values={`${haloR};${haloR + 3};${haloR}`} dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values={`${haloOpacity * 0.6};${haloOpacity};${haloOpacity * 0.6}`} dur="1.6s" repeatCount="indefinite" />
          </ellipse>
        </>
      )}

      {/* Light rays when bright */}
      {isOn && maxChannel > 0.4 && (
        <g opacity={maxChannel * 0.45}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const innerR = R + 2;
            const outerR = R + 8 + maxChannel * 6;
            return (
              <line
                key={i}
                x1={cx + Math.cos(rad) * innerR}
                y1={cy + Math.sin(rad) * innerR}
                x2={cx + Math.cos(rad) * outerR}
                y2={cy + Math.sin(rad) * outerR}
                stroke={litColor}
                strokeWidth={0.8}
                strokeLinecap="round"
              >
                <animate attributeName="opacity" values="0.2;0.8;0.2" dur={`${1.5 + i * 0.1}s`} repeatCount="indefinite" />
              </line>
            );
          })}
        </g>
      )}

      {/* Dome with glow filter */}
      <g filter={isOn ? `url(#${filterId})` : undefined}>
        {/* Dome body */}
        <path d={domePath}
          fill={`url(#${gradId})`}
          stroke={isSelected ? "#3b82f6" : isOn ? darkColor : "#666"}
          strokeWidth={isSelected ? 1.5 : 0.6} />

        {/* Rim overlay for glass depth effect */}
        <path d={domePath} fill={`url(#${rimGradId})`} opacity={0.25} />

        {/* The three LED dies inside the dome — offset from center for realism */}
        {(() => {
          const dieR = R * 0.22;
          const dyeOffset = R * 0.25;
          return (
            <g opacity={isOn ? 0.95 : 0.5}>
              {/* Red die (top-left) */}
              <circle cx={cx - dyeOffset} cy={cy - dyeOffset * 0.3}
                r={dieR}
                fill={rBright > 0.02 ? `rgb(255,${Math.round(rBright * 60)},${Math.round(rBright * 60)})` : "#3a0a0a"} />
              {/* Green die (top-right) */}
              <circle cx={cx + dyeOffset} cy={cy - dyeOffset * 0.3}
                r={dieR}
                fill={gBright > 0.02 ? `rgb(${Math.round(gBright * 60)},255,${Math.round(gBright * 60)})` : "#0a3a0a"} />
              {/* Blue die (bottom-center) */}
              <circle cx={cx} cy={cy + dyeOffset * 0.7}
                r={dieR}
                fill={bBright > 0.02 ? `rgb(${Math.round(bBright * 60)},${Math.round(bBright * 60)},255)` : "#0a0a3a"} />
            </g>
          );
        })()}

        {/* Epoxy specular highlight — bright hotspot near top-left */}
        <ellipse
          cx={cx - R * 0.35}
          cy={cy - R * 0.55}
          rx={R * 0.35}
          ry={R * 0.22}
          fill="#ffffff"
          opacity={isOn ? 0.35 + maxChannel * 0.3 : 0.12}
        />
        {/* Secondary smaller highlight */}
        <ellipse
          cx={cx + R * 0.25}
          cy={cy - R * 0.6}
          rx={R * 0.12}
          ry={R * 0.08}
          fill="#ffffff"
          opacity={isOn ? 0.6 : 0.2}
        />
      </g>

      {/* Flange / rim at base — with 4 pin notches to hint at the leg spacing */}
      <rect
        x={cx - R - 0.8}
        y={flangeY}
        width={R * 2 + 1.6}
        height={flangeH}
        rx={0.6}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#555"}
        strokeWidth={0.5}
      />

      {/* Flat-side marker on flange for the cathode (longest pin on a real RGB LED) */}
      <rect
        x={cx + R * 0.55}
        y={flangeY}
        width={R * 0.45}
        height={flangeH}
        fill={isOn ? darkColor : "#2a2a2a"}
      />

      {/* Pin hole indicators — coloured to hint at channel mapping */}
      <circle cx={pR.x} cy={pR.y} r={2.3}
        fill={rBright > 0.02 ? "#ef4444" : "#7f1d1d"}
        stroke="#3f0f0f" strokeWidth={0.3} opacity={0.85} />
      <circle cx={pG.x} cy={pG.y} r={2.3}
        fill={gBright > 0.02 ? "#22c55e" : "#14532d"}
        stroke="#052e16" strokeWidth={0.3} opacity={0.85} />
      <circle cx={pB.x} cy={pB.y} r={2.3}
        fill={bBright > 0.02 ? "#3b82f6" : "#1e3a8a"}
        stroke="#0b1d54" strokeWidth={0.3} opacity={0.85} />
      <circle cx={pK.x} cy={pK.y} r={2.3} fill="#6b7280" stroke="#27272a" strokeWidth={0.3} opacity={0.85} />

      <PinLabel x={pR.x} y={pR.y} name="R" side="left" />
      <PinLabel x={pG.x} y={pG.y} name="G" side="left" />
      <PinLabel x={pB.x} y={pB.y} name="B" side="left" />
      <PinLabel x={pK.x} y={pK.y} name="K" side="left" />

      {/* Label */}
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
      {/* Live R,G,B readout */}
      {isOn && (
        <text
          x={cx + R + 4}
          y={cy + 7}
          textAnchor="start"
          fontSize={3.5}
          fill="#fbbf24"
          fontFamily="monospace"
        >
          {red},{green},{blue}
        </text>
      )}
    </g>
  );
}

export const RgbLedRenderer = React.memo(RgbLedRendererInner);
