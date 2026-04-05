import React, { useCallback, useMemo, useRef } from "react";
import { useBoard } from "@/store/board-context";
import {
  ROWS,
  COLS,
  HOLE_SPACING,
  HOLE_RADIUS,
  BOARD_PADDING,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  GAP_WIDTH,
  TERMINAL_WIDTH,
  gridToPixel,
} from "./breadboard-grid";
import { getCamera, setCamera, zoomAtPoint } from "./breadboard-camera";
import { ComponentRenderer } from "./component-renderers/index";
import { WireRenderer } from "./component-renderers/wire-renderer";

// ── Static board background (holes) ────────────────────────────────

function buildHoleElements(): React.ReactElement[] {
  const holes: React.ReactElement[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = gridToPixel({ row, col });
      holes.push(
        <circle
          key={`h-${row}-${col}`}
          cx={x}
          cy={y}
          r={HOLE_RADIUS}
          fill="#1a1a1a"
          stroke="#3a3a3a"
          strokeWidth={0.5}
        />
      );
    }
  }

  // Power rail holes (simplified: every 5th row)
  const railCols = [-2, -1, 10, 11];
  for (const col of railCols) {
    for (let row = 0; row < ROWS; row += 1) {
      const { x, y } = gridToPixel({ row, col });
      const isPositive = col === -2 || col === 10;
      holes.push(
        <circle
          key={`r-${row}-${col}`}
          cx={x}
          cy={y}
          r={HOLE_RADIUS}
          fill="#1a1a1a"
          stroke={isPositive ? "#ef444466" : "#3b82f666"}
          strokeWidth={0.5}
        />
      );
    }
  }

  return holes;
}

// ── Main canvas ─────────────────────────────────────────────────────

function BreadboardCanvasInner() {
  const { state, send } = useBoard();
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // Static holes grid (never re-renders)
  const holeElements = useMemo(() => buildHoleElements(), []);

  // Camera state for transform — we use a ref + forceUpdate pattern
  // to avoid re-rendering the entire tree on every pan/zoom frame.
  const [, setTick] = React.useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // ── Zoom via wheel ──
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const cam = getCamera();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      zoomAtPoint(sx, sy, cam.zoom * factor);
      forceUpdate();
    },
    [forceUpdate]
  );

  // ── Pan via middle-click or space+drag ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Middle mouse button or space held
      if (e.button === 1 || spaceDownRef.current) {
        isPanningRef.current = true;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Left click: check if clicking empty space to deselect
      if (e.button === 0 && e.target === svgRef.current) {
        send({ type: "SELECT", id: null });
      }
    },
    [send]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanningRef.current) return;
      const cam = getCamera();
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      setCamera({ offsetX: cam.offsetX + dx, offsetY: cam.offsetY + dy });
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      forceUpdate();
    },
    [forceUpdate]
  );

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // ── Keyboard for space panning ──
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        isPanningRef.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Component click handler ──
  const handleComponentClick = useCallback(
    (id: string) => {
      send({ type: "SELECT", id });
    },
    [send]
  );

  const cam = getCamera();
  const components = Object.values(state.components);
  const wires = Object.values(state.wires);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full cursor-crosshair bg-neutral-900"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <g
        transform={`translate(${cam.offsetX}, ${cam.offsetY}) scale(${cam.zoom})`}
      >
        {/* Board background */}
        <rect
          x={0}
          y={0}
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          rx={4}
          fill="#f5f0e6"
        />

        {/* Center gap line */}
        <rect
          x={BOARD_PADDING + TERMINAL_WIDTH}
          y={BOARD_PADDING - 4}
          width={GAP_WIDTH}
          height={(ROWS - 1) * HOLE_SPACING + 8}
          fill="#e8e0d0"
          rx={1}
        />

        {/* Power rail markings */}
        <line
          x1={BOARD_PADDING - 28}
          y1={BOARD_PADDING - 4}
          x2={BOARD_PADDING - 28}
          y2={BOARD_PADDING + (ROWS - 1) * HOLE_SPACING + 4}
          stroke="#ef4444"
          strokeWidth={1}
          opacity={0.4}
        />
        <line
          x1={BOARD_PADDING - 18}
          y1={BOARD_PADDING - 4}
          x2={BOARD_PADDING - 18}
          y2={BOARD_PADDING + (ROWS - 1) * HOLE_SPACING + 4}
          stroke="#3b82f6"
          strokeWidth={1}
          opacity={0.4}
        />

        {/* Hole grid */}
        <g>{holeElements}</g>

        {/* Wires */}
        {wires.map((wire) => (
          <WireRenderer
            key={wire.id}
            wire={wire}
            isSelected={state.selectedId === wire.id}
          />
        ))}

        {/* Components */}
        {components.map((comp) => (
          <g
            key={comp.id}
            onClick={(e) => {
              e.stopPropagation();
              handleComponentClick(comp.id);
            }}
            style={{ cursor: "pointer" }}
          >
            {/* Selection highlight */}
            {state.selectedId === comp.id && (
              <rect
                x={gridToPixel({ row: comp.y, col: comp.x }).x - 16}
                y={gridToPixel({ row: comp.y, col: comp.x }).y - 16}
                width={32}
                height={32}
                rx={4}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.6}
              />
            )}
            <ComponentRenderer
              component={comp}
              pinStates={state.pinStates}
              isSelected={state.selectedId === comp.id}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export const BreadboardCanvas = React.memo(BreadboardCanvasInner);
