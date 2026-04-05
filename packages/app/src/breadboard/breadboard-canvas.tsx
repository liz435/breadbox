import React, { useCallback, useMemo, useRef } from "react";
import { useSelector } from "@xstate/react";
import { useBoard } from "@/store/board-context";
import type { BoardComponent, ComponentType } from "@dreamer/schemas";
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
  pixelToGrid,
} from "./breadboard-grid";
import { getCamera, setCamera, screenToBoard, zoomAtPoint } from "./breadboard-camera";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { ComponentRenderer } from "./component-renderers/index";
import { WireRenderer } from "./component-renderers/wire-renderer";

// ── Default pin layouts per component type ──────────────────────

const DEFAULT_PINS: Record<ComponentType, Record<string, number | null>> = {
  led: { anode: null, cathode: null },
  rgb_led: { red: null, green: null, blue: null, cathode: null },
  button: { a: null, b: null },
  resistor: { a: null, b: null },
  potentiometer: { vcc: null, signal: null, gnd: null },
  buzzer: { positive: null, negative: null },
  servo: { signal: null, vcc: null, gnd: null },
  lcd_16x2: { rs: null, en: null, d4: null, d5: null, d6: null, d7: null },
  seven_segment: { a: null, b: null, c: null, d: null, e: null, f: null, g: null },
  photoresistor: { a: null, b: null },
  temperature_sensor: { vcc: null, signal: null, gnd: null },
  ultrasonic_sensor: { trigger: null, echo: null, vcc: null, gnd: null },
  wire: {},
  arduino_uno: {},
};

const DEFAULT_PROPERTIES: Partial<Record<ComponentType, Record<string, unknown>>> = {
  led: { color: "#ef4444" },
  resistor: { resistance: 220 },
  servo: { angle: 90 },
};

// ── Static board background (holes) ────────────────────────────

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

  // Power rail holes
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

// ── Main canvas ─────────────────────────────────────────────────

function BreadboardCanvasInner() {
  const { state, send } = useBoard();
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // Read interaction machine state
  const interactionMode = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.mode,
  );
  const placingType = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.componentType,
  );

  // Ghost preview position while placing
  const ghostRef = useRef<{ row: number; col: number } | null>(null);
  const [ghostPos, setGhostPos] = React.useState<{ row: number; col: number } | null>(null);

  // Static holes grid (never re-renders)
  const holeElements = useMemo(() => buildHoleElements(), []);

  // Camera state — force re-render on zoom/pan
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

  // ── Pointer down ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Middle mouse button or space held → pan
      if (e.button === 1 || spaceDownRef.current) {
        isPanningRef.current = true;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Left click while placing → create component
      if (e.button === 0 && interactionMode === "placing" && placingType) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);

        const component: BoardComponent = {
          id: crypto.randomUUID(),
          type: placingType,
          name: placingType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          x: grid.col,
          y: grid.row,
          rotation: 0,
          pins: { ...(DEFAULT_PINS[placingType] ?? {}) },
          properties: { ...(DEFAULT_PROPERTIES[placingType] ?? {}) },
        };

        send({ type: "PLACE_COMPONENT", component });
        breadboardInteractionActor.send({ type: "POINTER_UP" });
        setGhostPos(null);
        ghostRef.current = null;
        return;
      }

      // Left click on empty space → deselect
      if (e.button === 0 && e.target === svgRef.current) {
        send({ type: "SELECT", id: null });
      }
    },
    [send, interactionMode, placingType]
  );

  // ── Pointer move ──
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Pan
      if (isPanningRef.current) {
        const cam = getCamera();
        const dx = e.clientX - lastPanRef.current.x;
        const dy = e.clientY - lastPanRef.current.y;
        setCamera({ offsetX: cam.offsetX + dx, offsetY: cam.offsetY + dy });
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        forceUpdate();
        return;
      }

      // Ghost preview while placing
      if (interactionMode === "placing") {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);
        if (!ghostRef.current || ghostRef.current.row !== grid.row || ghostRef.current.col !== grid.col) {
          ghostRef.current = grid;
          setGhostPos(grid);
        }
      }
    },
    [forceUpdate, interactionMode]
  );

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // ── Keyboard for space panning + Escape to cancel ──
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = true;
      if (e.code === "Escape" && interactionMode !== "idle") {
        breadboardInteractionActor.send({ type: "CANCEL" });
        setGhostPos(null);
        ghostRef.current = null;
      }
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
  }, [interactionMode]);

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

  // Cursor style based on interaction mode
  const cursorClass =
    interactionMode === "placing"
      ? "cursor-copy"
      : interactionMode === "dragging"
        ? "cursor-grabbing"
        : "cursor-crosshair";

  return (
    <svg
      ref={svgRef}
      className={`h-full w-full bg-neutral-900 ${cursorClass}`}
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

        {/* Ghost preview while placing */}
        {interactionMode === "placing" && ghostPos && placingType && (
          <g opacity={0.4} pointerEvents="none">
            <circle
              cx={gridToPixel({ row: ghostPos.row, col: ghostPos.col }).x}
              cy={gridToPixel({ row: ghostPos.row, col: ghostPos.col }).y}
              r={8}
              fill="#3b82f6"
              stroke="#60a5fa"
              strokeWidth={1}
            />
            <text
              x={gridToPixel({ row: ghostPos.row, col: ghostPos.col }).x}
              y={gridToPixel({ row: ghostPos.row, col: ghostPos.col }).y - 12}
              textAnchor="middle"
              fontSize={7}
              fill="#60a5fa"
            >
              {placingType.replace(/_/g, " ")}
            </text>
          </g>
        )}
      </g>

      {/* Mode indicator */}
      {interactionMode !== "idle" && (
        <text x={10} y={20} fontSize={11} fill="#60a5fa" fontFamily="monospace">
          {interactionMode === "placing" ? `Placing: ${placingType} (click to place, Esc to cancel)` : interactionMode}
        </text>
      )}
    </svg>
  );
}

export const BreadboardCanvas = React.memo(BreadboardCanvasInner);
