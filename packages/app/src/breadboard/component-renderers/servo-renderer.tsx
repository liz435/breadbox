import React from "react";
import type { BoardComponent, PinState, LibraryState } from "@dreamer/schemas";
import { gridToPixel, HOLE_SPACING } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { useBoardSelector } from "@/store/board-context";
import { PinLabel } from "./pin-label";

type ServoRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  libraryState?: LibraryState;
};

function ServoRendererInner({ component, isSelected, libraryState }: ServoRendererProps) {
  const wires = useBoardSelector((s) => s.wires);

  // Find which Arduino pin connects to the servo's signal row via wire topology
  let connectedPin: number | null = component.pins.signal ?? null;
  if (connectedPin == null) {
    // Check wires: any Arduino pin wire (fromRow=-999) that lands on the signal row
    const signalRow = component.y;
    const signalCol = component.x;
    for (const w of Object.values(wires)) {
      if (w.fromRow === -999 && w.toRow === signalRow && w.toCol >= 0 && w.toCol <= 4 && signalCol >= 0 && signalCol <= 4) {
        connectedPin = w.fromCol;
        break;
      }
      if (w.fromRow === -999 && w.toRow === signalRow && w.toCol >= 5 && w.toCol <= 9 && signalCol >= 5 && signalCol <= 9) {
        connectedPin = w.fromCol;
        break;
      }
    }
  }

  let angle = (component.properties.angle as number) ?? 90;

  if (libraryState && connectedPin != null) {
    for (const entry of Object.values(libraryState.servos)) {
      if (entry.pin === connectedPin) {
        angle = entry.angle;
        break;
      }
    }
  }

  // The 3 footprint holes — these MUST match getComponentFootprint("servo", y, x)
  // Footprint: (y,x), (y+1,x), (y+2,x) — vertical
  const p0 = gridToPixel({ row: component.y, col: component.x });       // signal
  const p1 = gridToPixel({ row: component.y + 1, col: component.x });   // vcc
  const p2 = gridToPixel({ row: component.y + 2, col: component.x });   // gnd

  // Body: blue rectangle to the left of the 3 pin holes
  const bodyW = 26;
  const bodyH = (p2.y - p0.y) + 10;
  const bodyT = p0.y - 5;
  const bodyR = p0.x - 5;
  const bodyL = bodyR - bodyW;
  const cx = bodyL + bodyW / 2;
  const cy = p1.y;

  // Horn — compute endpoint with trig (no CSS transform needed)
  const hornLen = 11;
  const rad = ((angle - 90) * Math.PI) / 180;
  const hornX = cx + Math.cos(rad) * hornLen;
  const hornY = (cy - 3) + Math.sin(rad) * hornLen;

  return (
    <g>
      {/* Cables from body to pin holes — horizontal lines */}
      <line x1={bodyR} y1={p0.y} x2={p0.x} y2={p0.y} stroke="#ff9800" strokeWidth={1.5} />
      <line x1={bodyR} y1={p1.y} x2={p1.x} y2={p1.y} stroke="#f44336" strokeWidth={1.5} />
      <line x1={bodyR} y1={p2.y} x2={p2.x} y2={p2.y} stroke="#795548" strokeWidth={1.5} />

      {/* Pin dots — exactly on breadboard grid holes */}
      <circle cx={p0.x} cy={p0.y} r={2.5} fill="#ff9800" />
      <circle cx={p1.x} cy={p1.y} r={2.5} fill="#f44336" />
      <circle cx={p2.x} cy={p2.y} r={2.5} fill="#795548" />

      {/* Pin labels */}
      <PinLabel x={p0.x} y={p0.y} name="signal" side="right" />
      <PinLabel x={p1.x} y={p1.y} name="vcc" side="right" />
      <PinLabel x={p2.x} y={p2.y} name="gnd" side="right" />

      {/* Body shadow */}
      <rect x={bodyL + 1} y={bodyT + 1} width={bodyW} height={bodyH} rx={2} fill="#00000020" />

      {/* Body */}
      <rect x={bodyL} y={bodyT} width={bodyW} height={bodyH} rx={2}
        fill="#1565c0" stroke={isSelected ? "#3b82f6" : "#0d47a1"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Top highlight */}
      <line x1={bodyL + 2} y1={bodyT + 2} x2={bodyR - 2} y2={bodyT + 2}
        stroke="#42a5f5" strokeWidth={0.5} opacity={0.5} />

      {/* Shaft circle */}
      <circle cx={cx} cy={cy - 3} r={5} fill="#e0e0e0" stroke="#bdbdbd" strokeWidth={0.6} />
      <circle cx={cx} cy={cy - 3} r={1.8} fill="#9e9e9e" />

      {/* Horn */}
      <line x1={cx} y1={cy - 3} x2={hornX} y2={hornY}
        stroke="#f5f5f5" strokeWidth={3} strokeLinecap="round" />
      <circle cx={hornX} cy={hornY} r={1.5} fill="#ddd" />

      {/* Angle arc indicator */}
      <path
        d={`M ${cx - 8} ${cy - 3} A 8 8 0 0 1 ${cx + 8} ${cy - 3}`}
        fill="none" stroke="#42a5f5" strokeWidth={0.5} opacity={0.4}
      />

      {/* SERVO label */}
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize={4} fill="#bbdefb" fontFamily="monospace" fontWeight="bold">
        SERVO
      </text>

      {/* Name below */}
      <text x={p1.x} y={p2.y + 12} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name} ({angle}°)
      </text>
    </g>
  );
}

export const ServoRenderer = React.memo(ServoRendererInner);
