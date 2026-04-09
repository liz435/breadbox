import React, { useCallback, useMemo, useRef } from "react";
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
  RAIL_OFFSET,
  gridToPixel,
  pixelToGrid,
  getComponentFootprint,
} from "./breadboard-grid";
import { screenToBoard } from "./breadboard-camera";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { ComponentRenderer } from "./component-renderers/index";
import { WireRenderer } from "./component-renderers/wire-renderer";
import { ArduinoUnoBoard } from "./component-renderers/arduino-uno-renderer";
import { CircuitOverlay } from "./circuit-overlay";
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook";
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

function buildBreadboardBackground(): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

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

  const gapCenterX = (gridToPixel({ row: 0, col: 4 }).x + gridToPixel({ row: 0, col: 5 }).x) / 2;
  for (let row = 0; row < ROWS; row++) {
    const { y } = gridToPixel({ row, col: 0 });
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

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = gridToPixel({ row, col });
      elements.push(
        <circle key={`h-${row}-${col}`} cx={x} cy={y} r={HOLE_RADIUS}
          fill="#B8B6B4" stroke="#A8A6A4" strokeWidth={0.4} />
      );
    }
  }

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
      <line x1={leftX} y1={topRailY} x2={leftX + stripeWidth} y2={topRailY}
        stroke="#D44" strokeWidth={1.5} opacity={0.7} />
      <line x1={leftX} y1={bottomRailY} x2={leftX + stripeWidth} y2={bottomRailY}
        stroke="#44D" strokeWidth={1.5} opacity={0.7} />
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
  const gapY = TERMINAL_ORIGIN_Y - 4;
  const gapHeight = (ROWS - 1) * HOLE_SPACING + 8;

  return (
    <g>
      <rect x={bbX} y={0} width={BREADBOARD_WIDTH} height={BREADBOARD_HEIGHT}
        rx={3} fill="#E8E4DE" stroke="#D0CCC6" strokeWidth={1} />
      <rect x={gapX + 3} y={gapY} width={GAP_WIDTH - 6} height={gapHeight}
        fill="#DAD6D0" rx={2} />
      <PowerRailStripes />
      <g>{elements}</g>
    </g>
  );
});

// ── Wire layer ──────────────────────────────────────────────────

type WireLayerProps = {
  wires: Record<string, import("@dreamer/schemas").Wire>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragEndpoint: (wireId: string, endpoint: "from" | "to", e: React.PointerEvent) => void;
};

const WireLayer = React.memo(function WireLayer({ wires, selectedId, onSelect, onDragEndpoint }: WireLayerProps) {
  const wireList = useMemo(() => Object.values(wires), [wires]);
  return (
    <g>
      {wireList.map((wire) => (
        <WireRenderer key={wire.id} wire={wire}
          isSelected={selectedId === wire.id} onSelect={onSelect}
          onDragEndpoint={onDragEndpoint} />
      ))}
    </g>
  );
});

// ── Component layer ─────────────────────────────────────────────

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
  components, selectedId, draggingId, analysis, libraryState, pinStates,
  onSelect, onDragStart,
}: ComponentLayerProps) {
  return (
    <g>
      {components.map((comp) => {
        const isDragging = draggingId === comp.id;
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation);
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
                component={comp} pinStates={pinStates}
                isSelected={selectedId === comp.id}
                electricalState={analysis?.componentStates.get(comp.id)}
                libraryState={libraryState}
              />
            </g>
          </g>
        );
      })}

      {components.map((comp) => {
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation);
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

function BreadboardCanvasInner({ zoomTick: _zoomTick, panMode }: { zoomTick?: number; panMode?: boolean }) {
  const components = useBoardSelector((s) => s.components);
  const wires = useBoardSelector((s) => s.wires);
  const pinStates = useBoardSelector((s) => s.pinStates);
  const selectedId = useBoardSelector((s) => s.selectedId);
  const libraryState = useBoardSelector((s) => s.libraryState);
  const send = BoardContext.useActorRef().send;

  const svgRef = useRef<SVGSVGElement>(null);

  const { analysis } = useCircuitAnalysis();

  // ── Extracted hooks (all interaction state lives in the XState machine) ──
  const camera = useBreadboardCamera({ svgRef, panMode });
  const drag = useBreadboardDrag({ svgRef, components, send });
  const wire = useBreadboardWire({ svgRef, send });

  const filteredComponents = useMemo(
    () => Object.values(components).filter((c) => c.type !== "arduino_uno"),
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
    [wires],
  );

  // ── Unified pointer handlers ──────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (camera.shouldStartPan(e)) {
        camera.startPan(e);
        return;
      }

      if (e.button === 0 && wire.handlePlacementPointerDown(e)) return;

      // Component placement (non-wire)
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
    [send, camera, wire],
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
          if (c.type !== "arduino_uno") all.add(c.id);
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
          if (comp && comp.type !== "arduino_uno" && comp.type !== "wire") {
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
  }, [selectedId, components, wires, send, camera, drag, wire, multiSelected]);

  const handleComponentClick = useCallback(
    (id: string) => { send({ type: "SELECT", id }); },
    [send],
  );

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
        <ArduinoUnoBoard
          onStartWireFromPin={wire.handleStartWireFromPin}
          wiringFromPin={wire.wiringFromPin}
        />

        <StaticBackground />

        <WireLayer wires={wires} selectedId={selectedId} onSelect={handleComponentClick}
          onDragEndpoint={handleWireEndpointDragStart} />

        <ComponentLayer
          components={filteredComponents}
          selectedId={selectedId}
          draggingId={drag.draggingId}
          analysis={analysis}
          libraryState={libraryState}
          pinStates={pinStates}
          onSelect={handleComponentClick}
          onDragStart={drag.handleDragStart}
        />

        {analysis && analysis.isValid && (
          <CircuitOverlay analysis={analysis} components={filteredComponents} />
        )}

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

        {/* Ghost preview while placing */}
        {wire.interactionMode === "placing" && wire.ghostPos && wire.placingType && wire.placingType !== "wire" && (
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
