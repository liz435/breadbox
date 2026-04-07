import React, { useCallback, useMemo, useRef } from "react";
import { useSelector } from "@xstate/react";
import { useBoardSelector, BoardContext } from "@/store/board-context";
import type { BoardComponent, ComponentType, LibraryState } from "@dreamer/schemas";
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
  RAIL_OFFSET,
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
import { getComponentDef } from "@/components/registry";

// ── Registry-driven helpers ──────────────────────────────────────

function getDefaultPins(type: ComponentType): Record<string, number | null> {
  return { ...(getComponentDef(type)?.defaultPins ?? {}) };
}

function getDefaultProperties(type: ComponentType): Record<string, unknown> {
  return { ...(getComponentDef(type)?.defaultProperties ?? {}) };
}

function getAccentColor(type: ComponentType): string | undefined {
  return getComponentDef(type)?.accentColor;
}

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
const TERMINAL_ORIGIN_X = BREADBOARD_OFFSET_X + BOARD_PADDING + RAIL_OFFSET;
/** Y position where terminal rows start (below top power rails) */
const TERMINAL_ORIGIN_Y = BOARD_PADDING + POWER_RAIL_HEIGHT;

// ── Static board background (holes + labels + rails) ────────────
// Matches real breadboard reference: light gray board, subtle holes,
// column letters on left, row numbers in center gap, red/blue power rails

