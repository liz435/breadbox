import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { PX_PER_MM } from "@/breadboard/breadboard-constants";

type IcRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
};

function IcRendererInner({ component, isSelected }: IcRendererProps) {
  const pinCount = (component.properties.pinCount as number) ?? 8;
  const label = (component.properties.label as string) ?? component.name;

  // IC straddles the center gap: left pins on col 2, right pins on col 7.
  const rowCount = pinCount / 2; // pins per side

  const topLeft = gridToPixel({ row: component.y, col: 2 });
  const topRight = gridToPixel({ row: component.y, col: 7 });
  const bottomLeft = gridToPixel({ row: component.y + rowCount - 1, col: 2 });

  // ── DIP-8 plastic body, drawn at true physical size (14px = 2.54mm pitch) ──
  const BODY_LEN = 9.3 * PX_PER_MM;   // body length along the pin rows (vertical)
  const BODY_WID = 6.35 * PX_PER_MM;  // body width across the gap (0.25" DIP)
  const LEG_THICK = 0.5 * PX_PER_MM;  // DIP lead width
  const NOTCH_R = 1.2 * PX_PER_MM;    // pin-1 orientation notch
  const PIN1_DOT_R = 0.7 * PX_PER_MM; // pin-1 marker dimple

  // Body straddles the gap centre (col-2/col-7 midpoint) and is centred on the pin span.
  const gapCenterX = (topLeft.x + topRight.x) / 2;
  const bodyCenterY = (topLeft.y + bottomLeft.y) / 2;
  const bodyX = gapCenterX - BODY_WID / 2;
  const bodyY = bodyCenterY - BODY_LEN / 2;
  const bodyWidth = BODY_WID;
  const bodyHeight = BODY_LEN;

  return (
    <g>
      {/* IC body */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx={1}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#333"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Notch (semicircle) at the pin-1 (top) end */}
      <path
        d={`M ${bodyX + bodyWidth / 2 - NOTCH_R} ${bodyY}
            A ${NOTCH_R} ${NOTCH_R} 0 0 1 ${bodyX + bodyWidth / 2 + NOTCH_R} ${bodyY}`}
        fill="#2a2a2a"
        stroke="#444"
        strokeWidth={0.5}
      />

      {/* Pin-1 dot */}
      <circle
        cx={bodyX + PIN1_DOT_R + 2}
        cy={bodyY + PIN1_DOT_R + 2}
        r={PIN1_DOT_R}
        fill="#666"
      />

      {/* Left-side legs — stubs from the body edge out to each col-2 hole */}
      {Array.from({ length: rowCount }, (_, i) => {
        const pos = gridToPixel({ row: component.y + i, col: 2 });
        return (
          <rect
            key={`lleg-${i}`}
            x={pos.x}
            y={pos.y - LEG_THICK / 2}
            width={bodyX - pos.x}
            height={LEG_THICK}
            fill="#a0a0a0"
            rx={0.3}
          />
        );
      })}

      {/* Right-side legs — stubs from the body edge out to each col-7 hole */}
      {Array.from({ length: rowCount }, (_, i) => {
        const pos = gridToPixel({ row: component.y + (rowCount - 1 - i), col: 7 });
        return (
          <rect
            key={`rleg-${i}`}
            x={bodyX + bodyWidth}
            y={pos.y - LEG_THICK / 2}
            width={pos.x - (bodyX + bodyWidth)}
            height={LEG_THICK}
            fill="#a0a0a0"
            rx={0.3}
          />
        );
      })}

      {/* Label — runs along the body length, as a DIP part number is printed */}
      <text
        x={gapCenterX}
        y={bodyCenterY}
        transform={`rotate(-90 ${gapCenterX} ${bodyCenterY})`}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={2 * PX_PER_MM}
        fill="#aaa"
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
}

export const IcRenderer = React.memo(IcRendererInner);
