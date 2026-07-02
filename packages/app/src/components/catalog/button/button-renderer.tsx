import React, { useCallback, useMemo } from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { pinStateStore } from "@/simulator/pin-state-store";
import { buttonPressStore, useButtonPressed } from "@/simulator/button-press-store";
import { usePinState } from "@/simulator/use-pin-state";
import { useBoardSelector } from "@/store/board-context";
import { analyzeButtonWiring } from "@/breadboard/component-pin-resolver";
import { PinLabel } from "@/breadboard/component-renderers/pin-label";

type ButtonRendererProps = {
  component: BoardComponent;
  // pinStates kept as a prop for API compatibility but the button
  // subscribes directly to its own pin via usePinState().
  pinStates?: PinState[];
  isSelected: boolean;
};

function ButtonRendererInner({ component, isSelected }: ButtonRendererProps) {
  const wires = useBoardSelector((s) => s.wires);
  const wiring = useMemo(
    () => analyzeButtonWiring(component, wires),
    [component, wires],
  );
  const inputPin = wiring.inputPin;
  const inputPinState = usePinState(inputPin ?? -1);
  const physicallyPressed = useButtonPressed(component.id);
  // For INPUT_PULLUP: pressed = pin pulled LOW (0). For INPUT: pressed = HIGH (1).
  const isPullup = inputPinState?.mode === "INPUT_PULLUP";
  const pressedValue: 0 | 1 = isPullup ? 0 : 1;
  const releasedValue: 0 | 1 = isPullup ? 1 : 0;
  const canDrivePress =
    inputPin != null &&
    !wiring.hasSignalOnBothSides &&
    ((isPullup && wiring.hasGroundReference) || (!isPullup && inputPinState?.mode === "INPUT" && wiring.hasPowerReference));
  const isPressed = physicallyPressed;

  // Button spans center gap: pins at (row, col=3), (row+1, col=3) left side
  // and (row, col=6), (row+1, col=6) right side
  const topLeft = gridToPixel({ row: component.y, col: 3 });
  const bottomLeft = gridToPixel({ row: component.y + 1, col: 3 });
  const topRight = gridToPixel({ row: component.y, col: 6 });
  const bottomRight = gridToPixel({ row: component.y + 1, col: 6 });

  const centerX = (topLeft.x + topRight.x) / 2;
  const centerY = (topLeft.y + bottomLeft.y) / 2;
  const bodyWidth = topRight.x - topLeft.x + 8;
  const bodyHeight = bottomLeft.y - topLeft.y + 8;
  const capR = Math.min(bodyWidth, bodyHeight) * 0.26;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    buttonPressStore.press(component.id);
    if (canDrivePress && inputPin != null) {
      pinStateStore.writeExternal(inputPin, { digitalValue: pressedValue });
    }
  }, [canDrivePress, component.id, inputPin, pressedValue]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    buttonPressStore.release(component.id);
    // Always restore the released state when we know which input this button targets.
    // This clears stale externally-driven values if wiring changed while pressed.
    if (inputPin != null) {
      pinStateStore.writeExternal(inputPin, { digitalValue: releasedValue });
    }
  }, [component.id, inputPin, releasedValue]);

  const pins = [topLeft, bottomLeft, topRight, bottomRight];
  const bodyL = centerX - bodyWidth / 2;
  const bodyT = centerY - bodyHeight / 2;

  const housingGradId = `btn-body-${component.id}`;
  const capGradId = `btn-cap-${component.id}`;
  const capSink = isPressed ? 1 : 0;

  // Attach pointer handlers to the whole group so any click on the button
  // triggers press — not just the small cap circle.
  return (
    <g
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ cursor: "pointer" }}
    >
      <defs>
        {/* Housing gradient — dark plastic 3D */}
        <linearGradient id={housingGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a3a" />
          <stop offset="50%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </linearGradient>
        {/* Cap gradient — metallic button top */}
        <radialGradient id={capGradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={isPressed ? "#777" : "#999"} />
          <stop offset="60%" stopColor={isPressed ? "#555" : "#777"} />
          <stop offset="100%" stopColor={isPressed ? "#444" : "#555"} />
        </radialGradient>
      </defs>

      {/* Pin legs — L-shaped leads from holes to body */}
      {pins.map((pin, i) => {
        const isLeft = i < 2;
        const bodyEdge = isLeft ? bodyL + 2 : bodyL + bodyWidth - 2;
        return (
          <g key={i}>
            {/* Horizontal lead from hole to body edge */}
            <line
              x1={pin.x}
              y1={pin.y}
              x2={bodyEdge}
              y2={pin.y}
              stroke="#b0b0b0"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            {/* Small solder pad at body entry */}
            <rect
              x={bodyEdge - 1}
              y={pin.y - 1}
              width={2}
              height={2}
              rx={0.3}
              fill="#c0c0c0"
            />
            {/* Pin hole indicator */}
            <circle cx={pin.x} cy={pin.y} r={1.8} fill="#a0a0a0" opacity={0.5} />
          </g>
        );
      })}

      {/* Body shadow */}
      <rect
        x={bodyL + 1}
        y={bodyT + 1}
        width={bodyWidth}
        height={bodyHeight}
        rx={2}
        fill="#00000030"
      />

      {/* Housing body — black plastic */}
      <rect
        x={bodyL}
        y={bodyT}
        width={bodyWidth}
        height={bodyHeight}
        rx={2.5}
        fill={`url(#${housingGradId})`}
        stroke={isSelected ? "#3b82f6" : "#444"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Recessed well for the cap */}
      <rect
        x={centerX - capR - 2}
        y={centerY - capR - 2}
        width={(capR + 2) * 2}
        height={(capR + 2) * 2}
        rx={2}
        fill="#141414"
        stroke="#333"
        strokeWidth={0.5}
      />

      {/* Corner pin markings (small triangles in corners of housing) */}
      {[
        [bodyL + 3, bodyT + 3],
        [bodyL + 3, bodyT + bodyHeight - 3],
        [bodyL + bodyWidth - 3, bodyT + 3],
        [bodyL + bodyWidth - 3, bodyT + bodyHeight - 3],
      ].map(([mx, my], i) => (
        <circle key={`mark-${i}`} cx={mx} cy={my} r={1} fill="#444" />
      ))}

      {/* Cap drop shadow — the cap sits proud of the well; the shadow
          tightens as it sinks, which is what actually reads as "pressed" */}
      <ellipse
        cx={centerX + 0.4}
        cy={centerY + capSink + 1}
        rx={capR}
        ry={capR * 0.92}
        fill="#000000"
        opacity={isPressed ? 0.18 : 0.4}
        pointerEvents="none"
      />

      {/* Button cap — circular, depresses on press */}
      <circle
        cx={centerX}
        cy={centerY + capSink}
        r={capR - capSink * 0.5}
        fill={`url(#${capGradId})`}
        stroke="#333"
        strokeWidth={0.8}
      />

      {/* Cap highlight — specular reflection, dims and follows the cap down */}
      <ellipse
        cx={centerX - capR * 0.15}
        cy={centerY - capR * 0.2 + capSink}
        rx={capR * 0.35}
        ry={capR * 0.25}
        fill="#ffffff"
        opacity={isPressed ? 0.06 : 0.15}
        pointerEvents="none"
      />

      {/* Cap edge ring */}
      <circle
        cx={centerX}
        cy={centerY + capSink}
        r={capR - 1.5 - capSink * 0.5}
        fill="none"
        stroke="#4a4a4a"
        strokeWidth={0.4}
        pointerEvents="none"
      />

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
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  );
}

export const ButtonRenderer = React.memo(ButtonRendererInner);
