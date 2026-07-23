import React, { useCallback, useState } from "react";
import type { BoardComponent } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE, PX_PER_MM } from "@/breadboard/breadboard-constants";
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
// ── Handheld card remote, drawn at true physical size (14px = 2.54mm pitch) ──
const BODY_W = 40 * PX_PER_MM;          // card width
const BODY_H = 86 * PX_PER_MM;          // card length
const CORNER_R = 4 * PX_PER_MM;         // rounded card corners
const PAD_X = 6 * PX_PER_MM;            // side margin to the button grid
const PAD_TOP = 24 * PX_PER_MM;         // emitter + label zone above the buttons
const GAP = 4 * PX_PER_MM;              // spacing between buttons
const BTN_H = 14 * PX_PER_MM;           // button height
const BTN_R = 2 * PX_PER_MM;            // button corner radius
const EMITTER_FROM_TOP = 8 * PX_PER_MM; // IR LED window, down from the top edge
const EMITTER_R = 2.4 * PX_PER_MM;      // IR LED window radius
const PRESS_SHIFT = 0.4 * PX_PER_MM;    // key travel while a button is held

function IrRemoteRendererInner({ component, isSelected }: IrRemoteRendererProps) {
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);

  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const bodyL = x;
  const bodyT = y;
  const emitterX = bodyL + BODY_W / 2;
  const emitterY = bodyT + EMITTER_FROM_TOP;
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
      <rect x={bodyL + 1.5} y={bodyT + 2} width={BODY_W} height={BODY_H} rx={CORNER_R} fill="#00000055" />
      <rect
        x={bodyL}
        y={bodyT}
        width={BODY_W}
        height={BODY_H}
        rx={CORNER_R}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#4b5563"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* IR emitter LED at the top. IR is near-invisible: while a button is
          held the die shows only the faint dim-red you'd catch by eye on a
          real remote — no rings, no bloom. */}
      <circle cx={emitterX} cy={emitterY} r={EMITTER_R} fill={energized ? "#4f1d1d" : "#3f1d1d"} />
      <circle cx={emitterX} cy={emitterY} r={EMITTER_R * 0.62} fill={energized ? "#9f2626" : "#7f1d1d"} />

      <text x={emitterX} y={emitterY + EMITTER_R + 3 * PX_PER_MM} textAnchor="middle" fontSize={2 * PX_PER_MM} fill="#9ca3af" fontFamily="monospace">
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
              y={by + (isDown ? PRESS_SHIFT : 0)}
              width={btnW}
              height={BTN_H - (isDown ? PRESS_SHIFT : 0)}
              rx={BTN_R}
              fill={isDown ? "#b91c1c" : "#dc2626"}
              stroke={isDown ? "#fca5a5" : "#7f1d1d"}
              strokeWidth={0.6}
            />
            <text
              x={bx + btnW / 2}
              y={by + BTN_H / 2 + 0.5 * PX_PER_MM}
              textAnchor="middle"
              fontSize={2.6 * PX_PER_MM}
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
