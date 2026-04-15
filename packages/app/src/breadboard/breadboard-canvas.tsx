import React, { useCallback, useMemo, useRef } from "react";
import { useBoardSelector, BoardContext } from "@/store/board-context";
import {
  BOARD_TARGETS,
  DEFAULT_BOARD_TARGET,
  isBoardComponentType,
  type BoardComponent,
  type ComponentType,
  type LibraryState,
  type Wire,
} from "@dreamer/schemas";
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
  pixelToGrid,
  getComponentFootprint,
  getBoardPinLayout,
  type ArduinoPinInfo,
} from "./breadboard-grid";
import { screenToBoard } from "./breadboard-camera";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { ComponentRenderer } from "./component-renderers/index";
import { WireRenderer } from "./component-renderers/wire-renderer";
import { ArduinoUnoBoard } from "./component-renderers/arduino-uno-renderer";
import { ArduinoAltBoard } from "./component-renderers/arduino-alt-board-renderer";
import { CircuitOverlay } from "./circuit-overlay";
import { EnvironmentOverlay } from "./environment-overlay";
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook";
import { usePinStates } from "@/simulator/use-pin-state";
import { getComponentDef } from "@/components/registry";
import { useBreadboardCamera } from "./use-breadboard-camera";
import { useBreadboardDrag } from "./use-breadboard-drag";
import { useBreadboardWire, getWireColorForPin } from "./use-breadboard-wire";

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

// ── Column letters ──────────────────────────────────────────────
const COL_LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

// ── Breadboard origin helpers ───────────────────────────────────

const TERMINAL_ORIGIN_X = BREADBOARD_OFFSET_X + BOARD_PADDING + RAIL_OFFSET;
const TERMINAL_ORIGIN_Y = BOARD_PADDING + POWER_RAIL_HEIGHT;

// ── Static board background (holes + labels + rails) ────────────

/**
 * A single breadboard hole. Drawn as a tiny well: a dark inset rim
 * gives the illusion of depth, with a slightly lighter inner fill so
 * the metal clip beneath catches the light. Pulled out as its own
 * function so all ~340 holes use the exact same render path.
 */
function Hole({ x, y }: { x: number; y: number }) {
  return (
    <g key={`hole-${x}-${y}`}>
      {/* Dark recess (well) */}
      <circle cx={x} cy={y} r={HOLE_RADIUS + 0.4} fill="#1a1a1a" />
      {/* Inner cavity — slight gradient for depth */}
      <circle cx={x} cy={y} r={HOLE_RADIUS} fill="url(#hole-fill)" />
      {/* Tiny highlight on the upper-left to suggest a metal clip */}
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

function buildBreadboardBackground(): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  // Column letters (a–j) along the top of the terminal area
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
  // Mirror the column letters along the bottom
  const bottomLetterY =
    TERMINAL_ORIGIN_Y + (ROWS - 1) * HOLE_SPACING + 8;
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

  // Row numbers (1, 5, 10, 15, …) inside the center gap, plus mirrored
  // row numbers on the far left and right edges.
  const gapCenterX =
    (gridToPixel({ row: 0, col: 4 }).x + gridToPixel({ row: 0, col: 5 }).x) /
    2;
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

  // Terminal-strip holes (cols 0-9)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(<Hole key={`h-${row}-${col}`} x={x} y={y} />);
    }
  }

  // Power rail holes (cols -2, -1, 10, 11)
  const railCols = [-2, -1, 10, 11];
  for (const col of railCols) {
    for (let row = 0; row < ROWS; row++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(<Hole key={`r-${row}-${col}`} x={x} y={y} />);
    }
  }

  return elements;
}

// ── Power rail stripe decorations ───────────────────────────────

/**
 * The colored guide lines that run alongside each pair of power-rail
 * holes, plus the +/− labels at each end. On a real breadboard these
 * are silkscreened to tell you which column is +V and which is GND.
 */
