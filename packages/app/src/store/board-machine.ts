import { setup, assign } from "xstate";
import type {
  BoardComponent,
  Wire,
  BoardState,
  LibraryState,
  CustomLibrary,
  BoardTarget,
  Obstacle,
  Environment,
} from "@dreamer/schemas";
import { createDefaultBoardState, DEFAULT_BOARD_TARGET, resolveComponentPins } from "@dreamer/schemas";
import { pinStateStore } from "@/simulator/pin-state-store";
import { getComponentFootprint, areConnected } from "@/breadboard/breadboard-grid";
import { sensorRay } from "@/simulator/ray-cast";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find every wire that has at least one endpoint electrically attached to
 * `component`'s footprint. Used by REMOVE_COMPONENT so we don't leave
 * orphaned wires pointing at a hole that no longer hosts a pin.
 *
 * "Electrically attached" means the wire endpoint is on the same breadboard
 * net (same row of 5 in the same half, same power rail, etc.) as one of the
 * component's pin holes — not just exact-coordinate matches.
 *
 * Arduino-pin wires (`fromRow === -999`) only land on the breadboard at their
 * `to` end; their `from` is a virtual Arduino pin coordinate, so we only test
 * the `to` endpoint for those.
 */
function wiresAttachedToComponent(
  component: BoardComponent,
  wires: Record<string, Wire>,
): string[] {
  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  );
  const attached: string[] = [];
  for (const [id, wire] of Object.entries(wires)) {
    const isArduinoPinWire = wire.fromRow === -999;
    const toPoint = { row: wire.toRow, col: wire.toCol };
    for (const fp of footprint.points) {
      if (areConnected(toPoint, fp)) {
        attached.push(id);
        break;
      }
      if (!isArduinoPinWire) {
        const fromPoint = { row: wire.fromRow, col: wire.fromCol };
        if (areConnected(fromPoint, fp)) {
          attached.push(id);
          break;
        }
      }
    }
  }
  return attached;
}

// ── Events ─────────────────────────────────────────────────────────────────

export type BoardEvent =
  | { type: "PLACE_COMPONENT"; component: BoardComponent }
  | { type: "REMOVE_COMPONENT"; id: string }
  | { type: "UPDATE_COMPONENT"; id: string; changes: Partial<BoardComponent> }
  | { type: "MOVE_COMPONENT"; id: string; x: number; y: number }
  | { type: "SELECT"; id: string | null }
  | { type: "ADD_WIRE"; wire: Wire }
  | { type: "UPDATE_WIRE"; id: string; changes: Partial<Wire> }
  | { type: "REMOVE_WIRE"; id: string }
  | { type: "SET_LIBRARY_STATE"; changes: Partial<LibraryState> }
  | { type: "UPDATE_SKETCH"; code: string }
  | { type: "APPEND_SERIAL"; text: string; ts?: number; source?: "simulator" | "board" }
  | { type: "CLEAR_SERIAL" }
  | { type: "APPEND_BUILD_LOG"; tag: "compiler" | "upload"; line: string; ts?: number }
  | { type: "CLEAR_BUILD_LOG" }
  | { type: "RESET_PINS" }
  | { type: "ADD_CUSTOM_LIBRARY"; name: string; library: CustomLibrary }
  | { type: "UPDATE_CUSTOM_LIBRARY"; name: string; library: CustomLibrary }
  | { type: "REMOVE_CUSTOM_LIBRARY"; name: string }
  | { type: "SET_BOARD_TARGET"; boardTarget: BoardTarget }
  | { type: "ADD_OBSTACLE"; obstacle: Obstacle }
  | { type: "UPDATE_OBSTACLE"; id: string; changes: Partial<Obstacle> }
  | { type: "REMOVE_OBSTACLE"; id: string }
  | { type: "UPDATE_ENVIRONMENT"; changes: Partial<Environment> }
  | { type: "LOAD_BOARD"; state: BoardState }
  | { type: "SNAPSHOT" }
  | { type: "UNDO" }
  | { type: "REDO" };

// ── Context ────────────────────────────────────────────────────────────────
//
// `pinStates` used to live here. It is now owned by the PinStateStore
// (see simulator/pin-state-store.ts) and is not part of the machine context.
// React components access pin state via usePinStates() / usePinState(n).