function buildBreadboardBackground(): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  // ── Column letters on left side (a-e) and right side (f-j) ──
  const leftLetters = ["a", "b", "c", "d", "e"];
  const rightLetters = ["f", "g", "h", "i", "j"];
  const labelX0 = gridToPixel({ row: 0, col: 0 }).x - 14;
  const labelX5 = gridToPixel({ row: 0, col: 5 }).x - 14;

  for (let i = 0; i < 5; i++) {
    const yLeft = gridToPixel({ row: 0, col: i }).x; // use col position for vertical offset
    elements.push(
      <text
        key={`cl-${i}`}
        x={labelX0}
        y={gridToPixel({ row: 0, col: 0 }).y + i * HOLE_SPACING * 0 - 8}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={5}
        fill="#aaa"
        fontFamily="sans-serif"
      >
        {leftLetters[i]}
      </text>
    );
  }

  // Actually — column letters should label each column, placed at the left edge vertically.
  // In the reference: a,b,c,d,e are on the left of the left half, f,g,h,i,j on the left of the right half.
  // But they label ROWS of 5 (a=col0, b=col1...). Let's place them at the far left and far right.
  elements.length = 0; // reset, redo properly

  // Column letters at LEFT edge for left half (a-e)
  for (let col = 0; col < 5; col++) {
    const { x } = gridToPixel({ row: 0, col });
    const letterY = TERMINAL_ORIGIN_Y - 10;
    elements.push(
      <text key={`cl-${col}`} x={x} y={letterY}
        textAnchor="middle" fontSize={5} fill="#b0b0b0" fontFamily="sans-serif">
        {COL_LETTERS[col]}
      </text>
    );
  }
  // Column letters for right half (f-j)
  for (let col = 5; col < 10; col++) {
    const { x } = gridToPixel({ row: 0, col });
    const letterY = TERMINAL_ORIGIN_Y - 10;
    elements.push(
      <text key={`cl-${col}`} x={x} y={letterY}
        textAnchor="middle" fontSize={5} fill="#b0b0b0" fontFamily="sans-serif">
        {COL_LETTERS[col]}
      </text>
    );
  }

  // ── Row numbers in center gap ──
  const gapCenterX = (gridToPixel({ row: 0, col: 4 }).x + gridToPixel({ row: 0, col: 5 }).x) / 2;
  for (let row = 0; row < ROWS; row++) {
    const { y } = gridToPixel({ row, col: 0 });
    // Show every 5th row number, plus row 1
    if (row === 0 || (row + 1) % 5 === 0) {
      elements.push(
        <text key={`rn-${row}`} x={gapCenterX} y={y + 1.5}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={4.5} fill="#c44" fontFamily="sans-serif">
          {row + 1}
        </text>
      );
    }
  }

  // ── Terminal hole grid — light gray holes ──
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(
        <circle key={`h-${row}-${col}`} cx={x} cy={y} r={HOLE_RADIUS}
          fill="#B8B6B4" stroke="#A8A6A4" strokeWidth={0.4} />
      );
    }
  }

  // ── Power rail holes — grouped in 5s with small gaps ──
  const railCols = [-2, -1, 10, 11];
  for (const col of railCols) {
    for (let row = 0; row < ROWS; row++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(
        <circle key={`r-${row}-${col}`} cx={x} cy={y} r={HOLE_RADIUS}
          fill="#B8B6B4" stroke="#A8A6A4" strokeWidth={0.4} />
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
      {/* Top power rail — red line */}
      <line x1={leftX} y1={topRailY} x2={leftX + stripeWidth} y2={topRailY}
        stroke="#D44" strokeWidth={1.5} opacity={0.7} />

      {/* Bottom power rail — blue line */}
      <line x1={leftX} y1={bottomRailY} x2={leftX + stripeWidth} y2={bottomRailY}
        stroke="#44D" strokeWidth={1.5} opacity={0.7} />
    </g>
  );
}

// ── Ghost footprint preview ─────────────────────────────────────

function GhostPreview({
  row,
  col,
  componentType,
  rotation = 0,
}: {
  row: number;
  col: number;
  componentType: ComponentType;
  rotation?: number;
}) {
  const footprint = getComponentFootprint(componentType, row, col, rotation);

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

// ── Static background layer — never re-renders after mount ──────

const StaticBackground = React.memo(function StaticBackground() {
  const elements = useMemo(() => buildBreadboardBackground(), []);

  // Breadboard body coordinates
  const bbX = BREADBOARD_OFFSET_X;
  const bbY = 0;

  // Center gap coordinates
  const gapX = TERMINAL_ORIGIN_X + TERMINAL_WIDTH;
  const gapY = TERMINAL_ORIGIN_Y - 4;
  const gapHeight = (ROWS - 1) * HOLE_SPACING + 8;

  return (
    <g>
      {/* Board background — light gray like real breadboard */}
      <rect
        x={bbX}
        y={bbY}
        width={BREADBOARD_WIDTH}
        height={BREADBOARD_HEIGHT}
        rx={3}
        fill="#E8E4DE"
        stroke="#D0CCC6"
        strokeWidth={1}
      />

      {/* Center gap (subtle recessed channel) */}
      <rect
        x={gapX + 3}
        y={gapY}
        width={GAP_WIDTH - 6}
        height={gapHeight}
        fill="#DAD6D0"
        rx={2}
      />

      {/* Power rail stripes */}
      <PowerRailStripes />

      {/* Hole grid + labels */}
      <g>{elements}</g>
    </g>
  );
});

// ── Wire layer — only re-renders when wires or selection changes ──

type WireLayerProps = {
  wires: Record<string, import("@dreamer/schemas").Wire>;
  selectedId: string | null;
};

const WireLayer = React.memo(function WireLayer({ wires, selectedId, onSelect }: WireLayerProps & { onSelect: (id: string) => void }) {
  const wireList = useMemo(() => Object.values(wires), [wires]);
  return (
    <g>
      {wireList.map((wire) => (
        <WireRenderer
          key={wire.id}
          wire={wire}
          isSelected={selectedId === wire.id}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
});

// ── Component layer — only re-renders when components/selection/analysis change ──

type ComponentLayerProps = {
  components: BoardComponent[];
  selectedId: string | null;
  draggingId: string | null;
  analysis: import("@/simulator/circuit-solver").CircuitAnalysis | null;
  libraryState: LibraryState;
  pinStates: import("@dreamer/schemas").PinState[];
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
};

const ComponentLayer = React.memo(function ComponentLayer({
  components,
  selectedId,
  draggingId,
  analysis,
  libraryState,
  pinStates,
  onSelect,
  onDragStart,
}: ComponentLayerProps) {
  return (
    <g>
      {/* ── Components ── */}
      {components.map((comp) => {
        const isDragging = draggingId === comp.id;
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation);
        const primaryPos = gridToPixel({ row: comp.y, col: comp.x });
        const rot = comp.rotation ?? 0;

        return (
          <g
            key={comp.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(comp.id);
            }}
            onPointerDown={(e) => {
              if (e.button === 0) {
                e.stopPropagation();
                onDragStart(comp.id, e);
              }
            }}
            style={{ cursor: isDragging ? "grabbing" : "pointer" }}
            opacity={isDragging ? 0.35 : 1}
          >
            {/* Selection highlight around footprint */}
            {selectedId === comp.id && (
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
            <g transform={rot ? `rotate(${rot * 90}, ${primaryPos.x}, ${primaryPos.y})` : undefined}>
              <ComponentRenderer
                component={comp}
                pinStates={pinStates}
                isSelected={selectedId === comp.id}
                electricalState={analysis?.componentStates.get(comp.id)}
                libraryState={libraryState}
              />
            </g>
          </g>
        );
      })}

      {/* ── Occupied hole indicators ── */}
      {components.map((comp) => {
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation);
        const accentColor = getAccentColor(comp.type as ComponentType) ?? "#60a5fa";
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
    </g>
  );
});

// ── Main canvas ─────────────────────────────────────────────────

function BreadboardCanvasInner({ zoomTick: _zoomTick, panMode }: { zoomTick?: number; panMode?: boolean }) {
  // Granular board state selectors — each subscribes independently
  const components = useBoardSelector((s) => s.components);
  const wires = useBoardSelector((s) => s.wires);
  const pinStates = useBoardSelector((s) => s.pinStates);
  const selectedId = useBoardSelector((s) => s.selectedId);
  const libraryState = useBoardSelector((s) => s.libraryState);
  const send = BoardContext.useActorRef().send;

  const svgRef = useRef<SVGSVGElement>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);
  const wireStartRef = useRef<{ row: number; col: number } | null>(null);

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

  // Drag state
  const draggingRef = useRef<{ id: string; startRow: number; startCol: number } | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragGhost, setDragGhost] = React.useState<{ row: number; col: number } | null>(null);

  // Rotation while placing
  const placingRotationRef = useRef(0);
  const [placingRotation, setPlacingRotation] = React.useState(0);

  // Camera state — force re-render on zoom/pan
  const [, setTick] = React.useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // Filtered components list (exclude arduino_uno)
  const filteredComponents = useMemo(
    () => Object.values(components).filter((c) => c.type !== "arduino_uno"),
    [components],
  );

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

  // ── Handle drag start on a component ──
  const handleDragStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      // Don't start drag during other interactions
      if (interactionMode !== "idle") return;
      const comp = components[id];
      if (!comp) return;
      send({ type: "SELECT", id });
      draggingRef.current = { id, startRow: comp.y, startCol: comp.x };
      setDraggingId(id);
      setDragGhost({ row: comp.y, col: comp.x });
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [interactionMode, components, send],
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
      if (e.button === 1 || spaceDownRef.current || panMode) {
        isPanningRef.current = true;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Left click while placing → create component or start wire
      if (e.button === 0 && interactionMode === "placing" && placingType) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);

        // Wire mode: first click sets start, second click creates wire
        if (placingType === "wire") {
          if (!wireStartRef.current) {
            // First click — remember start point
            wireStartRef.current = grid;
          } else {
            // Second click — create wire between start and current point
            const start = wireStartRef.current;
            if (start.row !== grid.row || start.col !== grid.col) {
              send({
                type: "ADD_WIRE",
                wire: {
                  id: crypto.randomUUID(),
                  fromRow: start.row,
                  fromCol: start.col,
                  toRow: grid.row,
                  toCol: grid.col,
                  color: "#fbbf24",
                },
              });
            }
            wireStartRef.current = null;
            breadboardInteractionActor.send({ type: "POINTER_UP" });
            setGhostPos(null);
            ghostRef.current = null;
          }
          return;
        }

        const component: BoardComponent = {
          id: crypto.randomUUID(),
          type: placingType,
          name: placingType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          x: grid.col,
          y: grid.row,
          rotation: placingRotationRef.current,
          pins: getDefaultPins(placingType),
          properties: getDefaultProperties(placingType),
        };

        send({ type: "PLACE_COMPONENT", component });
        breadboardInteractionActor.send({ type: "POINTER_UP" });
        placingRotationRef.current = 0;
        setPlacingRotation(0);
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

        // Complete wire to any grid point (on-board or off-board)
        {
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
    [send, interactionMode, placingType, wiringFromPin, panMode]
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

      // Dragging a component
      if (draggingRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);
        setDragGhost(grid);
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

    // Complete drag
    if (draggingRef.current && dragGhost) {
      const { id, startRow, startCol } = draggingRef.current;
      if (dragGhost.row !== startRow || dragGhost.col !== startCol) {
        send({ type: "MOVE_COMPONENT", id, x: dragGhost.col, y: dragGhost.row });
      }
      draggingRef.current = null;
      setDraggingId(null);
      setDragGhost(null);
    }
  }, [send, dragGhost]);

  // ── Keyboard for space panning + Escape to cancel ──
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.code === "Space") spaceDownRef.current = true;
      if (e.code === "Escape") {
        if (draggingRef.current) {
          draggingRef.current = null;
          setDraggingId(null);
          setDragGhost(null);
        }
        if (interactionMode !== "idle") {
          breadboardInteractionActor.send({ type: "CANCEL" });
          setGhostPos(null);
          ghostRef.current = null;
          wireStartRef.current = null;
          placingRotationRef.current = 0;
          setPlacingRotation(0);
        }
      }

      // R key — rotate selected component or rotate placing ghost
      if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey) {
        if (interactionMode === "placing") {
          placingRotationRef.current = (placingRotationRef.current + 1) % 4;
          setPlacingRotation(placingRotationRef.current);
        } else if (selectedId) {
          const comp = components[selectedId];
          if (comp && comp.type !== "arduino_uno" && comp.type !== "wire") {
            send({ type: "UPDATE_COMPONENT", id: selectedId, changes: { rotation: ((comp.rotation ?? 0) + 1) % 4 } });
          }
        }
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
  }, [interactionMode, selectedId, components, send]);

  // ── Component click handler ──
  const handleComponentClick = useCallback(
    (id: string) => {
      send({ type: "SELECT", id });
    },
    [send]
  );

  const cam = getCamera();

  // Cursor style based on interaction mode
  const cursorClass =
    panMode
      ? "cursor-grab"
      : interactionMode === "placing"
        ? "cursor-copy"
        : interactionMode === "dragging"
          ? "cursor-grabbing"
          : interactionMode === "wiring_from_pin"
            ? "cursor-crosshair"
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
        {/* ── Arduino Uno board (fixed, left side) ── */}
        <ArduinoUnoBoard
          onStartWireFromPin={handleStartWireFromPin}
          wiringFromPin={wiringFromPin}
        />

        {/* ── Breadboard (static background) ── */}
        <StaticBackground />

        {/* ── Wire layer ── */}
        <WireLayer wires={wires} selectedId={selectedId} onSelect={handleComponentClick} />

        {/* ── Component layer ── */}
        <ComponentLayer
          components={filteredComponents}
          selectedId={selectedId}
          draggingId={draggingId}
          analysis={analysis}
          libraryState={libraryState}
          pinStates={pinStates}
          onSelect={handleComponentClick}
          onDragStart={handleDragStart}
        />

        {/* ── Circuit analysis overlay ── */}
        {analysis && analysis.isValid && (
          <CircuitOverlay analysis={analysis} components={filteredComponents} />
        )}

        {/* ── Drag ghost preview ── */}
        {draggingId && dragGhost && (() => {
          const comp = components[draggingId];
          if (!comp) return null;
          const footprint = getComponentFootprint(comp.type, dragGhost.row, dragGhost.col);
          return (
            <g opacity={0.6} pointerEvents="none">
              {footprint.points.map((pt, i) => {
                const pos = gridToPixel(pt);
                return (
                  <circle
                    key={i}
                    cx={pos.x}
                    cy={pos.y}
                    r={5}
                    fill="#3b82f6"
                    stroke="#60a5fa"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          );
        })()}

        {/* ── Ghost preview while placing ── */}
        {interactionMode === "placing" && ghostPos && placingType && placingType !== "wire" && (
          <GhostPreview
            row={ghostPos.row}
            col={ghostPos.col}
            componentType={placingType}
            rotation={placingRotation}
          />
        )}

        {/* ── Wire placement preview (first click done, showing line to cursor) ── */}
        {interactionMode === "placing" && placingType === "wire" && ghostPos && wireStartRef.current && (
          <g pointerEvents="none">
            <line
              x1={gridToPixel(wireStartRef.current).x}
              y1={gridToPixel(wireStartRef.current).y}
              x2={gridToPixel(ghostPos).x}
              y2={gridToPixel(ghostPos).y}
              stroke="#fbbf24"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="4 3"
              opacity={0.8}
            />
            <circle
              cx={gridToPixel(wireStartRef.current).x}
              cy={gridToPixel(wireStartRef.current).y}
              r={4}
              fill="#fbbf24"
              opacity={0.6}
            />
            <circle
              cx={gridToPixel(ghostPos).x}
              cy={gridToPixel(ghostPos).y}
              r={4}
              fill="#fbbf24"
              fillOpacity={0.3}
              stroke="#fbbf24"
              strokeWidth={1}
            />
          </g>
        )}

        {/* ── Wire placement ghost dot (before first click) ── */}
        {interactionMode === "placing" && placingType === "wire" && ghostPos && !wireStartRef.current && (
          <g pointerEvents="none">
            <circle
              cx={gridToPixel(ghostPos).x}
              cy={gridToPixel(ghostPos).y}
              r={4}
              fill="#fbbf24"
              fillOpacity={0.3}
              stroke="#fbbf24"
              strokeWidth={1}
            />
            <text
              x={gridToPixel(ghostPos).x}
              y={gridToPixel(ghostPos).y - 10}
              textAnchor="middle"
              fontSize={7}
              fill="#fbbf24"
              fontFamily="monospace"
            >
              click start
            </text>
          </g>
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
          {interactionMode === "placing" && placingType === "wire"
            ? (wireStartRef.current
              ? "Wire: click end point (Esc to cancel)"
              : "Wire: click start point (Esc to cancel)")
            : interactionMode === "placing"
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