function PowerRailStripes() {
  const leftPlusX = gridToPixel({ row: 0, col: -2 }).x;
  const leftMinusX = gridToPixel({ row: 0, col: -1 }).x;
  const rightPlusX = gridToPixel({ row: 0, col: 10 }).x;
  const rightMinusX = gridToPixel({ row: 0, col: 11 }).x;

  const topY = gridToPixel({ row: 0, col: -2 }).y;
  const bottomY = gridToPixel({ row: ROWS - 1, col: -2 }).y;
  const stripeInset = 5; // distance from the holes
  const stripeLen = bottomY - topY + 8;
  const stripeStartY = topY - 4;

  // Render order: a soft stripe band, then the colored rule line, then
  // the +/− labels. Doing the band as a thick translucent line + the
  // rule as a thinner solid line gives a "printed-on-plastic" feel.
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
      {renderRail(leftPlusX, "#dc2626", "outer", "+", "left-plus")}
      {renderRail(leftMinusX, "#2563eb", "inner", "−", "left-minus")}
      {renderRail(rightPlusX, "#2563eb", "outer", "−", "right-minus")}
      {renderRail(rightMinusX, "#dc2626", "inner", "+", "right-plus")}
    </g>
  );
}

// ── Ghost footprint preview ─────────────────────────────────────

function GhostPreview({
  row, col, componentType, rotation = 0,
}: {
  row: number; col: number; componentType: ComponentType; rotation?: number;
}) {
  const footprint = getComponentFootprint(componentType, row, col, rotation);

  return (
    <g opacity={0.4} pointerEvents="none">
      {footprint.points.map((pt, i) => {
        const { x, y } = gridToPixel(pt);
        return <circle key={i} cx={x} cy={y} r={5} fill="#3b82f6" stroke="#60a5fa" strokeWidth={1} />;
      })}
      <text
        x={gridToPixel({ row, col }).x} y={gridToPixel({ row, col }).y - 14}
        textAnchor="middle" fontSize={7} fill="#60a5fa" fontFamily="monospace"
      >
        {componentType.replace(/_/g, " ")}
      </text>
    </g>
  );
}

// ── Static background layer ─────────────────────────────────────

const StaticBackground = React.memo(function StaticBackground() {
  const elements = useMemo(() => buildBreadboardBackground(), []);
  const bbX = BREADBOARD_OFFSET_X;
  const gapX = TERMINAL_ORIGIN_X + TERMINAL_WIDTH;
  const gapY = TERMINAL_ORIGIN_Y - 6;
  const gapHeight = (ROWS - 1) * HOLE_SPACING + 12;

  return (
    <g>
      {/* SVG defs for gradients used by the board body, holes, and gap. */}
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

      {/* Soft drop shadow under the board */}
      <rect
        x={bbX + 2}
        y={4}
        width={BREADBOARD_WIDTH}
        height={BREADBOARD_HEIGHT}
        rx={4}
        fill="#000000"
        opacity={0.25}
      />

      {/* Main board body */}
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

      {/* Inner bevel — a thin lighter rect inset slightly */}
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

      {/* Center gap (DIP channel) — recessed look via fill + inner shadow */}
      <rect
        x={gapX + 2}
        y={gapY}
        width={GAP_WIDTH - 4}
        height={gapHeight}
        fill="url(#gap-fill)"
        rx={1.5}
      />
      {/* Top inner shadow on the gap */}
      <line
        x1={gapX + 2}
        y1={gapY}
        x2={gapX + GAP_WIDTH - 2}
        y2={gapY}
        stroke="#000000"
        strokeWidth={0.6}
        opacity={0.18}
      />
      {/* Bottom highlight on the gap */}
      <line
        x1={gapX + 2}
        y1={gapY + gapHeight}
        x2={gapX + GAP_WIDTH - 2}
        y2={gapY + gapHeight}
        stroke="#ffffff"
        strokeWidth={0.6}
        opacity={0.4}
      />

      <PowerRailStripes />
      <g>{elements}</g>
    </g>
  );
});

// ── Wire layer ──────────────────────────────────────────────────

