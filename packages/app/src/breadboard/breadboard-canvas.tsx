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
  BREADBOARD_WIDTH,
  BREADBOARD_HEIGHT,
  BREADBOARD_OFFSET_X,
  GAP_WIDTH,
  TERMINAL_WIDTH,
  POWER_RAIL_HEIGHT,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BREADBOARD_INNER_WIDTH,
  gridToPixel,
  pixelToGrid,
  getComponentFootprint,
} from "./breadboard-grid";
import type { ArduinoPinInfo } from "./breadboard-grid";
import { getCamera, setCamera, screenToBoard, zoomAtPoint } from "./breadboard-camera";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { ComponentRenderer } from "./component-renderers/index";
import { WireRenderer } from "./component-renderers/wire-renderer";
import { ArduinoUnoBoard } from "./component-renderers/arduino-uno-renderer";
import { CircuitOverlay } from "./circuit-overlay";
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook";

// ── Default pin layouts per component type ──────────────────────

const DEFAULT_PINS: Record<ComponentType, Record<string, number | null>> = {
  led: { anode: null, cathode: null },
  rgb_led: { red: null, green: null, blue: null, cathode: null },
  button: { a: null, b: null },
  resistor: { a: null, b: null },
  capacitor: { a: null, b: null },
  ic: {},
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

// ── Accent colors per component type (for occupied hole indicators) ──
const COMPONENT_ACCENT_COLORS: Partial<Record<ComponentType, string>> = {
  led: "#ef4444",
  rgb_led: "#a855f7",
  resistor: "#d2b48c",
  capacitor: "#3b82f6",
  ic: "#6b7280",
  button: "#f59e0b",
  buzzer: "#1a1a1a",
  servo: "#22c55e",
  potentiometer: "#78716c",
};

// ── Wire color from pin category ────────────────────────────────
function getWireColorForPin(pin: import("./breadboard-grid").ArduinoPinInfo): string {
  if (pin.label === "GND") return "#42a5f5";
  if (pin.label === "5V" || pin.label === "3V3" || pin.label === "3.3V" || pin.label === "VIN") return "#ef5350";
  if (pin.category === "power") return "#9e9e9e";
  if (pin.isPwm) return "#ff9800";
  if (pin.category === "analog") return "#81c784";
  return "#ffd54f";
}

// ── Column letters ──────────────────────────────────────────────
const COL_LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

// ── Breadboard origin helpers ───────────────────────────────────

/** X position where the breadboard terminal area starts (in board coordinates) */
const TERMINAL_ORIGIN_X = BREADBOARD_OFFSET_X + BOARD_PADDING + 24; // RAIL_OFFSET=24
/** Y position where terminal rows start (below top power rails) */
const TERMINAL_ORIGIN_Y = BOARD_PADDING + POWER_RAIL_HEIGHT;

// ── Static board background (holes + labels + rails) ────────────

function buildBreadboardBackground(): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  // ── SVG filter for inner shadow on holes ──
  elements.push(
    <defs key="hole-defs">
      <filter id="hole-inner-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feComponentTransfer in="SourceAlpha">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur stdDeviation="0.8" />
        <feOffset dx={0} dy={0.6} result="offsetblur" />
        <feFlood floodColor="#000000" floodOpacity="0.6" result="color" />
        <feComposite in2="offsetblur" operator="in" result="shadow" />
        <feComposite in2="SourceAlpha" operator="in" result="clipped" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="clipped" />
        </feMerge>
      </filter>
    </defs>
  );

  // ── Row numbers on left and right sides ──
  for (let row = 0; row < ROWS; row++) {
    const { y } = gridToPixel({ row, col: 0 });
    const leftX = gridToPixel({ row, col: 0 }).x - 12;
    const rightX = gridToPixel({ row, col: 9 }).x + 12;
    const rowLabel = `${row + 1}`;

    elements.push(
      <text
        key={`rl-${row}`}
        x={leftX}
        y={y + 1.5}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={5}
        fill="#999"
        fontFamily="monospace"
      >
        {rowLabel}
      </text>
    );
    elements.push(
      <text
        key={`rr-${row}`}
        x={rightX}
        y={y + 1.5}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={5}
        fill="#999"
        fontFamily="monospace"
      >
        {rowLabel}
      </text>
    );
  }

  // ── Column letters at top ──
  for (let col = 0; col < COLS; col++) {
    const { x } = gridToPixel({ row: 0, col });
    const letterY = TERMINAL_ORIGIN_Y - 8;
    elements.push(
      <text
        key={`cl-${col}`}
        x={x}
        y={letterY}
        textAnchor="middle"
        fontSize={5.5}
        fill="#999"
        fontFamily="monospace"
        fontWeight="bold"
      >
        {COL_LETTERS[col]}
      </text>
    );
  }

  // ── Column letters at bottom ──
  for (let col = 0; col < COLS; col++) {
    const { x } = gridToPixel({ row: ROWS - 1, col });
    const letterY = TERMINAL_ORIGIN_Y + (ROWS - 1) * HOLE_SPACING + 12;
    elements.push(
      <text
        key={`clb-${col}`}
        x={x}
        y={letterY}
        textAnchor="middle"
        fontSize={5.5}
        fill="#999"
        fontFamily="monospace"
        fontWeight="bold"
      >
        {COL_LETTERS[col]}
      </text>
    );
  }

  // ── Tie-point grouping indicators ──
  for (let row = 0; row < ROWS; row++) {
    // Left group (cols 0-4)
    const leftFirst = gridToPixel({ row, col: 0 });
    const leftLast = gridToPixel({ row, col: 4 });
    elements.push(
      <rect
        key={`tg-l-${row}`}
        x={leftFirst.x - HOLE_RADIUS - 2}
        y={leftFirst.y - HOLE_RADIUS - 2}
        width={leftLast.x - leftFirst.x + (HOLE_RADIUS + 2) * 2}
        height={(HOLE_RADIUS + 2) * 2}
        fill="none"
        stroke="#d0ccc0"
        strokeWidth={0.5}
        opacity={0.3}
        rx={2}
      />
    );

    // Right group (cols 5-9)
    const rightFirst = gridToPixel({ row, col: 5 });
    const rightLast = gridToPixel({ row, col: 9 });
    elements.push(
      <rect
        key={`tg-r-${row}`}
        x={rightFirst.x - HOLE_RADIUS - 2}
        y={rightFirst.y - HOLE_RADIUS - 2}
        width={rightLast.x - rightFirst.x + (HOLE_RADIUS + 2) * 2}
        height={(HOLE_RADIUS + 2) * 2}
        fill="none"
        stroke="#d0ccc0"
        strokeWidth={0.5}
        opacity={0.3}
        rx={2}
      />
    );
  }

  // ── Terminal hole grid ──
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(
        <circle
          key={`h-${row}-${col}`}
          cx={x}
          cy={y}
          r={HOLE_RADIUS}
          fill="#1A1A1A"
          stroke="#4a4a4a"
          strokeWidth={0.5}
          filter="url(#hole-inner-shadow)"
        />
      );
    }
  }

  // ── Power rail holes ──
  const railCols = [-2, -1, 10, 11];
  for (const col of railCols) {
    const isPositive = col === -2 || col === 10;
    for (let row = 0; row < ROWS; row++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(
        <circle
          key={`r-${row}-${col}`}
          cx={x}
          cy={y}
          r={HOLE_RADIUS}
          fill="#1A1A1A"
          stroke={isPositive ? "#ef444488" : "#3b82f688"}
          strokeWidth={0.6}
          filter="url(#hole-inner-shadow)"
        />
      );
    }
  }

  return elements;
}

