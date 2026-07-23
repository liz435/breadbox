import React, { useMemo } from "react";
import type { ComponentRendererProps } from "@/breadboard/component-renderers/renderer-types";
import {
  ROWS,
  COLS,
  HOLE_SPACING,
  HOLE_RADIUS,
  BOARD_PADDING,
  BREADBOARD_WIDTH,
  BREADBOARD_HEIGHT,
  BREADBOARD_OFFSET_X,
  GAP_WIDTH,
  TERMINAL_WIDTH,
  POWER_RAIL_HEIGHT,
  RAIL_OFFSET,
  gridToPixel,
  isRailRow,
} from "@/breadboard/breadboard-grid";

/**
 * Renderer for `breadboard_full` components.
 *
 * Today this inlines what `StaticBackground` in breadboard-canvas.tsx used to
 * draw — board body, gap, holes, power-rail stripes, row/column labels. The
 * positions still come from the legacy module-level constants (BREADBOARD_OFFSET_X,
 * gridToPixel, etc.), so a breadboard with `worldX: 0` renders at the same place
 * the implicit breadboard used to.
 *
 * `component.worldX` / `component.worldY` are applied as a translate so dragged
 * breadboards visually move. The legacy origin (BREADBOARD_OFFSET_X, 0) is the
 * zero-point: `worldX = 100` means "100px to the right of where the legacy
 * implicit breadboard used to sit". A future cleanup can fold the legacy offset
 * into a single coordinate space; for now this minimises blast radius.
 *
 * Components placed on this breadboard still use `gridToPixel` directly — they
 * do not yet move with the breadboard. Stage 3 (drag/re-parent) is where the
 * full coordinate cleanup lands.
 */

const COL_LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

const TERMINAL_ORIGIN_X = BREADBOARD_OFFSET_X + BOARD_PADDING + RAIL_OFFSET;
const TERMINAL_ORIGIN_Y = BOARD_PADDING + POWER_RAIL_HEIGHT;

function Hole({ x, y }: { x: number; y: number }) {
  return (
    <g key={`hole-${x}-${y}`}>
      <circle cx={x} cy={y} r={HOLE_RADIUS + 0.4} fill="#1a1a1a" />
      <circle cx={x} cy={y} r={HOLE_RADIUS} fill="url(#hole-fill)" />
      <circle
        cx={x - 0.4}
        cy={y - 0.4}
        r={HOLE_RADIUS * 0.45}
        fill="#ffffff"
        opacity={0.18}
      />
    </g>
  );
}

function buildHolesAndLabels(): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  for (let col = 0; col < 10; col++) {
    const { x } = gridToPixel({ row: 0, col });
    const letterY = TERMINAL_ORIGIN_Y - 8;
    elements.push(
      <text
        key={`cl-top-${col}`}
        x={x}
        y={letterY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={4.5}
        fill="#7a7670"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={500}
      >
        {COL_LETTERS[col]}
      </text>,
    );
  }
  const bottomLetterY = TERMINAL_ORIGIN_Y + (ROWS - 1) * HOLE_SPACING + 8;
  for (let col = 0; col < 10; col++) {
    const { x } = gridToPixel({ row: 0, col });
    elements.push(
      <text
        key={`cl-bot-${col}`}
        x={x}
        y={bottomLetterY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={4.5}
        fill="#7a7670"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={500}
      >
        {COL_LETTERS[col]}
      </text>,
    );
  }

  const gapCenterX =
    (gridToPixel({ row: 0, col: 4 }).x + gridToPixel({ row: 0, col: 5 }).x) / 2;
  for (let row = 0; row < ROWS; row++) {
    const { y } = gridToPixel({ row, col: 0 });
    if (row === 0 || (row + 1) % 5 === 0) {
      elements.push(
        <text
          key={`rn-${row}`}
          x={gapCenterX}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={4}
          fill="#7a7670"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={500}
        >
          {row + 1}
        </text>,
      );
    }
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(<Hole key={`h-${row}-${col}`} x={x} y={y} />);
    }
  }

  const railCols = [-2, -1, 10, 11];
  for (const col of railCols) {
    for (let row = 0; row < ROWS; row++) {
      if (!isRailRow(row)) continue;
      const { x, y } = gridToPixel({ row, col });
      elements.push(<Hole key={`r-${row}-${col}`} x={x} y={y} />);
    }
  }

  return elements;
}

