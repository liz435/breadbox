import React from "react";
import type { BoardComponent, PinState, Wire } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LED_DOME_RADIUS, LEG_WIDTH, LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver";
import { PinLabel } from "@/breadboard/component-renderers/pin-label";

// ── RGB LED renderer ──────────────────────────────────────────────────────
//
// Mixes the red, green, and blue channel PWM values directly off the pin
// states to produce a composite dome color. Bypasses the SPICE electrical
// state because the circuit solver only models the LED as a single element —
// per-channel brightness has to come from the pins the user actually wired.

type RgbLedProps = {
  component: BoardComponent;
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
};

function channelBrightness(pin: number | null | undefined, pinStates: PinState[]): number {
  if (pin == null) return 0;
  const state = pinStates[pin];
  if (!state) return 0;
  if (state.isPwm) return state.pwmValue / 255;
  return state.digitalValue;
}

function RgbLedRendererInner({ component, pinStates, wires, isSelected }: RgbLedProps) {
  const boardWires = wires ?? {};
  const redPin = findArduinoPinForComponentPin(component, "red", boardWires);
  const greenPin = findArduinoPinForComponentPin(component, "green", boardWires);
  const bluePin = findArduinoPinForComponentPin(component, "blue", boardWires);

  const rBright = channelBrightness(redPin, pinStates);
  const gBright = channelBrightness(greenPin, pinStates);
  const bBright = channelBrightness(bluePin, pinStates);

  const isOn = rBright > 0.02 || gBright > 0.02 || bBright > 0.02;
  const maxChannel = Math.max(rBright, gBright, bBright);

  // Hue/intensity split (same treatment as the NeoPixel renderer): the hue is
  // the channel mix normalized to full scale — a dim red still looks red, not
  // muddy maroon — while perceived luminance drives how strong the bloom is.
  const red = Math.round(rBright * 255);
  const green = Math.round(gBright * 255);
  const blue = Math.round(bBright * 255);
  const hueScale = maxChannel > 0 ? 1 / maxChannel : 0;
  const litColor = `rgb(${Math.round(rBright * hueScale * 255)},${Math.round(gBright * hueScale * 255)},${Math.round(bBright * hueScale * 255)})`;
  const luma = 0.2126 * rBright + 0.7152 * gBright + 0.0722 * bBright;
  const intensity = Math.pow(Math.min(1, luma), 0.45);
  const dimRed = Math.round(rBright * 150 + 40);
  const dimGreen = Math.round(gBright * 150 + 40);
  const dimBlue = Math.round(bBright * 150 + 40);
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
  // Bloom scales with perceived luminance — steady, like a real emitter.
  const glowBlur = 1.1 + intensity * 4.6;
  const haloR = R + 1.8 + intensity * 4.2;
  const ambientR = R + 5 + intensity * 10;
  const haloOpacity = 0.03 + intensity * 0.18;

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
          <stop offset="0%" stopColor="#ffffff" stopOpacity={isOn ? 0.25 + intensity * 0.45 : 0.12} />
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

      {/* Steady bloom — ambient wash plus a tighter halo, both scaled by
          perceived luminance. Real LEDs hold rock-steady light: no pulsing,
          no rays. */}
      {isOn && (
        <>
          <ellipse cx={cx} cy={cy - 1} rx={ambientR} ry={ambientR * 1.05}
            fill={litColor} opacity={haloOpacity * 0.45} />
          <ellipse cx={cx} cy={cy - 1} rx={haloR} ry={haloR * 1.02}
            fill={litColor} opacity={haloOpacity * 0.72} />
        </>
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
          opacity={isOn ? 0.2 + intensity * 0.25 : 0.12}
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