// ── Power rail stripe decorations ───────────────────────────────

function PowerRailStripes() {
  const topRailY = TERMINAL_ORIGIN_Y - POWER_RAIL_HEIGHT / 2 - 2;
  const bottomRailY = TERMINAL_ORIGIN_Y + (ROWS - 1) * HOLE_SPACING + POWER_RAIL_HEIGHT / 2 + 2;
  const leftX = gridToPixel({ row: 0, col: -2 }).x - 6;
  const rightX = gridToPixel({ row: 0, col: 11 }).x + 6;
  const stripeWidth = rightX - leftX;

  return (
    <g>
      {/* Top power rail stripes */}
      <line
        x1={leftX}
        y1={topRailY - 3}
        x2={leftX + stripeWidth}
        y2={topRailY - 3}
        stroke="#ef4444"
        strokeWidth={1.5}
        opacity={0.5}
      />
      <text x={leftX - 2} y={topRailY - 1} fontSize={6} fill="#ef4444" fontWeight="bold" opacity={0.6}>+</text>

      <line
        x1={leftX}
        y1={topRailY + 3}
        x2={leftX + stripeWidth}
        y2={topRailY + 3}
        stroke="#3b82f6"
        strokeWidth={1.5}
        opacity={0.5}
      />
      <text x={leftX - 2} y={topRailY + 6} fontSize={6} fill="#3b82f6" fontWeight="bold" opacity={0.6}>-</text>

      {/* Bottom power rail stripes */}
      <line
        x1={leftX}
        y1={bottomRailY - 3}
        x2={leftX + stripeWidth}
        y2={bottomRailY - 3}
        stroke="#3b82f6"
        strokeWidth={1.5}
        opacity={0.5}
      />
      <text x={leftX - 2} y={bottomRailY - 1} fontSize={6} fill="#3b82f6" fontWeight="bold" opacity={0.6}>-</text>

      <line
        x1={leftX}
        y1={bottomRailY + 3}
        x2={leftX + stripeWidth}
        y2={bottomRailY + 3}
        stroke="#ef4444"
        strokeWidth={1.5}
        opacity={0.5}
      />
      <text x={leftX - 2} y={bottomRailY + 6} fontSize={6} fill="#ef4444" fontWeight="bold" opacity={0.6}>+</text>
    </g>
  );
}