type WireLayerProps = {
  wires: Record<string, import("@dreamer/schemas").Wire>;
  arduinoPins: ArduinoPinInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragEndpoint: (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => void;
};

const WireLayer = React.memo(function WireLayer({ wires, arduinoPins, selectedId, onSelect, onDragEndpoint }: WireLayerProps) {
  const wireList = useMemo(() => Object.values(wires), [wires]);
  return (
    <g>
      {wireList.map((wire) => (
        <WireRenderer key={wire.id} wire={wire}
          arduinoPins={arduinoPins}
          isSelected={selectedId === wire.id} onSelect={onSelect}
          onDragEndpoint={onDragEndpoint} />
      ))}
    </g>
  );
});

// ── Component layer ─────────────────────────────────────────────

type ComponentLayerProps = {
  components: BoardComponent[];
  wires: Record<string, Wire>;
  selectedId: string | null;
  draggingId: string | null;
  analysis: import("@/simulator/circuit-solver").CircuitAnalysis | null;
  libraryState: LibraryState;
  pinStates: import("@dreamer/schemas").PinState[];
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
};

const ComponentLayer = React.memo(function ComponentLayer({
  components, wires, selectedId, draggingId, analysis, libraryState, pinStates,
  onSelect, onDragStart,
}: ComponentLayerProps) {
  return (
    <g>
      {components.map((comp) => {
        const isDragging = draggingId === comp.id;
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties);
        const primaryPos = gridToPixel({ row: comp.y, col: comp.x });
        const rot = comp.rotation ?? 0;

        return (
          <g
            key={comp.id}
            data-id={comp.id}
            onClick={(e) => { e.stopPropagation(); onSelect(comp.id); }}
            onPointerDown={(e) => { if (e.button === 0) { e.stopPropagation(); onDragStart(comp.id, e); } }}
            style={{ cursor: isDragging ? "grabbing" : "pointer" }}
            opacity={isDragging ? 0.35 : 1}
          >
            {selectedId === comp.id && (
              <rect
                x={primaryPos.x - 10} y={primaryPos.y - 10}
                width={footprint.width + 8} height={footprint.height + 8}
                rx={4} fill="none" stroke="#3b82f6"
                strokeWidth={1.5} strokeDasharray="4 2" opacity={0.5}
              />
            )}
            <g transform={rot ? `rotate(${rot * 90}, ${primaryPos.x}, ${primaryPos.y})` : undefined}>
              <ComponentRenderer
                component={comp} components={components}
                pinStates={pinStates}
                wires={wires}
                isSelected={selectedId === comp.id}
                electricalState={analysis?.componentStates.get(comp.id)}
                libraryState={libraryState}
              />
            </g>
          </g>
        );
      })}

      {components.map((comp) => {
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties);
        const accentColor = getAccentColor(comp.type as ComponentType) ?? "#60a5fa";
        return footprint.points.map((pt, i) => {
          const pos = gridToPixel(pt);
          return (
            <circle key={`occ-${comp.id}-${i}`}
              cx={pos.x} cy={pos.y} r={HOLE_RADIUS + 1.5}
              fill="none" stroke={accentColor} strokeWidth={1}
              opacity={0.7} pointerEvents="none" />
          );
        });
      })}
    </g>
  );
});

// ── Main canvas (orchestrator) ──────────────────────────────────

type BreadboardCanvasProps = {
  zoomTick?: number;
  panMode?: boolean;
  /**
   * When true, disables component drag/move, wire placement, area select,
   * delete/cmd+A/rotate shortcuts, and multi-select. Camera pan and wheel
   * zoom still work, and component-level interactions that stop propagation
   * (button press, sensor sliders) still fire. Used by <BreadboardEmbed>.
   */
  readOnly?: boolean;
};