export type BuildLogEntry = {
  tag: "compiler" | "upload";
  line: string;
  ts: number;
};

export type BoardMachineContext = BoardState & {
  selectedId: string | null;
  /**
   * Live compile / upload log streamed from `/api/compile` + `/api/flash`.
   * Ephemeral — excluded from persisted BoardState and from undo history.
   * Cleared on each new Run or Upload. Capped to MAX_BUILD_LOG entries to
   * bound memory on verbose builds.
   */
  buildLog: BuildLogEntry[];
  _past: BoardState[];
  _future: BoardState[];
};

const MAX_BUILD_LOG = 2000;

const MAX_HISTORY = 100;

function boardData(ctx: BoardMachineContext): BoardState {
  return {
    components: ctx.components,
    wires: ctx.wires,
    libraryState: ctx.libraryState,
    serialOutput: ctx.serialOutput,
    sketchCode: ctx.sketchCode,
    customLibraries: ctx.customLibraries,
    boardTarget: ctx.boardTarget ?? DEFAULT_BOARD_TARGET,
    environment: ctx.environment,
  };
}

function pushHistory(ctx: BoardMachineContext): {
  _past: BoardState[];
  _future: BoardState[];
} {
  const past = [...ctx._past, boardData(ctx)];
  if (past.length > MAX_HISTORY) past.shift();
  return { _past: past, _future: [] };
}

const POSITIVE_RAIL_COLS = new Set([-2, 11]);
const NEGATIVE_RAIL_COLS = new Set([-1, 10]);

function wireTouchesPoint(wire: Wire, point: { row: number; col: number }): boolean {
  const toPoint = { row: wire.toRow, col: wire.toCol };
  if (areConnected(toPoint, point)) return true;
  if (wire.fromRow === -999) return false;
  const fromPoint = { row: wire.fromRow, col: wire.fromCol };
  return areConnected(fromPoint, point);
}

function wireHasPositiveRailEndpoint(wire: Wire): boolean {
  if (POSITIVE_RAIL_COLS.has(wire.toCol)) return true;
  if (wire.fromRow !== -999 && POSITIVE_RAIL_COLS.has(wire.fromCol)) return true;
  return false;
}

function wireHasNegativeRailEndpoint(wire: Wire): boolean {
  if (NEGATIVE_RAIL_COLS.has(wire.toCol)) return true;
  if (wire.fromRow !== -999 && NEGATIVE_RAIL_COLS.has(wire.fromCol)) return true;
  return false;
}

/**
 * Migration: older motor example boards swapped the motor's logical pins
 * (`D9 -> vcc`, `PSU+ -> signal`). Normalize to:
 * `D9 -> signal`, `PSU+ -> vcc`.
 */
