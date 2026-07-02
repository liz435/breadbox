import React, { useCallback, useState } from "react";
import type { BoardComponent } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
import { irRemoteStore } from "@/simulator/ir-remote-store";

type IrRemoteRendererProps = {
  component: BoardComponent;
  isSelected: boolean;
};

// NEC codes from a common car-MP3 / Elegoo remote, so the hex values that
// print in the Serial Monitor match what a learner would find online.
const REMOTE_BUTTONS: ReadonlyArray<{ label: string; code: number }> = [
  { label: "On", code: 0xffa25d },
  { label: "Mute", code: 0xffe21d },
  { label: "Vol+", code: 0xff629d },
  { label: "Vol−", code: 0xffa857 },
  { label: "Ch+", code: 0xff02fd },
  { label: "Ch−", code: 0xffc23d },
];

const COLS = 2;
const BODY_W = 44;
const BODY_H = 88;
const PAD_X = 6;
const PAD_TOP = 22;
const GAP = 4;
const BTN_H = 16;

function IrRemoteRendererInner({ component, isSelected }: IrRemoteRendererProps) {
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);

  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const bodyL = x;
  const bodyT = y;
  const emitterX = bodyL + BODY_W / 2;
  const emitterY = bodyT + 7;
  const btnW = (BODY_W - PAD_X * 2 - GAP * (COLS - 1)) / COLS;
  const energized = pressedIdx !== null;

  const bodyGradId = `irrem-body-${component.id}`;

  const press = useCallback((idx: number, code: number) => {
    irRemoteStore.broadcast(code);
    setPressedIdx(idx);
  }, []);
  const release = useCallback(() => {
    irRemoteStore.endHold();
    setPressedIdx(null);
  }, []);

  return (
    <g>
      <defs>
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#374151" />
          <stop offset="55%" stopColor="#1f2937" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
      </defs>

      {/* Body shadow + shell */}
      <rect x={bodyL + 1} y={bodyT + 1.5} width={BODY_W} height={BODY_H} rx={6} fill="#00000055" />
      <rect
        x={bodyL}
        y={bodyT}
        width={BODY_W}
        height={BODY_H}
        rx={6}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#4b5563"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* IR emitter LED at the top. IR is near-invisible: while a button is
          held the die shows only the faint dim-red you'd catch by eye on a
          real remote — no rings, no bloom. */}
      <circle cx={emitterX} cy={emitterY} r={2.6} fill={energized ? "#4f1d1d" : "#3f1d1d"} />
      <circle cx={emitterX} cy={emitterY} r={1.7} fill={energized ? "#9f2626" : "#7f1d1d"} />

      <text x={emitterX} y={bodyT + 15} textAnchor="middle" fontSize={3} fill="#9ca3af" fontFamily="monospace">
        IR REMOTE
      </text>

      {/* Buttons — each beams its NEC code on press */}
      {REMOTE_BUTTONS.map((btn, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const bx = bodyL + PAD_X + col * (btnW + GAP);
        const by = bodyT + PAD_TOP + row * (BTN_H + GAP);
        const isDown = pressedIdx === i;
        return (
          <g
            key={btn.label}
            onPointerDown={(e) => {
              e.stopPropagation();
              press(i, btn.code);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              release();
            }}
            onPointerLeave={release}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={bx}
              y={by + (isDown ? 0.6 : 0)}
              width={btnW}
              height={BTN_H - (isDown ? 0.6 : 0)}
              rx={3}
              fill={isDown ? "#b91c1c" : "#dc2626"}
              stroke={isDown ? "#fca5a5" : "#7f1d1d"}
              strokeWidth={0.6}
            />
            <text
              x={bx + btnW / 2}
              y={by + BTN_H / 2 + 1.6}
              textAnchor="middle"
              fontSize={4.2}
              fill="#fee2e2"
              fontFamily="monospace"
              fontWeight="bold"
              pointerEvents="none"
            >
              {btn.label}
            </text>
          </g>
        );
      })}

      <text
        x={emitterX}
        y={bodyT + BODY_H + 8}
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

export const IrRemoteRenderer = React.memo(IrRemoteRendererInner);
