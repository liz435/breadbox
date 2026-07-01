import React, { useCallback, useMemo, useRef } from "react";
import { useBoardSelector, BoardContext } from "@/store/board-context";
import {
  BOARD_TARGETS,
  DEFAULT_BOARD_TARGET,
  isBoardComponentType,
  type BoardComponent,
  type ComponentType,
  type PlaceableComponentType,
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
  isOnBoard,
  getComponentFootprint,
  getBoardPinLayout,
  type ArduinoPinInfo,
} from "./breadboard-grid";
import { screenToBoard, fitBbox } from "./breadboard-camera";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { simulationRef } from "@/simulator/simulation-ref";
import { ComponentRenderer } from "./component-renderers/index";
import { BreadboardDefs } from "@/components/catalog/breadboard-full/breadboard-renderer";
import { WireRenderer } from "./component-renderers/wire-renderer";
import { ArduinoUnoBoard } from "./component-renderers/arduino-uno-renderer";
import { ArduinoAltBoard } from "./component-renderers/arduino-alt-board-renderer";
import { CircuitOverlay } from "./circuit-overlay";
import { EnvironmentOverlay } from "./environment-overlay";
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook";
import { usePinStates } from "@/simulator/use-pin-state";
import { getComponentDef } from "@/components/registry";
import { useBreadboardCamera } from "./use-breadboard-camera";
import { useBreadboardDrag, boardAtPoint } from "./use-breadboard-drag";
import { useBreadboardWire, getWireColorForPin } from "./use-breadboard-wire";

// ── Registry-driven helpers ──────────────────────────────────────

function getDefaultPins(type: PlaceableComponentType): Record<string, number | null> {
  return { ...(getComponentDef(type)?.defaultPins ?? {}) };
}

function getDefaultProperties(type: PlaceableComponentType): Record<string, unknown> {
  return { ...(getComponentDef(type)?.defaultProperties ?? {}) };
}