function normalizeLegacyDcMotorWiring(state: BoardState): BoardState {
  let nextWires = state.wires;
  let changed = false;

  for (const component of Object.values(state.components)) {
    if (component.type !== "dc_motor") continue;
    const signalPin = component.pins?.signal;
    if (typeof signalPin !== "number") continue;

    const pinMap = resolveComponentPins("dc_motor", component.y, component.x, component.properties);
    const vccPoint = pinMap.vcc;
    const signalPoint = pinMap.signal;
    if (!vccPoint || !signalPoint) continue;

    const arduinoWireEntry = Object.entries(nextWires).find(([, wire]) =>
      wire.fromRow === -999 &&
      wire.fromCol === signalPin &&
      wireTouchesPoint(wire, vccPoint) &&
      !wireTouchesPoint(wire, signalPoint),
    );
    if (!arduinoWireEntry) continue;

    const [arduinoWireId] = arduinoWireEntry;
    const supplyWireEntry = Object.entries(nextWires).find(([id, wire]) =>
      id !== arduinoWireId &&
      wireHasPositiveRailEndpoint(wire) &&
      wireTouchesPoint(wire, signalPoint) &&
      !wireTouchesPoint(wire, vccPoint),
    );
    if (!supplyWireEntry) continue;

    const [supplyWireId, supplyWire] = supplyWireEntry;

    if (!changed) {
      nextWires = { ...nextWires };
      changed = true;
    }

    nextWires[arduinoWireId] = {
      ...nextWires[arduinoWireId]!,
      toRow: signalPoint.row,
      toCol: signalPoint.col,
    };

    const supplyToPoint = { row: supplyWire.toRow, col: supplyWire.toCol };
    if (areConnected(supplyToPoint, signalPoint)) {
      nextWires[supplyWireId] = {
        ...supplyWire,
        toRow: vccPoint.row,
        toCol: vccPoint.col,
      };
    } else if (supplyWire.fromRow !== -999) {
      const supplyFromPoint = { row: supplyWire.fromRow, col: supplyWire.fromCol };
      if (areConnected(supplyFromPoint, signalPoint)) {
        nextWires[supplyWireId] = {
          ...supplyWire,
          fromRow: vccPoint.row,
          fromCol: vccPoint.col,
        };
      }
    }

    // Legacy dataset also added a PSU- stub one row below the motor pins.
    // It is not connected to any motor terminal and only adds confusion.
    const legacyStubPoint = { row: component.y + 2, col: component.x };
    for (const [wireId, wire] of Object.entries(nextWires)) {
      if (wireId === arduinoWireId || wireId === supplyWireId) continue;
      if (wire.fromRow === -999) continue;
      if (!wireHasNegativeRailEndpoint(wire)) continue;
      if (!wireTouchesPoint(wire, legacyStubPoint)) continue;
      if (wireTouchesPoint(wire, vccPoint) || wireTouchesPoint(wire, signalPoint)) continue;
      delete nextWires[wireId];
    }
  }

  return changed ? { ...state, wires: nextWires } : state;
}

const defaultBoard = createDefaultBoardState();

const initialContext: BoardMachineContext = {
  ...defaultBoard,
  selectedId: null,
  buildLog: [],
  _past: [],
  _future: [],
};

// ── Machine ────────────────────────────────────────────────────────────────

