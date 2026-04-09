import { setup, assign } from "xstate";
import type {
  BoardComponent,
  Wire,
  BoardState,
  LibraryState,
  CustomLibrary,
} from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";
import { pinStateStore } from "@/simulator/pin-state-store";

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
  | { type: "APPEND_SERIAL"; text: string; ts?: number }
  | { type: "CLEAR_SERIAL" }
  | { type: "RESET_PINS" }
  | { type: "ADD_CUSTOM_LIBRARY"; name: string; library: CustomLibrary }
  | { type: "UPDATE_CUSTOM_LIBRARY"; name: string; library: CustomLibrary }
  | { type: "REMOVE_CUSTOM_LIBRARY"; name: string }
  | { type: "LOAD_BOARD"; state: BoardState }
  | { type: "SNAPSHOT" }
  | { type: "UNDO" }
  | { type: "REDO" };

// ── Context ────────────────────────────────────────────────────────────────
//
// `pinStates` used to live here. It is now owned by the PinStateStore
// (see simulator/pin-state-store.ts) and is not part of the machine context.
// React components access pin state via usePinStates() / usePinState(n).

export type BoardMachineContext = BoardState & {
  selectedId: string | null;
  _past: BoardState[];
  _future: BoardState[];
};

const MAX_HISTORY = 100;

function boardData(ctx: BoardMachineContext): BoardState {
  return {
    components: ctx.components,
    wires: ctx.wires,
    libraryState: ctx.libraryState,
    serialOutput: ctx.serialOutput,
    sketchCode: ctx.sketchCode,
    customLibraries: ctx.customLibraries,
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

const defaultBoard = createDefaultBoardState();

const initialContext: BoardMachineContext = {
  ...defaultBoard,
  selectedId: null,
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
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        components: {
          ...context.components,
          [event.component.id]: event.component,
        },
        selectedId: event.component.id,
      })),
    },

    REMOVE_COMPONENT: {
      actions: assign(({ context, event }) => {
        const { [event.id]: _, ...rest } = context.components;
        return {
          ...pushHistory(context),
          components: rest,
          selectedId: context.selectedId === event.id ? null : context.selectedId,
        };
      }),
    },

    UPDATE_COMPONENT: {
      actions: assign(({ context, event }) => {
        const existing = context.components[event.id];
        if (!existing) return {};
        return {
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
        return {
          components: {
            ...context.components,
            [event.id]: { ...existing, x: event.x, y: event.y },
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
          { text: event.text, ts: event.ts ?? Date.now() },
        ],
      })),
    },

    CLEAR_SERIAL: {
      actions: assign({ serialOutput: [] }),
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

    // ── Selection ──

    SELECT: {
      actions: assign({ selectedId: ({ event }) => event.id }),
    },

    // ── Bulk load ──

    LOAD_BOARD: {
      actions: assign(({ event }) => {
        const s = event.state;
        return {
          ...s,
          libraryState: s.libraryState ?? { servos: {}, lcd: null, serialBaud: 0 },
          serialOutput: s.serialOutput ?? [],
          selectedId: null,
          _past: [],
          _future: [],
        };
      }),
    },
  },
});