function PowerRailStripes() {
  // Polarity follows isPositiveRailCol: every pair reads − then + left to
  // right (like real silkscreen), so −2/10 are − and −1/11 are +.
  const leftMinusX = gridToPixel({ row: 0, col: -2 }).x;
  const leftPlusX = gridToPixel({ row: 0, col: -1 }).x;
  const rightMinusX = gridToPixel({ row: 0, col: 10 }).x;
  const rightPlusX = gridToPixel({ row: 0, col: 11 }).x;

  const topY = gridToPixel({ row: 0, col: -2 }).y;
  const bottomY = gridToPixel({ row: ROWS - 1, col: -2 }).y;
  const stripeInset = 5;
  const stripeLen = bottomY - topY + 8;
  const stripeStartY = topY - 4;

  const renderRail = (
    cx: number,
    color: string,
    side: "outer" | "inner",
    sign: "+" | "−",
    keyPrefix: string,
  ) => {
    const offset = side === "outer" ? -stripeInset : stripeInset;
    const x = cx + offset;
    return (
      <g key={keyPrefix}>
        <line
          x1={x}
          y1={stripeStartY}
          x2={x}
          y2={stripeStartY + stripeLen}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.18}
        />
        <line
          x1={x}
          y1={stripeStartY}
          x2={x}
          y2={stripeStartY + stripeLen}
          stroke={color}
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.95}
        />
        <text
          x={x + (side === "outer" ? -3.5 : 3.5)}
          y={stripeStartY - 2}
          textAnchor={side === "outer" ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={5}
          fill={color}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={700}
        >
          {sign}
        </text>
        <text
          x={x + (side === "outer" ? -3.5 : 3.5)}
          y={stripeStartY + stripeLen + 2}
          textAnchor={side === "outer" ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={5}
          fill={color}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={700}
        >
          {sign}
        </text>
      </g>
    );
  };

  return (
    <g>
      {renderRail(leftMinusX, "#2563eb", "outer", "−", "left-minus")}
      {renderRail(leftPlusX, "#dc2626", "inner", "+", "left-plus")}
      {renderRail(rightMinusX, "#2563eb", "outer", "−", "right-minus")}
      {renderRail(rightPlusX, "#dc2626", "inner", "+", "right-plus")}
    </g>
  );
}

function BreadboardRendererInner({ component }: ComponentRendererProps) {
  const elements = useMemo(() => buildHolesAndLabels(), []);
  const bbX = BREADBOARD_OFFSET_X;
  const gapX = TERMINAL_ORIGIN_X + TERMINAL_WIDTH;
  const gapY = TERMINAL_ORIGIN_Y - 6;
  const gapHeight = (ROWS - 1) * HOLE_SPACING + 12;
  // Inset the center trough so it clears the dots in the bordering columns
  // e (col 4, centered on gapX) and f (col 5, centered on gapX + GAP_WIDTH).
  // Derived from HOLE_RADIUS so the trough stays off the dots at any hole size.
  const gapInset = HOLE_RADIUS + 1.5;
  const gapInnerX = gapX + gapInset;
  const gapInnerWidth = GAP_WIDTH - gapInset * 2;
  const gapInnerRight = gapInnerX + gapInnerWidth;

  const dx = component.worldX ?? 0;
  const dy = component.worldY ?? 0;

  // The <defs> block (board-fill, hole-fill, gap-fill gradients) is rendered
  // once at the canvas root — see <BreadboardDefs /> below. With multiple
  // breadboards on the canvas, inlining defs per renderer would collide on
  // id and silently leave the later definitions inert.

  return (
    <g transform={dx !== 0 || dy !== 0 ? `translate(${dx}, ${dy})` : undefined}>
      <rect
        x={bbX + 2}
        y={4}
        width={BREADBOARD_WIDTH}
        height={BREADBOARD_HEIGHT}
        rx={4}
        fill="#000000"
        opacity={0.25}
      />

      <rect
        x={bbX}
        y={0}
        width={BREADBOARD_WIDTH}
        height={BREADBOARD_HEIGHT}
        rx={4}
        fill="url(#board-fill)"
        stroke="#b8b3a8"
        strokeWidth={0.8}
      />

      <rect
        x={bbX + 1.5}
        y={1.5}
        width={BREADBOARD_WIDTH - 3}
        height={BREADBOARD_HEIGHT - 3}
        rx={3}
        fill="none"
        stroke="#ffffff"
        strokeWidth={0.6}
        opacity={0.5}
      />

      <rect
        x={gapInnerX}
        y={gapY}
        width={gapInnerWidth}
        height={gapHeight}
        fill="url(#gap-fill)"
        rx={1.5}
      />
      <line
        x1={gapInnerX}
        y1={gapY}
        x2={gapInnerRight}
        y2={gapY}
        stroke="#000000"
        strokeWidth={0.6}
        opacity={0.18}
      />
      <line
        x1={gapInnerX}
        y1={gapY + gapHeight}
        x2={gapInnerRight}
        y2={gapY + gapHeight}
        stroke="#ffffff"
        strokeWidth={0.6}
        opacity={0.4}
      />

      <PowerRailStripes />
      <g>{elements}</g>
    </g>
  );
}

export const BreadboardRenderer = React.memo(BreadboardRendererInner);

/**
 * Shared SVG defs (gradients) used by all BreadboardRenderer instances.
 * Render exactly once at the canvas root — the BreadboardRenderer references
 * these ids by url(#board-fill) etc.
 */
export function BreadboardDefs() {
  return (
    <defs>
      <linearGradient id="board-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f5f1ea" />
        <stop offset="50%" stopColor="#ece7df" />
        <stop offset="100%" stopColor="#e0dbd2" />
      </linearGradient>
      <radialGradient id="hole-fill" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="60%" stopColor="#1f1f1f" />
        <stop offset="100%" stopColor="#2a2a2a" />
      </radialGradient>
      <linearGradient id="gap-fill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#cfc9bf" />
        <stop offset="50%" stopColor="#dcd6cc" />
        <stop offset="100%" stopColor="#cfc9bf" />
      </linearGradient>
    </defs>
  );
}