function getAccentColor(type: PlaceableComponentType): string | undefined {
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
//
// Shows where the component will appear: a faded render of the actual
// component (so the user sees the body, not just the pin dots), plus
// highlighted pin-hole circles for emphasis.

function GhostPreview({
  row, col, componentType, rotation = 0,
}: {
  row: number; col: number; componentType: PlaceableComponentType; rotation?: number;
}) {
  const footprint = getComponentFootprint(componentType, row, col, rotation);

  // Build a preview component so the real renderer shows the body in the
  // correct location (some components offset their body from the pin column).
  const previewComponent: BoardComponent = {
    id: "__ghost__",
    type: componentType,
    name: componentType.replace(/_/g, " "),
    x: col,
    y: row,
    rotation,
    pins: getDefaultPins(componentType),
    properties: getDefaultProperties(componentType),
  };

  return (
    <g pointerEvents="none">
      {/* Faded body: the actual renderer, dimmed */}
      <g opacity={0.4}>
        <ComponentRenderer
          component={previewComponent}
          components={[previewComponent]}
          pinStates={[]}
          wires={{}}
          isSelected={false}
        />
      </g>
      {/* Highlighted pin markers over the top */}
      {footprint.points.map((pt, i) => {
        const { x, y } = gridToPixel(pt);
        return <circle key={i} cx={x} cy={y} r={5} fill="#3b82f6" stroke="#60a5fa" strokeWidth={1} opacity={0.7} />;
      })}
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
      {/* SVG defs rendered once at the canvas root via <BreadboardDefs />. */}

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
  surfaceBoards: BoardComponent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragEndpoint: (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => void;
};

const WireLayer = React.memo(function WireLayer({ wires, arduinoPins, surfaceBoards, selectedId, onSelect, onDragEndpoint }: WireLayerProps) {
  const wireList = useMemo(() => Object.values(wires), [wires]);
  return (
    <g>
      {wireList.map((wire) => (
        <WireRenderer key={wire.id} wire={wire}
          arduinoPins={arduinoPins}
          surfaceBoards={surfaceBoards}
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
  /** Parent-board pixel offset per component id (worldX, worldY of parent BB). */
  parentOffsets: Map<string, { dx: number; dy: number }>;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
};

const ComponentLayer = React.memo(function ComponentLayer({
  components, wires, selectedId, draggingId, analysis, libraryState, pinStates, parentOffsets,
  onSelect, onDragStart,
}: ComponentLayerProps) {
  return (
    <g>
      {components.map((comp) => {
        const isDragging = draggingId === comp.id;
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties);
        const primaryPos = gridToPixel({ row: comp.y, col: comp.x });
        const rot = comp.rotation ?? 0;
        const { dx: parentDx, dy: parentDy } = parentOffsets.get(comp.id) ?? { dx: 0, dy: 0 };
        const parentTransform = parentDx !== 0 || parentDy !== 0
          ? `translate(${parentDx}, ${parentDy})`
          : undefined;

        return (
          <g
            key={comp.id}
            data-id={comp.id}
            onClick={(e) => { e.stopPropagation(); onSelect(comp.id); }}
            onPointerDown={(e) => { if (e.button === 0) { e.stopPropagation(); onDragStart(comp.id, e); } }}
            style={{ cursor: isDragging ? "grabbing" : "pointer" }}
            opacity={isDragging ? 0.35 : 1}
            transform={parentTransform}
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
        const { dx: parentDx, dy: parentDy } = parentOffsets.get(comp.id) ?? { dx: 0, dy: 0 };
        return footprint.points.map((pt, i) => {
          const pos = gridToPixel(pt);
          return (
            <circle key={`occ-${comp.id}-${i}`}
              cx={pos.x + parentDx} cy={pos.y + parentDy} r={HOLE_RADIUS + 1.5}
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
  // Poll the shared simulation status at 10fps so the canvas locks
  // structural edits while the sketch is running. Environment obstacles
  // (walls/boxes) manage their own pointer handlers and remain draggable.
  // Component-level interactions (button press, sliders) use
  // stopPropagation and keep firing.
  const [, tickSimRender] = React.useReducer((c: number) => c + 1, 0);
  React.useEffect(() => {
    const id = setInterval(tickSimRender, 100);
    return () => clearInterval(id);
  }, []);
  const simStatus = simulationRef.current?.status;
  const isRunning = simStatus === "running" || simStatus === "paused";
  const effectiveReadOnly = Boolean(readOnly) || isRunning;

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
  const wire = useBreadboardWire({ svgRef, send, boardTarget });
  const pinLayout = useMemo(() => getBoardPinLayout(boardTarget), [boardTarget]);

  const filteredComponents = useMemo(
    () => Object.values(components).filter((c) => !isBoardComponentType(c.type)),
    [components],
  );

  // Board-type components in `components{}`. Today this is the explicit
  // breadboard (and any perfboards) added by the migration. The Arduino
  // board is rendered separately by <ArduinoUnoBoard> / <ArduinoAltBoard>
  // and is excluded from this list.
  const surfaceBoardComponents = useMemo(
    () => Object.values(components).filter(
      (c) => c.type === "breadboard_full" || c.type === "perfboard_generic",
    ),
    [components],
  );

  const drag = useBreadboardDrag({ svgRef, components, surfaceBoards: surfaceBoardComponents, send });

  // ── Board drag state ────────────────────────────────────────────
  // Declared early because parentOffsets / surfaceBoardsForRender below
  // fold the live in-flight delta in. Tracks an in-flight drag of a
  // board-type component (breadboard/perfboard); kept out of the XState
  // machine because it operates in world coords (not grid coords) and
  // dispatches UPDATE_COMPONENT directly. Live position is mirrored into a
  // local React state so the renderer can show the moving board without
  // committing a store update per frame; the final position is committed
  // in pointerUp.
  const boardDragRef = useRef<{
    boardId: string;
    startWorldX: number;
    startWorldY: number;
    startPointerBoardX: number;
    startPointerBoardY: number;
  } | null>(null);
  const [boardDragOffset, setBoardDragOffset] = React.useState<{ id: string; dx: number; dy: number } | null>(null);

  // Maps each non-board component id to its parent board's pixel offset
  // (worldX, worldY) so the component renders attached to a moved board.
  // Includes the live in-flight drag delta so children visually follow the
  // board while the user is still holding the pointer.
  const parentOffsets = useMemo(() => {
    const map = new Map<string, { dx: number; dy: number }>();
    // Legacy scenes (and components placed before multi-board parenting) can
    // lack a parentId. When exactly one surface board exists, treat it as the
    // implicit parent so those components still travel with it — mirrors the
    // diagram-adapter's single-board defaulting. Board-type components carry
    // their own world position and are skipped.
    const soleBoardId =
      surfaceBoardComponents.length === 1 ? surfaceBoardComponents[0].id : null;
    for (const comp of Object.values(components)) {
      if (isBoardComponentType(comp.type)) continue;
      const parentId = comp.parentId ?? soleBoardId;
      if (!parentId) continue;
      const parent = components[parentId];
      if (!parent) continue;
      const isLiveDrag = boardDragOffset?.id === parent.id;
      const liveDx = isLiveDrag ? boardDragOffset.dx : 0;
      const liveDy = isLiveDrag ? boardDragOffset.dy : 0;
      const dx = (parent.worldX ?? 0) + liveDx;
      const dy = (parent.worldY ?? 0) + liveDy;
      if (dx !== 0 || dy !== 0) {
        map.set(comp.id, { dx, dy });
      }
    }
    return map;
  }, [components, surfaceBoardComponents, boardDragOffset]);

  // Surface boards with the in-flight drag delta folded in. Passed to the
  // WireLayer so wire endpoints follow the board live while it's being
  // dragged (without this, wires snap back to the stored position until
  // pointer-up).
  const surfaceBoardsForRender = useMemo(() => {
    if (!boardDragOffset) return surfaceBoardComponents;
    return surfaceBoardComponents.map((b) =>
      b.id === boardDragOffset.id
        ? { ...b, worldX: (b.worldX ?? 0) + boardDragOffset.dx, worldY: (b.worldY ?? 0) + boardDragOffset.dy }
        : b,
    );
  }, [surfaceBoardComponents, boardDragOffset]);

  // Frame all surface boards on first mount (and on subsequent count changes
  // that the user opts into via the home key). Skipping when no boards exist
  // keeps the legacy fallback path's camera behaviour unchanged.
  const didInitialFitRef = useRef(false);
  React.useEffect(() => {
    if (didInitialFitRef.current) return;
    if (surfaceBoardComponents.length === 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xs = surfaceBoardComponents.map((b) => (b.worldX ?? 0) + BREADBOARD_OFFSET_X);
    const ys = surfaceBoardComponents.map((b) => b.worldY ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x) => x + BREADBOARD_WIDTH));
    const maxY = Math.max(...ys.map((y) => y + BREADBOARD_HEIGHT));
    fitBbox(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      { width: rect.width, height: rect.height },
    );
    camera.forceUpdate();
    didInitialFitRef.current = true;
  }, [surfaceBoardComponents, camera]);

  // ── Area selection state ───────────────────────────────────────
  const areaSelectRef = useRef<{ startX: number; startY: number } | null>(null);
  const [areaRect, setAreaRect] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [multiSelected, setMultiSelected] = React.useState<Set<string>>(new Set());

  // ── Wire endpoint drag state ───────────────────────────────��──
  const wireDragRef = useRef<{ wireId: string; endpoint: "from" | "to" } | null>(null);
  const [wireDragGhost, setWireDragGhost] = React.useState<{ row: number; col: number } | null>(null);

  // ── Drag-to-wire state (pull a fresh wire straight out of a hole) ──
  const newWireRef = useRef<{ fromRow: number; fromCol: number } | null>(null);
  const [newWireGhost, setNewWireGhost] = React.useState<{ row: number; col: number } | null>(null);

  const handleBoardPointerDown = useCallback(
    (boardId: string, e: React.PointerEvent) => {
      if (effectiveReadOnly) return;
      if (e.button !== 0) return;
      // Don't swallow the event while the user is placing a new component
      // from the palette — the canvas-level placement handler needs to see
      // it. Same for wire placement.
      const snap = breadboardInteractionActor.getSnapshot();
      if (snap.context.mode === "placing" || snap.context.mode === "wiring") return;
      e.stopPropagation();
      const comp = components[boardId];
      if (!comp) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
      boardDragRef.current = {
        boardId,
        startWorldX: comp.worldX ?? 0,
        startWorldY: comp.worldY ?? 0,
        startPointerBoardX: board.x,
        startPointerBoardY: board.y,
      };
      setBoardDragOffset({ id: boardId, dx: 0, dy: 0 });
      send({ type: "SELECT", id: boardId });
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [components, effectiveReadOnly, send],
  );

  const handleWireEndpointDragStart = useCallback(
    (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => {
      if (effectiveReadOnly) return;
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
    [wires, effectiveReadOnly],
  );

  // ── Unified pointer handlers ──────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (camera.shouldStartPan(e)) {
        camera.startPan(e);
        return;
      }

      // In read-only embed mode (or while the sketch is running), block
      // structural edits — wire/component placement, drag-to-move, and
      // area selection. Non-destructive things still work: camera pan
      // (handled above), component click-to-select (handleComponentClick
      // has no gate), clicking empty space to deselect (handled below),
      // environment obstacle drag (its own pointer handlers), and
      // component button/slider interactions via stopPropagation.
      if (effectiveReadOnly) {
        if (e.button === 0 && e.target === svgRef.current) {
          send({ type: "SELECT", id: null });
          setMultiSelected(new Set());
        }
        return;
      }

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

        const placingType = wire.placingType;
        const isSurfaceBoard = placingType === "breadboard_full" || placingType === "perfboard_generic";

        // Sequential ids for boards match the convention seeded by the
        // migration script (breadboard-1, perfboard-1, ...).
        const idPrefix = isSurfaceBoard
          ? (placingType === "breadboard_full" ? "breadboard" : "perfboard")
          : null;
        const nextSequentialId = (prefix: string): string => {
          let n = 1;
          while (components[`${prefix}-${n}`]) n += 1;
          return `${prefix}-${n}`;
        };

        // Attach non-board components to whichever surface board they land on,
        // so they travel with it when the board is dragged. Grid coords are
        // stored local to that board's origin (mirrors handleDragEnd). Falls
        // back to the global grid + no parent for legacy single-board scenes
        // that have no explicit surface board in components{}.
        const overBoard = isSurfaceBoard
          ? null
          : boardAtPoint(board.x, board.y, surfaceBoardComponents);
        const localGrid = overBoard
          ? pixelToGrid(board.x - (overBoard.worldX ?? 0), board.y - (overBoard.worldY ?? 0))
          : grid;

        const component: BoardComponent = {
          id: idPrefix ? nextSequentialId(idPrefix) : crypto.randomUUID(),
          type: placingType,
          name: placingType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          x: isSurfaceBoard ? 0 : localGrid.col,
          y: isSurfaceBoard ? 0 : localGrid.row,
          rotation: breadboardInteractionActor.getSnapshot().context.placingRotation,
          pins: getDefaultPins(placingType),
          properties: getDefaultProperties(placingType),
          ...(isSurfaceBoard
            ? { parentId: null, worldX: board.x - BREADBOARD_OFFSET_X, worldY: board.y }
            : overBoard
              ? { parentId: overBoard.id }
              : {}),
        };

        send({ type: "PLACE_COMPONENT", component });
        breadboardInteractionActor.send({ type: "POINTER_UP" });
        return;
      }

      // Drag-to-wire: in idle mode, pressing on a breadboard hole and
      // dragging pulls a fresh wire straight out of that hole. Releasing
      // over another hole creates the wire. This is the direct-manipulation
      // path; the wire tool (placing/"wire") still works via click-twice.
      if (e.button === 0 && wire.interactionMode === "idle") {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
          const grid = pixelToGrid(board.x, board.y);
          if (isOnBoard(grid)) {
            const holePos = gridToPixel(grid);
            const hit = Math.hypot(board.x - holePos.x, board.y - holePos.y);
            // Require the press to land on (not merely near) a hole, so a
            // drag across the bare plastic still falls through to area-select.
            if (hit <= HOLE_SPACING * 0.6) {
              newWireRef.current = { fromRow: grid.row, fromCol: grid.col };
              setNewWireGhost(grid);
              svgRef.current?.setPointerCapture(e.pointerId);
              send({ type: "SELECT", id: null });
              setMultiSelected(new Set());
              return;
            }
          }
        }
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
    [send, camera, wire, effectiveReadOnly, components],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (camera.handlePanMove(e)) return;

      // Drag-to-wire (fresh wire pulled from a hole)
      if (newWireRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        setNewWireGhost(pixelToGrid(board.x, board.y));
        return;
      }

      // Wire endpoint drag
      if (wireDragRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const grid = pixelToGrid(board.x, board.y);
        setWireDragGhost(grid);
        return;
      }

      // Board drag (breadboard / perfboard)
      if (boardDragRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
        const d = boardDragRef.current;
        let dx = board.x - d.startPointerBoardX;
        let dy = board.y - d.startPointerBoardY;

        // Candidate world position for the dragged board.
        const candWorldX = d.startWorldX + dx;
        const candWorldY = d.startWorldY + dy;
        // AABB in legacy world coords (the renderer paints from
        // worldX + BREADBOARD_OFFSET_X).
        const candLeft = candWorldX + BREADBOARD_OFFSET_X;
        const candRight = candLeft + BREADBOARD_WIDTH;
        const candTop = candWorldY;
        const candBottom = candTop + BREADBOARD_HEIGHT;

        // Edge / row snap (Q18 c): within threshold of another board's left
        // or right edge, magnetise so they sit flush; align rows so cross-
        // board jumpers stay parallel.
        const SNAP = 8;
        let snappedDx = dx;
        let snappedDy = dy;
        for (const other of surfaceBoardComponents) {
          if (other.id === d.boardId) continue;
          const oLeft = (other.worldX ?? 0) + BREADBOARD_OFFSET_X;
          const oRight = oLeft + BREADBOARD_WIDTH;
          const oTop = other.worldY ?? 0;
          // Cand right edge → other's left edge (place candidate to the left).
          if (Math.abs(candRight - oLeft) < SNAP) {
            snappedDx = oLeft - BREADBOARD_WIDTH - BREADBOARD_OFFSET_X - d.startWorldX;
          }
          // Cand left edge → other's right edge (place candidate to the right).
          else if (Math.abs(candLeft - oRight) < SNAP) {
            snappedDx = oRight - BREADBOARD_OFFSET_X - d.startWorldX;
          }
          // Row alignment: worldY → other.worldY when within half a row-pitch.
          if (Math.abs(candTop - oTop) < HOLE_SPACING / 2) {
            snappedDy = oTop - d.startWorldY;
          }
        }
        dx = snappedDx;
        dy = snappedDy;

        // Re-check overlap after snapping; if the snapped position would
        // overlap another board, fall back to the previous valid offset.
        const finalLeft = d.startWorldX + dx + BREADBOARD_OFFSET_X;
        const finalRight = finalLeft + BREADBOARD_WIDTH;
        const finalTop = d.startWorldY + dy;
        const finalBottom = finalTop + BREADBOARD_HEIGHT;
        const overlaps = surfaceBoardComponents.some((other) => {
          if (other.id === d.boardId) return false;
          const oLeft = (other.worldX ?? 0) + BREADBOARD_OFFSET_X;
          const oRight = oLeft + BREADBOARD_WIDTH;
          const oTop = other.worldY ?? 0;
          const oBottom = oTop + BREADBOARD_HEIGHT;
          return finalLeft < oRight && finalRight > oLeft && finalTop < oBottom && finalBottom > oTop;
        });
        if (overlaps) {
          // Stick at the last valid offset — the board behaves like it hit
          // a wall. (Q17 a: AABB clamp, no overlap allowed.)
          return;
        }
        setBoardDragOffset({ id: d.boardId, dx, dy });
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
    [camera, drag, wire, surfaceBoardComponents],
  );

  const handlePointerUp = useCallback(() => {
    camera.stopPan();

    // Complete a drag-to-wire gesture — release over a different hole
    // creates the wire; release on the start hole or off-board cancels it.
    if (newWireRef.current) {
      const start = newWireRef.current;
      const end = newWireGhost;
      newWireRef.current = null;
      setNewWireGhost(null);
      if (end && isOnBoard(end) && (end.row !== start.fromRow || end.col !== start.fromCol)) {
        send({
          type: "ADD_WIRE",
          wire: {
            id: crypto.randomUUID(),
            fromRow: start.fromRow,
            fromCol: start.fromCol,
            toRow: end.row,
            toCol: end.col,
            color: "#fbbf24",
          },
        });
      }
      return;
    }

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

    // Complete board drag — commit final worldX/worldY
    if (boardDragRef.current && boardDragOffset) {
      const { boardId, startWorldX, startWorldY } = boardDragRef.current;
      const { dx, dy } = boardDragOffset;
      if (dx !== 0 || dy !== 0) {
        send({
          type: "UPDATE_COMPONENT",
          id: boardId,
          changes: { worldX: startWorldX + dx, worldY: startWorldY + dy },
        });
      }
      boardDragRef.current = null;
      setBoardDragOffset(null);
      return;
    }

    drag.handleDragEnd();
  }, [camera, drag, wires, wireDragGhost, newWireGhost, boardDragOffset, send]);

  // ── Keyboard ──────────────────────────────────────────────────

  React.useEffect(() => {
    const componentsRef = components;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      camera.onKeyDown(e);

      // Read-only (embed mode or running sketch): skip all editing
      // shortcuts (delete, select-all, rotate).
      if (effectiveReadOnly) return;

      if (e.code === "Escape") {
        drag.cancelDrag();
        wire.cancelPlacement();
        wireDragRef.current = null;
        setWireDragGhost(null);
        areaSelectRef.current = null;
        setAreaRect(null);
        setMultiSelected(new Set());
      }

      // Home / 0: re-frame all surface boards (Q20 a).
      if (e.code === "Home" || (e.code === "Digit0" && !e.metaKey && !e.ctrlKey)) {
        if (surfaceBoardComponents.length === 0) return;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        e.preventDefault();
        const xs = surfaceBoardComponents.map((b) => (b.worldX ?? 0) + BREADBOARD_OFFSET_X);
        const ys = surfaceBoardComponents.map((b) => b.worldY ?? 0);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs.map((x) => x + BREADBOARD_WIDTH));
        const maxY = Math.max(...ys.map((y) => y + BREADBOARD_HEIGHT));
        fitBbox(
          { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          { width: rect.width, height: rect.height },
        );
        camera.forceUpdate();
        return;
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

      // Single-select delete. Obstacles (box/wall) live outside components +
      // wires but still receive `SELECT` events from the environment overlay,
      // so falling through to the component/wire paths would silently drop
      // the keystroke.
      if ((e.code === "Delete" || e.code === "Backspace") && selectedId) {
        if (selectedId in environment.obstacles) {
          e.preventDefault();
          send({ type: "REMOVE_OBSTACLE", id: selectedId });
          send({ type: "SELECT", id: null });
          return;
        }
        if (selectedId in componentsRef) {
          const comp = componentsRef[selectedId];
          // Surface board cascade delete: only allowed when ≥2 surface
          // boards remain. Children + their incident wires are removed.
          if (comp.type === "breadboard_full" || comp.type === "perfboard_generic") {
            const surfaceBoards = Object.values(componentsRef).filter(
              (c) => c.type === "breadboard_full" || c.type === "perfboard_generic",
            );
            if (surfaceBoards.length < 2) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            send({ type: "SNAPSHOT" });
            const childIds = Object.values(componentsRef)
              .filter((c) => c.parentId === selectedId)
              .map((c) => c.id);
            const childIdSet = new Set(childIds);
            // Drop wires that reference the board or any of its children.
            for (const [wId, w] of Object.entries(wires)) {
              if (
                w.fromBoardId === selectedId ||
                w.toBoardId === selectedId ||
                childIdSet.has(wId)
              ) {
                send({ type: "REMOVE_WIRE", id: wId });
              }
            }
            for (const cid of childIds) send({ type: "REMOVE_COMPONENT", id: cid });
            send({ type: "REMOVE_COMPONENT", id: selectedId });
            send({ type: "SELECT", id: null });
            return;
          }
          if (!isBoardComponentType(comp.type)) {
            e.preventDefault();
            send({ type: "REMOVE_COMPONENT", id: selectedId });
            send({ type: "SELECT", id: null });
            return;
          }
        }
        if (selectedId in wires) {
          e.preventDefault();
          send({ type: "REMOVE_WIRE", id: selectedId });
          send({ type: "SELECT", id: null });
          return;
        }
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
  }, [selectedId, components, wires, send, camera, drag, wire, multiSelected, effectiveReadOnly, surfaceBoardComponents]);

  const handleComponentClick = useCallback(
    (id: string) => {
      // SELECT is non-destructive — keep it working while running so the
      // user can inspect component state mid-simulation. Drag/move is
      // still blocked by the noopDragStart wiring below.
      send({ type: "SELECT", id });
      // Clear any prior marquee selection — otherwise a subsequent Delete
      // would fall into the multi-select branch and remove the old group
      // instead of the just-clicked component.
      setMultiSelected(new Set());
    },
    [send],
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
      className={`h-full w-full bg-card ${cursorClass}`}
      onWheel={camera.handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Shared <defs> for breadboard gradients; one set covers any number of
          BreadboardRenderer instances in the scene. */}
      <BreadboardDefs />
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

        {surfaceBoardComponents.length > 0 ? (
          surfaceBoardComponents.map((board) => {
            const isThisDragging = boardDragOffset?.id === board.id;
            const liveDx = isThisDragging ? boardDragOffset.dx : 0;
            const liveDy = isThisDragging ? boardDragOffset.dy : 0;
            // Board AABB in legacy world coords (anchored at BREADBOARD_OFFSET_X,
            // matching how BreadboardRenderer paints). worldX/worldY shift the
            // whole board; liveDx/liveDy add the in-flight drag delta.
            const bbX = BREADBOARD_OFFSET_X + (board.worldX ?? 0) + liveDx;
            const bbY = (board.worldY ?? 0) + liveDy;
            const isSelected = selectedId === board.id;
            const handleSize = 6;
            return (
              <g key={board.id} data-board-id={board.id}>
                <g
                  transform={liveDx !== 0 || liveDy !== 0 ? `translate(${liveDx}, ${liveDy})` : undefined}
                >
                  <ComponentRenderer
                    component={board}
                    components={surfaceBoardComponents}
                    pinStates={pinStates}
                    wires={wires}
                    isSelected={isSelected}
                    libraryState={libraryState}
                  />
                </g>
                {/* Invisible hit target along the board's outer frame so clicks
                    on the plastic body select / start dragging the board, while
                    clicks on the inner hole grid still fall through to the
                    wire-start gesture (Q14 a). */}
                <g
                  onPointerDown={(e) => handleBoardPointerDown(board.id, e)}
                  onClick={(e) => {
                    // While placing/wiring, let the canvas handle the click.
                    const snap = breadboardInteractionActor.getSnapshot();
                    if (snap.context.mode === "placing" || snap.context.mode === "wiring") return;
                    e.stopPropagation();
                    send({ type: "SELECT", id: board.id });
                  }}
                  style={{ cursor: "move" }}
                >
                  {/* Top frame */}
                  <rect
                    x={bbX}
                    y={bbY}
                    width={BREADBOARD_WIDTH}
                    height={BOARD_PADDING}
                    fill="transparent"
                  />
                  {/* Bottom frame */}
                  <rect
                    x={bbX}
                    y={bbY + BREADBOARD_HEIGHT - BOARD_PADDING}
                    width={BREADBOARD_WIDTH}
                    height={BOARD_PADDING}
                    fill="transparent"
                  />
                  {/* Left frame */}
                  <rect
                    x={bbX}
                    y={bbY}
                    width={BOARD_PADDING}
                    height={BREADBOARD_HEIGHT}
                    fill="transparent"
                  />
                  {/* Right frame */}
                  <rect
                    x={bbX + BREADBOARD_WIDTH - BOARD_PADDING}
                    y={bbY}
                    width={BOARD_PADDING}
                    height={BREADBOARD_HEIGHT}
                    fill="transparent"
                  />
                </g>
                {isSelected && (
                  <g pointerEvents="none">
                    <rect
                      x={bbX - 2}
                      y={bbY - 2}
                      width={BREADBOARD_WIDTH + 4}
                      height={BREADBOARD_HEIGHT + 4}
                      rx={5}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      opacity={0.85}
                    />
                    {([
                      [bbX, bbY],
                      [bbX + BREADBOARD_WIDTH, bbY],
                      [bbX, bbY + BREADBOARD_HEIGHT],
                      [bbX + BREADBOARD_WIDTH, bbY + BREADBOARD_HEIGHT],
                    ] as Array<[number, number]>).map(([hx, hy], i) => (
                      <rect
                        key={`bh-${i}`}
                        x={hx - handleSize / 2}
                        y={hy - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="#3b82f6"
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                )}
              </g>
            );
          })
        ) : (
          // Fallback for any diagram that hasn't been migrated — paint the
          // legacy implicit breadboard. Migrated example boards always have
          // an explicit breadboard_full in components{} and take the path
          // above. Once user save files are migrated this fallback can go.
          <StaticBackground />
        )}

        <WireLayer wires={wires} arduinoPins={pinLayout.allPins} surfaceBoards={surfaceBoardsForRender} selectedId={selectedId} onSelect={handleComponentClick}
          onDragEndpoint={handleWireEndpointDragStart} />

        <ComponentLayer
          components={filteredComponents}
          wires={wires}
          selectedId={selectedId}
          draggingId={drag.draggingId}
          analysis={analysis}
          libraryState={libraryState}
          pinStates={pinStates}
          parentOffsets={parentOffsets}
          onSelect={handleComponentClick}
          onDragStart={effectiveReadOnly ? noopDragStart : drag.handleDragStart}
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

        {/* Drag-to-wire rubber band (fresh wire pulled out of a hole) */}
        {newWireRef.current && newWireGhost && (() => {
          const from = newWireRef.current;
          if (!from) return null;
          const startPos = gridToPixel({ row: from.fromRow, col: from.fromCol });
          const endPos = gridToPixel(newWireGhost);
          const valid =
            isOnBoard(newWireGhost) &&
            (newWireGhost.row !== from.fromRow || newWireGhost.col !== from.fromCol);
          return (
            <g pointerEvents="none">
              <line x1={startPos.x} y1={startPos.y} x2={endPos.x} y2={endPos.y}
                stroke="#fbbf24" strokeWidth={2.5} strokeLinecap="round"
                strokeDasharray="4 3" opacity={0.85} />
              <circle cx={startPos.x} cy={startPos.y} r={4} fill="#fbbf24" opacity={0.7} />
              <circle cx={endPos.x} cy={endPos.y} r={4}
                fill={valid ? "#fbbf24" : "#9ca3af"} fillOpacity={0.35}
                stroke={valid ? "#fbbf24" : "#9ca3af"} strokeWidth={1} />
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