// ── Ghost footprint preview ─────────────────────────────────────

function GhostPreview({
  row,
  col,
  componentType,
}: {
  row: number;
  col: number;
  componentType: ComponentType;
}) {
  const footprint = getComponentFootprint(componentType, row, col);

  return (
    <g opacity={0.4} pointerEvents="none">
      {footprint.points.map((pt, i) => {
        const { x, y } = gridToPixel(pt);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={5}
            fill="#3b82f6"
            stroke="#60a5fa"
            strokeWidth={1}
          />
        );
      })}
      <text
        x={gridToPixel({ row, col }).x}
        y={gridToPixel({ row, col }).y - 14}
        textAnchor="middle"
        fontSize={7}
        fill="#60a5fa"
        fontFamily="monospace"
      >
        {componentType.replace(/_/g, " ")}
      </text>
    </g>
  );
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

  // Wire-from-pin state
  const wiringFromPin = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.wireFromPin,
  );
  const wireFromPos = useSelector(
    breadboardInteractionActor,
    (snap) => ({ x: snap.context.wireFromX, y: snap.context.wireFromY }),
  );

  // Circuit analysis
  const { analysis } = useCircuitAnalysis();

  // Ghost preview position while placing
  const ghostRef = useRef<{ row: number; col: number } | null>(null);
  const [ghostPos, setGhostPos] = React.useState<{ row: number; col: number } | null>(null);

  // Static breadboard background (never re-renders)
  const backgroundElements = useMemo(() => buildBreadboardBackground(), []);

  // Camera state — force re-render on zoom/pan
  const [, setTick] = React.useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // ── Handle start wire from Arduino pin ──
  const handleStartWireFromPin = useCallback(
    (pin: ArduinoPinInfo) => {
      breadboardInteractionActor.send({
        type: "START_WIRE_FROM_PIN",
        pin,
        pinX: pin.x,
        pinY: pin.y,
      });
    },
    [],
  );

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

      // Left click while wiring from pin → complete wire to breadboard hole
      if (e.button === 0 && interactionMode === "wiring_from_pin" && wiringFromPin) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);

        // Only complete if clicking on the breadboard area
        if (grid.row >= 0 && grid.row < ROWS && grid.col >= -2 && grid.col <= 11) {
          // Use sentinel fromRow=-999 to mark this as an Arduino pin wire.
          // fromCol stores the Arduino pin number so the renderer can look up position.
          const currentWiringPin = breadboardInteractionActor.getSnapshot().context.wireFromPin;
          if (!currentWiringPin) return;
          send({
            type: "ADD_WIRE",
            wire: {
              id: crypto.randomUUID(),
              fromRow: -999,
              fromCol: currentWiringPin.pin,
              toRow: grid.row,
              toCol: grid.col,
              color: getWireColorForPin(currentWiringPin),
            },
          });
        }

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
    [send, interactionMode, placingType, wiringFromPin]
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

      // Ghost preview while placing or wiring from pin
      if (interactionMode === "placing" || interactionMode === "wiring_from_pin") {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);
        if (!ghostRef.current || ghostRef.current.row !== grid.row || ghostRef.current.col !== grid.col) {
          ghostRef.current = grid;
          setGhostPos(grid);
        }
        // Also send pointer move for the interaction machine to track currentX/Y
        if (interactionMode === "wiring_from_pin") {
          breadboardInteractionActor.send({
            type: "POINTER_MOVE",
            x: board.x,
            y: board.y,
          });
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
  const components = Object.values(state.components).filter(
    (c) => c.type !== "arduino_uno"
  );
  const wires = Object.values(state.wires);

  // Cursor style based on interaction mode
  const cursorClass =
    interactionMode === "placing"
      ? "cursor-copy"
      : interactionMode === "dragging"
        ? "cursor-grabbing"
        : interactionMode === "wiring_from_pin"
          ? "cursor-crosshair"
          : "cursor-crosshair";

  // Breadboard body coordinates
  const bbX = BREADBOARD_OFFSET_X;
  const bbY = 0;

  // Center gap coordinates
  const gapX = TERMINAL_ORIGIN_X + TERMINAL_WIDTH;
  const gapY = TERMINAL_ORIGIN_Y - 4;
  const gapHeight = (ROWS - 1) * HOLE_SPACING + 8;

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
        {/* ── Arduino Uno board (fixed, left side) ── */}
        <ArduinoUnoBoard
          pinStates={state.pinStates}
          onStartWireFromPin={handleStartWireFromPin}
          wiringFromPin={wiringFromPin}
        />

        {/* ── Breadboard ── */}
        <g>
          {/* Board shadow */}
          <rect
            x={bbX + 3}
            y={bbY + 3}
            width={BREADBOARD_WIDTH}
            height={BREADBOARD_HEIGHT}
            rx={6}
            fill="#00000030"
          />

          {/* Board background (off-white with subtle texture) */}
          <rect
            x={bbX}
            y={bbY}
            width={BREADBOARD_WIDTH}
            height={BREADBOARD_HEIGHT}
            rx={6}
            fill="#F5F0E8"
            stroke="#d0c8b8"
            strokeWidth={1}
          />

          {/* Subtle board edge bevel */}
          <rect
            x={bbX + 2}
            y={bbY + 2}
            width={BREADBOARD_WIDTH - 4}
            height={BREADBOARD_HEIGHT - 4}
            rx={5}
            fill="none"
            stroke="#eee8d8"
            strokeWidth={1}
          />

          {/* Center gap (channel between left and right terminal strips) */}
          <rect
            x={gapX}
            y={gapY}
            width={GAP_WIDTH}
            height={gapHeight}
            fill="#D4CFC7"
            rx={1}
          />
          {/* Center gap groove line */}
          <line
            x1={gapX + GAP_WIDTH / 2}
            y1={gapY + 2}
            x2={gapX + GAP_WIDTH / 2}
            y2={gapY + gapHeight - 2}
            stroke="#d8d0c0"
            strokeWidth={1}
          />

          {/* Power rail separation lines */}
          <line
            x1={bbX + 8}
            y1={TERMINAL_ORIGIN_Y - 4}
            x2={bbX + BREADBOARD_WIDTH - 8}
            y2={TERMINAL_ORIGIN_Y - 4}
            stroke="#c8c0b0"
            strokeWidth={0.8}
            opacity={0.6}
          />
          <line
            x1={bbX + 8}
            y1={TERMINAL_ORIGIN_Y + (ROWS - 1) * HOLE_SPACING + 4}
            x2={bbX + BREADBOARD_WIDTH - 8}
            y2={TERMINAL_ORIGIN_Y + (ROWS - 1) * HOLE_SPACING + 4}
            stroke="#c8c0b0"
            strokeWidth={0.8}
            opacity={0.6}
          />

          {/* Power rail stripes */}
          <PowerRailStripes />

          {/* Hole grid + labels */}
          <g>{backgroundElements}</g>
        </g>

        {/* ── Wires ── */}
        {wires.map((wire) => (
          <WireRenderer
            key={wire.id}
            wire={wire}
            isSelected={state.selectedId === wire.id}
          />
        ))}

        {/* ── Components ── */}
        {components.map((comp) => {
          const footprint = getComponentFootprint(comp.type, comp.y, comp.x);
          const primaryPos = gridToPixel({ row: comp.y, col: comp.x });

          return (
            <g
              key={comp.id}
              onClick={(e) => {
                e.stopPropagation();
                handleComponentClick(comp.id);
              }}
              style={{ cursor: "pointer" }}
            >
              {/* Selection highlight around footprint */}
              {state.selectedId === comp.id && (
                <rect
                  x={primaryPos.x - 10}
                  y={primaryPos.y - 10}
                  width={footprint.width + 8}
                  height={footprint.height + 8}
                  rx={4}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  opacity={0.5}
                />
              )}
              <ComponentRenderer
                component={comp}
                pinStates={state.pinStates}
                isSelected={state.selectedId === comp.id}
                electricalState={analysis?.componentStates.get(comp.id)}
                libraryState={state.libraryState}
              />
            </g>
          );
        })}

        {/* ── Occupied hole indicators ── */}
        {components.map((comp) => {
          const footprint = getComponentFootprint(comp.type, comp.y, comp.x);
          const accentColor = COMPONENT_ACCENT_COLORS[comp.type] ?? "#60a5fa";
          return footprint.points.map((pt, i) => {
            const pos = gridToPixel(pt);
            return (
              <circle
                key={`occ-${comp.id}-${i}`}
                cx={pos.x}
                cy={pos.y}
                r={HOLE_RADIUS + 1.5}
                fill="none"
                stroke={accentColor}
                strokeWidth={1}
                opacity={0.7}
                pointerEvents="none"
              />
            );
          });
        })}

        {/* ── Circuit analysis overlay ── */}
        {analysis && analysis.isValid && (
          <CircuitOverlay analysis={analysis} components={components} />
        )}

        {/* ── Ghost preview while placing ── */}
        {interactionMode === "placing" && ghostPos && placingType && (
          <GhostPreview
            row={ghostPos.row}
            col={ghostPos.col}
            componentType={placingType}
          />
        )}

        {/* ── Wire preview while wiring from Arduino pin ── */}
        {interactionMode === "wiring_from_pin" && wiringFromPin && ghostPos && (() => {
          const previewColor = getWireColorForPin(wiringFromPin);
          return (
          <g pointerEvents="none">
            {/* Dashed line from Arduino pin to nearest breadboard hole */}
            <line
              x1={wireFromPos.x}
              y1={wireFromPos.y}
              x2={gridToPixel(ghostPos).x}
              y2={gridToPixel(ghostPos).y}
              stroke={previewColor}
              strokeWidth={2}
              strokeDasharray="4 2"
              opacity={0.8}
            />
            {/* Target hole indicator */}
            <circle
              cx={gridToPixel(ghostPos).x}
              cy={gridToPixel(ghostPos).y}
              r={4}
              fill={previewColor}
              fillOpacity={0.3}
              stroke={previewColor}
              strokeWidth={1}
            />
            {/* Source pin indicator */}
            <circle
              cx={wireFromPos.x}
              cy={wireFromPos.y}
              r={5}
              fill="none"
              stroke={previewColor}
              strokeWidth={1.5}
              opacity={0.6}
            />
          </g>
          );
        })()}
      </g>

      {/* Mode indicator */}
      {interactionMode !== "idle" && (
        <text x={10} y={20} fontSize={11} fill="#60a5fa" fontFamily="monospace">
          {interactionMode === "placing"
            ? `Placing: ${placingType} (click to place, Esc to cancel)`
            : interactionMode === "wiring_from_pin" && wiringFromPin
              ? `Wiring from ${wiringFromPin.label} (click breadboard hole to connect, Esc to cancel)`
              : interactionMode}
        </text>
      )}
    </svg>
  );
}

export const BreadboardCanvas = React.memo(BreadboardCanvasInner);