export const boardMachine = setup({
  types: {
    context: {} as BoardMachineContext,
    events: {} as BoardEvent,
  },
  guards: {
    canUndo: ({ context }) => context._past.length > 0,
    canRedo: ({ context }) => context._future.length > 0,
  },
}).createMachine({
  id: "board",
  context: initialContext,
  on: {
    // ── History ──

    SNAPSHOT: {
      actions: assign(({ context }) => pushHistory(context)),
    },

    UNDO: {
      guard: "canUndo",
      actions: assign(({ context }) => {
        const past = [...context._past];
        const prev = past.pop()!;
        return {
          ...prev,
          selectedId: context.selectedId,
          _past: past,
          _future: [boardData(context), ...context._future],
        };
      }),
    },

    REDO: {
      guard: "canRedo",
      actions: assign(({ context }) => {
        const future = [...context._future];
        const next = future.shift()!;
        return {
          ...next,
          selectedId: context.selectedId,
          _past: [...context._past, boardData(context)],
          _future: future,
        };
      }),
    },

    // ── Components (auto-snapshot) ──

    PLACE_COMPONENT: {
      actions: assign(({ context, event }) => {
        const comp = event.component;
        const base = {
          ...pushHistory(context),
          components: { ...context.components, [comp.id]: comp },
          selectedId: comp.id,
        };
        // An ultrasonic sensor needs something to "see". Drop a box obstacle in
        // front of it by default (along its beam, ~45cm out) so it reports a
        // live distance immediately — no need to add one from the inspector.
        if (comp.type === "ultrasonic_sensor") {
          const ray = sensorRay(comp);
          const cx = ray.ox + ray.dx * 90;
          const cy = ray.oy + ray.dy * 90;
          const obstacle: Obstacle = {
            id: `obs_${comp.id}`,
            shape: "box",
            x1: cx - 30,
            y1: cy - 20,
            x2: cx + 30,
            y2: cy + 20,
            label: "",
          };
          return {
            ...base,
            environment: {
              ...context.environment,
              obstacles: { ...context.environment.obstacles, [obstacle.id]: obstacle },
            },
          };
        }
        return base;
      }),
    },

    REMOVE_COMPONENT: {
      actions: assign(({ context, event }) => {
        const removed = context.components[event.id];
        const { [event.id]: _, ...remainingComponents } = context.components;

        // Drop any wires whose endpoint landed on this component's footprint.
        // Without this, deleting a component leaves orphaned wires pointing
        // at empty holes — they'd survive into codegen, the netlist, and the
        // schematic view as bogus connections.
        let remainingWires = context.wires;
        if (removed) {
          const orphanedIds = wiresAttachedToComponent(removed, context.wires);
          if (orphanedIds.length > 0) {
            remainingWires = { ...context.wires };
            for (const wireId of orphanedIds) {
              delete remainingWires[wireId];
            }
          }
        }

        // Clean up the default box obstacle auto-created for an ultrasonic
        // sensor on placement — it shares the component's id (obs_<id>), so
        // deleting the sensor removes its box too.
        let environment = context.environment;
        const obstacleId = `obs_${event.id}`;
        if (environment.obstacles[obstacleId]) {
          const { [obstacleId]: _removedObstacle, ...remainingObstacles } = environment.obstacles;
          environment = { ...environment, obstacles: remainingObstacles };
        }

        return {
          ...pushHistory(context),
          components: remainingComponents,
          wires: remainingWires,
          environment,
          selectedId: context.selectedId === event.id ? null : context.selectedId,
        };
      }),
    },

    UPDATE_COMPONENT: {
      actions: assign(({ context, event }) => {
        const existing = context.components[event.id];
        if (!existing) return {};
        return {
          ...pushHistory(context),
          components: {
            ...context.components,
            [event.id]: { ...existing, ...event.changes },
          },
        };
      }),
    },

    MOVE_COMPONENT: {
      actions: assign(({ context, event }) => {
        const existing = context.components[event.id];
        if (!existing) return {};
        // Components that store extra anchor points in `properties` (e.g.
        // the multimeter's second probe) need those points translated by
        // the same delta as (x, y) so dragging the body moves both ends
        // together. Plain components only update x/y.
        const dx = event.x - existing.x;
        const dy = event.y - existing.y;
        const updatedProps = { ...existing.properties };
        if (
          typeof updatedProps.probeBRow === "number" &&
          typeof updatedProps.probeBCol === "number"
        ) {
          updatedProps.probeBRow = updatedProps.probeBRow + dy;
          updatedProps.probeBCol = updatedProps.probeBCol + dx;
        }
        return {
          ...pushHistory(context),
          components: {
            ...context.components,
            [event.id]: {
              ...existing,
              x: event.x,
              y: event.y,
              properties: updatedProps,
            },
          },
        };
      }),
    },

    // ── Wires (auto-snapshot) ──

    ADD_WIRE: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        wires: { ...context.wires, [event.wire.id]: event.wire },
      })),
    },

    UPDATE_WIRE: {
      actions: assign(({ context, event }) => {
        const existing = context.wires[event.id];
        if (!existing) return {};
        return {
          ...pushHistory(context),
          wires: {
            ...context.wires,
            [event.id]: { ...existing, ...event.changes },
          },
        };
      }),
    },

    REMOVE_WIRE: {
      actions: assign(({ context, event }) => {
        const { [event.id]: _, ...rest } = context.wires;
        return {
          ...pushHistory(context),
          wires: rest,
        };
      }),
    },

    // ── Library state (servos, LCD) ──

    SET_LIBRARY_STATE: {
      actions: assign(({ context, event }) => ({
        libraryState: { ...context.libraryState, ...event.changes },
      })),
    },

    // Reset runtime state: library state (servos/LCD) back to defaults
    // AND delegate pin reset to the PinStateStore (side effect).
    RESET_PINS: {
      actions: [
        () => {
          pinStateStore.resetValues();
        },
        assign(() => ({
          libraryState: createDefaultBoardState().libraryState,
        })),
      ],
    },

    // ── Sketch ──

    UPDATE_SKETCH: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        sketchCode: event.code,
      })),
    },

    // ── Serial ──

    APPEND_SERIAL: {
      actions: assign(({ context, event }) => ({
        serialOutput: [
          ...context.serialOutput,
          { text: event.text, ts: event.ts ?? Date.now(), source: event.source },
        ],
      })),
    },

    CLEAR_SERIAL: {
      actions: assign({ serialOutput: [] }),
    },

    // ── Build log (compile / upload streaming) ──

    APPEND_BUILD_LOG: {
      actions: assign(({ context, event }) => {
        const next = [
          ...context.buildLog,
          { tag: event.tag, line: event.line, ts: event.ts ?? Date.now() },
        ];
        if (next.length > MAX_BUILD_LOG) {
          next.splice(0, next.length - MAX_BUILD_LOG);
        }
        return { buildLog: next };
      }),
    },

    CLEAR_BUILD_LOG: {
      actions: assign({ buildLog: [] }),
    },

    // ── Custom Libraries ──

    ADD_CUSTOM_LIBRARY: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        customLibraries: { ...context.customLibraries, [event.name]: event.library },
      })),
    },

    UPDATE_CUSTOM_LIBRARY: {
      actions: assign(({ context, event }) => ({
        customLibraries: { ...context.customLibraries, [event.name]: event.library },
      })),
    },

    REMOVE_CUSTOM_LIBRARY: {
      actions: assign(({ context, event }) => {
        const { [event.name]: _, ...rest } = context.customLibraries;
        return { ...pushHistory(context), customLibraries: rest };
      }),
    },

    SET_BOARD_TARGET: {
      actions: [
        () => {
          // Drop stale per-pin runtime state when changing board model.
          pinStateStore.resetValues();
        },
        assign(({ context, event }) => ({
          ...pushHistory(context),
          boardTarget: event.boardTarget,
        })),
      ],
    },

    // ── Environment (obstacles for sensor simulation) ──

    ADD_OBSTACLE: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        environment: {
          ...context.environment,
          obstacles: { ...context.environment.obstacles, [event.obstacle.id]: event.obstacle },
        },
      })),
    },

    UPDATE_OBSTACLE: {
      actions: assign(({ context, event }) => {
        const existing = context.environment.obstacles[event.id];
        if (!existing) return {};
        return {
          ...pushHistory(context),
          environment: {
            ...context.environment,
            obstacles: {
              ...context.environment.obstacles,
              [event.id]: { ...existing, ...event.changes },
            },
          },
        };
      }),
    },

    REMOVE_OBSTACLE: {
      actions: assign(({ context, event }) => {
        const { [event.id]: _, ...rest } = context.environment.obstacles;
        return {
          ...pushHistory(context),
          environment: { ...context.environment, obstacles: rest },
        };
      }),
    },

    UPDATE_ENVIRONMENT: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        environment: { ...context.environment, ...event.changes },
      })),
    },

    // ── Selection ──

    SELECT: {
      actions: assign({ selectedId: ({ event }) => event.id }),
    },

    // ── Bulk load ──

    LOAD_BOARD: {
      actions: assign(({ event }) => {
        const s = normalizeLegacyDcMotorWiring(event.state);
        const isEmptyBoard =
          Object.keys(s.components ?? {}).length === 0 &&
          Object.keys(s.wires ?? {}).length === 0;
        const normalizedSketch =
          isEmptyBoard && s.sketchCode.trim() === ""
            ? createDefaultBoardState().sketchCode
            : s.sketchCode;
        const libraryState = Object.assign({} as LibraryState, {
          servos: {},
          lcd: null,
          serialBaud: 0,
          oled: {},
          neopixels: {},
        }, s.libraryState ?? {});

        // Retroactive migration: projects saved before the seeded default
        // breadboard have no surface-board component, so the canvas paints a
        // legacy <StaticBackground/> fallback. The moment the user places a
        // new breadboard, that fallback vanishes and the "default board"
        // appears to disappear. Seed an explicit breadboard-1 on load when
        // none is present so behaviour matches new projects.
        const hasSurfaceBoard = Object.values(s.components ?? {}).some(
          (c) => c.type === "breadboard_full" || c.type === "perfboard_generic",
        );
        const components = hasSurfaceBoard
          ? s.components
          : { ...s.components, ...createDefaultBoardState().components };

        return {
          ...s,
          components,
          libraryState,
          serialOutput: s.serialOutput ?? [],
          sketchCode: normalizedSketch,
          boardTarget: s.boardTarget ?? DEFAULT_BOARD_TARGET,
          environment: s.environment ?? { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
          selectedId: null,
          _past: [],
          _future: [],
        };
      }),
    },
  },
});