function BreadboardCanvasInner({ zoomTick: _zoomTick, panMode, readOnly }: BreadboardCanvasProps) {
  const components = useBoardSelector((s) => s.components);
  const wires = useBoardSelector((s) => s.wires);
  const pinStates = usePinStates();
  const selectedId = useBoardSelector((s) => s.selectedId);
  const libraryState = useBoardSelector((s) => s.libraryState);
  const boardTarget = useBoardSelector((s) => s.boardTarget ?? DEFAULT_BOARD_TARGET);
  const environment = useBoardSelector((s) => s.environment);
  const send = BoardContext.useActorRef().send;

  const svgRef = useRef<SVGSVGElement>(null);

  const { analysis } = useCircuitAnalysis();

  // ── Extracted hooks (all interaction state lives in the XState machine) ──
  const camera = useBreadboardCamera({ svgRef, panMode });
  const drag = useBreadboardDrag({ svgRef, components, send });
  const wire = useBreadboardWire({ svgRef, send, boardTarget });
  const pinLayout = useMemo(() => getBoardPinLayout(boardTarget), [boardTarget]);

  const filteredComponents = useMemo(
    () => Object.values(components).filter((c) => !isBoardComponentType(c.type)),
    [components],
  );

  // ── Area selection state ───────────────────────────────────────
  const areaSelectRef = useRef<{ startX: number; startY: number } | null>(null);
  const [areaRect, setAreaRect] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [multiSelected, setMultiSelected] = React.useState<Set<string>>(new Set());

  // ── Wire endpoint drag state ───────────────────────────────��──
  const wireDragRef = useRef<{ wireId: string; endpoint: "from" | "to" } | null>(null);
  const [wireDragGhost, setWireDragGhost] = React.useState<{ row: number; col: number } | null>(null);

  const handleWireEndpointDragStart = useCallback(
    (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => {
      if (readOnly) return;
      wireDragRef.current = { wireId, endpoint };
      const w = wires[wireId];
      if (!w) return;
      if (endpoint === "from") {
        setWireDragGhost({ row: w.fromRow, col: w.fromCol });
      } else {
        setWireDragGhost({ row: w.toRow, col: w.toCol });
      }
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [wires, readOnly],
  );

  // ── Unified pointer handlers ──────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (camera.shouldStartPan(e)) {
        camera.startPan(e);
        return;
      }

      // In read-only embed mode, only camera pan is allowed. Component
      // button/slider interactions still fire via stopPropagation on child
      // elements.
      if (readOnly) return;

      if (e.button === 0 && wire.handlePlacementPointerDown(e)) return;

      // Multimeter placement — uses the same click-twice flow as wires.
      // First click sets probe A, second click sets probe B and creates
      // the component with both probe positions baked into properties.
      if (
        e.button === 0 &&
        wire.interactionMode === "placing" &&
        wire.placingType === "multimeter"
      ) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);

        const snap = breadboardInteractionActor.getSnapshot();
        if (!snap.context.wireStartSet) {
          // First click — anchor probe A
          breadboardInteractionActor.send({
            type: "SET_WIRE_START",
            row: grid.row,
            col: grid.col,
          });
          return;
        }

        // Second click — create the multimeter component
        const probeARow = snap.context.fromRow!;
        const probeACol = snap.context.fromCol!;
        if (probeARow === grid.row && probeACol === grid.col) {
          // Same hole twice — ignore so the user can't create a meter with
          // both probes on the same point (which would always read 0V).
          return;
        }
        const component: BoardComponent = {
          id: crypto.randomUUID(),
          type: "multimeter",
          name: "Multimeter",
          x: probeACol,
          y: probeARow,
          rotation: 0,
          pins: getDefaultPins("multimeter"),
          properties: {
            ...getDefaultProperties("multimeter"),
            probeBRow: grid.row,
            probeBCol: grid.col,
          },
        };
        send({ type: "PLACE_COMPONENT", component });
        breadboardInteractionActor.send({ type: "POINTER_UP" });
        return;
      }

      // Component placement (non-wire, non-multimeter)
      if (e.button === 0 && wire.interactionMode === "placing" && wire.placingType && wire.placingType !== "wire") {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);

        const component: BoardComponent = {
          id: crypto.randomUUID(),
          type: wire.placingType,
          name: wire.placingType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          x: grid.col,
          y: grid.row,
          rotation: breadboardInteractionActor.getSnapshot().context.placingRotation,
          pins: getDefaultPins(wire.placingType),
          properties: getDefaultProperties(wire.placingType),
        };

        send({ type: "PLACE_COMPONENT", component });
        breadboardInteractionActor.send({ type: "POINTER_UP" });
        return;
      }

      // Left click on empty space → start area select or deselect
      if (e.button === 0 && e.target === svgRef.current) {
        // Clear previous selections
        send({ type: "SELECT", id: null });
        setMultiSelected(new Set());

        // Start area selection drag
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
          areaSelectRef.current = { startX: board.x, startY: board.y };
          svgRef.current?.setPointerCapture(e.pointerId);
        }
      }
    },
    [send, camera, wire, readOnly],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (camera.handlePanMove(e)) return;

      // Wire endpoint drag
      if (wireDragRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);
        setWireDragGhost(grid);
        return;
      }

      // Area selection drag
      if (areaSelectRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
          const sx = areaSelectRef.current.startX;
          const sy = areaSelectRef.current.startY;
          setAreaRect({
            x: Math.min(sx, board.x),
            y: Math.min(sy, board.y),
            w: Math.abs(board.x - sx),
            h: Math.abs(board.y - sy),
          });
        }
        return;
      }

      if (drag.handleDragMove(e)) return;
      wire.handlePlacementMove(e);
    },
    [camera, drag, wire],
  );

  const handlePointerUp = useCallback(() => {
    camera.stopPan();

    // Complete area selection
    if (areaSelectRef.current && areaRect && areaRect.w > 3 && areaRect.h > 3) {
      const selected = new Set<string>();
      // Find components inside the area rect
      for (const comp of filteredComponents) {
        const pos = gridToPixel({ row: comp.y, col: comp.x });
        if (pos.x >= areaRect.x && pos.x <= areaRect.x + areaRect.w &&
            pos.y >= areaRect.y && pos.y <= areaRect.y + areaRect.h) {
          selected.add(comp.id);
        }
      }
      // Find wires inside the area rect
      for (const w of Object.values(wires)) {
        const to = gridToPixel({ row: w.toRow, col: w.toCol });
        if (to.x >= areaRect.x && to.x <= areaRect.x + areaRect.w &&
            to.y >= areaRect.y && to.y <= areaRect.y + areaRect.h) {
          selected.add(w.id);
        }
      }
      setMultiSelected(selected);
      areaSelectRef.current = null;
      setAreaRect(null);
      return;
    }
    areaSelectRef.current = null;
    setAreaRect(null);

    // Complete wire endpoint drag
    if (wireDragRef.current && wireDragGhost) {
      const { wireId, endpoint } = wireDragRef.current;
      const w = wires[wireId];
      if (w) {
        const origRow = endpoint === "from" ? w.fromRow : w.toRow;
        const origCol = endpoint === "from" ? w.fromCol : w.toCol;
        if (wireDragGhost.row !== origRow || wireDragGhost.col !== origCol) {
          if (endpoint === "from") {
            send({ type: "UPDATE_WIRE", id: wireId, changes: { fromRow: wireDragGhost.row, fromCol: wireDragGhost.col } });
          } else {
            send({ type: "UPDATE_WIRE", id: wireId, changes: { toRow: wireDragGhost.row, toCol: wireDragGhost.col } });
          }
        }
      }
      wireDragRef.current = null;
      setWireDragGhost(null);
      return;
    }

    drag.handleDragEnd();
  }, [camera, drag, wires, wireDragGhost, send]);

  // ── Keyboard ──────────────────────────────────────────────────

  React.useEffect(() => {
    const componentsRef = components;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      camera.onKeyDown(e);

      // Read-only: skip all editing shortcuts (delete, select-all, rotate).
      if (readOnly) return;

      if (e.code === "Escape") {
        drag.cancelDrag();
        wire.cancelPlacement();
        wireDragRef.current = null;
        setWireDragGhost(null);
        areaSelectRef.current = null;
        setAreaRect(null);
        setMultiSelected(new Set());
      }

      // Cmd+A: select all components and wires
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyA") {
        e.preventDefault();
        const all = new Set<string>();
        for (const c of Object.values(componentsRef)) {
          if (!isBoardComponentType(c.type)) all.add(c.id);
        }
        for (const wId of Object.keys(wires)) {
          all.add(wId);
        }
        setMultiSelected(all);
        return;
      }

      // Delete/Backspace: batch delete multi-selected items
      if ((e.code === "Delete" || e.code === "Backspace") && multiSelected.size > 0) {
        e.preventDefault();
        send({ type: "SNAPSHOT" });
        for (const id of multiSelected) {
          if (id in componentsRef) {
            send({ type: "REMOVE_COMPONENT", id });
          } else {
            send({ type: "REMOVE_WIRE", id });
          }
        }
        setMultiSelected(new Set());
        return;
      }

      if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey) {
        if (wire.interactionMode === "placing") {
          wire.rotatePlacement();
        } else if (selectedId) {
          const comp = componentsRef[selectedId];
          if (comp && !isBoardComponentType(comp.type) && comp.type !== "wire") {
            send({ type: "UPDATE_COMPONENT", id: selectedId, changes: { rotation: ((comp.rotation ?? 0) + 1) % 4 } });
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      camera.onKeyUp(e);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedId, components, wires, send, camera, drag, wire, multiSelected, readOnly]);

  const handleComponentClick = useCallback(
    (id: string) => {
      if (readOnly) return;
      send({ type: "SELECT", id });
    },
    [send, readOnly],
  );

  const noopDragStart = useCallback((_id: string, _e: React.PointerEvent) => {}, []);

  const cam = camera.camera;

  const cursorClass =
    panMode
      ? "cursor-grab"
      : wire.interactionMode === "placing"
        ? "cursor-copy"
        : wire.interactionMode === "dragging"
          ? "cursor-grabbing"
          : wire.interactionMode === "wiring_from_pin"
            ? "cursor-crosshair"
            : "cursor-crosshair";

  return (
    <svg
      ref={svgRef}
      className={`h-full w-full bg-neutral-900 ${cursorClass}`}
      onWheel={camera.handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <g transform={`translate(${cam.offsetX}, ${cam.offsetY}) scale(${cam.zoom})`}>
        {boardTarget === "arduino_uno" ? (
          <ArduinoUnoBoard
            onStartWireFromPin={wire.handleStartWireFromPin}
            wiringFromPin={wire.wiringFromPin}
            boardLabel={BOARD_TARGETS[boardTarget].label}
            digitalPins={pinLayout.digitalPins}
            analogPins={pinLayout.analogPins}
            powerPins={pinLayout.powerPins}
          />
        ) : (
          <ArduinoAltBoard
            boardTarget={boardTarget}
            onStartWireFromPin={wire.handleStartWireFromPin}
            wiringFromPin={wire.wiringFromPin}
            boardLabel={BOARD_TARGETS[boardTarget].label}
            digitalPins={pinLayout.digitalPins}
            analogPins={pinLayout.analogPins}
            powerPins={pinLayout.powerPins}
          />
        )}

        <StaticBackground />

        <WireLayer wires={wires} arduinoPins={pinLayout.allPins} selectedId={selectedId} onSelect={handleComponentClick}
          onDragEndpoint={handleWireEndpointDragStart} />

        <ComponentLayer
          components={filteredComponents}
          wires={wires}
          selectedId={selectedId}
          draggingId={drag.draggingId}
          analysis={analysis}
          libraryState={libraryState}
          pinStates={pinStates}
          onSelect={handleComponentClick}
          onDragStart={readOnly ? noopDragStart : drag.handleDragStart}
        />

        {analysis && analysis.isValid && (
          <CircuitOverlay analysis={analysis} components={filteredComponents} />
        )}

        <EnvironmentOverlay environment={environment} components={filteredComponents} />

        {/* Drag ghost preview */}
        {drag.draggingId && drag.dragGhost && (() => {
          const comp = components[drag.draggingId];
          if (!comp) return null;
          const footprint = getComponentFootprint(comp.type, drag.dragGhost.row, drag.dragGhost.col);
          return (
            <g opacity={0.6} pointerEvents="none">
              {footprint.points.map((pt, i) => {
                const pos = gridToPixel(pt);
                return <circle key={i} cx={pos.x} cy={pos.y} r={5} fill="#3b82f6" stroke="#60a5fa" strokeWidth={1} />;
              })}
            </g>
          );
        })()}

        {/* Wire endpoint drag ghost */}
        {wireDragRef.current && wireDragGhost && (() => {
          const pos = gridToPixel(wireDragGhost);
          return (
            <g pointerEvents="none">
              <circle cx={pos.x} cy={pos.y} r={5} fill="#3b82f6" fillOpacity={0.3}
                stroke="#3b82f6" strokeWidth={1.5} />
              <circle cx={pos.x} cy={pos.y} r={2} fill="#3b82f6" />
            </g>
          );
        })()}

        {/* Ghost preview while placing — skipped for wire and multimeter,
            both of which use the click-twice flow with their own preview. */}
        {wire.interactionMode === "placing" && wire.ghostPos && wire.placingType && wire.placingType !== "wire" && wire.placingType !== "multimeter" && (
          <GhostPreview
            row={wire.ghostPos.row} col={wire.ghostPos.col}
            componentType={wire.placingType} rotation={wire.placingRotation}
          />
        )}

        {/* Wire placement preview (first click done) */}
        {wire.interactionMode === "placing" && wire.placingType === "wire" && wire.ghostPos && wire.wireStart && (() => {
          const startPos = gridToPixel(wire.wireStart);
          const endPos = gridToPixel(wire.ghostPos);
          return (
            <g pointerEvents="none">
              <line x1={startPos.x} y1={startPos.y} x2={endPos.x} y2={endPos.y}
                stroke="#fbbf24" strokeWidth={2.5} strokeLinecap="round"
                strokeDasharray="4 3" opacity={0.8} />
              <circle cx={startPos.x} cy={startPos.y} r={4} fill="#fbbf24" opacity={0.6} />
              <circle cx={endPos.x} cy={endPos.y} r={4} fill="#fbbf24"
                fillOpacity={0.3} stroke="#fbbf24" strokeWidth={1} />
            </g>
          );
        })()}

        {/* Wire placement ghost dot (before first click) */}
        {wire.interactionMode === "placing" && wire.placingType === "wire" && wire.ghostPos && !wire.wireStart && (() => {
          const pos = gridToPixel(wire.ghostPos);
          return (
            <g pointerEvents="none">
              <circle cx={pos.x} cy={pos.y} r={4} fill="#fbbf24"
                fillOpacity={0.3} stroke="#fbbf24" strokeWidth={1} />
              <text x={pos.x} y={pos.y - 10} textAnchor="middle"
                fontSize={7} fill="#fbbf24" fontFamily="monospace">
                click start
              </text>
            </g>
          );
        })()}

        {/* Multimeter placement: ghost before first click */}
        {wire.interactionMode === "placing" && wire.placingType === "multimeter" && wire.ghostPos && !wire.wireStart && (() => {
          const pos = gridToPixel(wire.ghostPos);
          return (
            <g pointerEvents="none">
              <circle cx={pos.x} cy={pos.y} r={5} fill="#ef4444" fillOpacity={0.35} stroke="#ef4444" strokeWidth={1.2} />
              <text x={pos.x} y={pos.y - 10} textAnchor="middle"
                fontSize={6} fill="#ef4444" fontFamily="monospace">
                click probe A (+)
              </text>
            </g>
          );
        })()}

        {/* Multimeter placement: preview line after first click */}
        {wire.interactionMode === "placing" && wire.placingType === "multimeter" && wire.ghostPos && wire.wireStart && (() => {
          const startPos = gridToPixel(wire.wireStart);
          const endPos = gridToPixel(wire.ghostPos);
          return (
            <g pointerEvents="none">
              <line x1={startPos.x} y1={startPos.y} x2={endPos.x} y2={endPos.y}
                stroke="#fbbf24" strokeWidth={2} strokeLinecap="round"
                strokeDasharray="3 3" opacity={0.8} />
              <circle cx={startPos.x} cy={startPos.y} r={4} fill="#ef4444" opacity={0.7} />
              <circle cx={endPos.x} cy={endPos.y} r={4} fill="#1f2937" fillOpacity={0.5}
                stroke="#1f2937" strokeWidth={1.2} />
              <text x={endPos.x} y={endPos.y - 10} textAnchor="middle"
                fontSize={6} fill="#9ca3af" fontFamily="monospace">
                click probe B (−)
              </text>
            </g>
          );
        })()}

        {/* Wire preview while wiring from Arduino pin */}
        {wire.interactionMode === "wiring_from_pin" && wire.wiringFromPin && wire.ghostPos && (() => {
          const previewColor = getWireColorForPin(wire.wiringFromPin);
          const targetPos = gridToPixel(wire.ghostPos);
          return (
            <g pointerEvents="none">
              <line x1={wire.wireFromPos.x} y1={wire.wireFromPos.y}
                x2={targetPos.x} y2={targetPos.y}
                stroke={previewColor} strokeWidth={2}
                strokeDasharray="4 2" opacity={0.8} />
              <circle cx={targetPos.x} cy={targetPos.y} r={4}
                fill={previewColor} fillOpacity={0.3}
                stroke={previewColor} strokeWidth={1} />
              <circle cx={wire.wireFromPos.x} cy={wire.wireFromPos.y} r={5}
                fill="none" stroke={previewColor} strokeWidth={1.5} opacity={0.6} />
            </g>
          );
        })()}
      </g>

        {/* Area selection rectangle */}
        {areaRect && areaRect.w > 1 && areaRect.h > 1 && (
          <rect
            x={areaRect.x}
            y={areaRect.y}
            width={areaRect.w}
            height={areaRect.h}
            fill="#3b82f6"
            fillOpacity={0.08}
            stroke="#3b82f6"
            strokeWidth={1}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

        {/* Multi-selection highlights */}
        {multiSelected.size > 0 && filteredComponents
          .filter((c) => multiSelected.has(c.id))
          .map((comp) => {
            const pos = gridToPixel({ row: comp.y, col: comp.x });
            return (
              <rect
                key={`sel-${comp.id}`}
                x={pos.x - 12}
                y={pos.y - 12}
                width={24}
                height={24}
                rx={4}
                fill="#3b82f6"
                fillOpacity={0.15}
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="3 2"
                pointerEvents="none"
              />
            );
          })
        }

      {/* Mode indicator */}
      {wire.interactionMode !== "idle" && (
        <text x={10} y={20} fontSize={11} fill="#60a5fa" fontFamily="monospace">
          {wire.interactionMode === "placing" && wire.placingType === "wire"
            ? (wire.wireStart
              ? "Wire: click end point (Esc to cancel)"
              : "Wire: click start point (Esc to cancel)")
            : wire.interactionMode === "placing"
              ? `Placing: ${wire.placingType} (click to place, Esc to cancel)`
              : wire.interactionMode === "wiring_from_pin" && wire.wiringFromPin
              ? `Wiring from ${wire.wiringFromPin.label} (click breadboard hole to connect, Esc to cancel)`
              : wire.interactionMode}
        </text>
      )}

      {/* Multi-selection count indicator */}
      {multiSelected.size > 0 && (
        <text x={10} y={20} fontSize={11} fill="#60a5fa" fontFamily="monospace">
          {multiSelected.size} selected — Delete to remove, Esc to deselect
        </text>
      )}
    </svg>
  );
}

export const BreadboardCanvas = React.memo(BreadboardCanvasInner);
