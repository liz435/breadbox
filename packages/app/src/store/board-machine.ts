import { setup, assign } from "xstate";
import type {
  BoardComponent,
  Wire,
  PinState,
  BoardState,
  LibraryState,
} from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";

// ── Events ─────────────────────────────────────────────────────────────────

export type BoardEvent =
  | { type: "PLACE_COMPONENT"; component: BoardComponent }
  | { type: "REMOVE_COMPONENT"; id: string }
  | { type: "UPDATE_COMPONENT"; id: string; changes: Partial<BoardComponent> }
  | { type: "MOVE_COMPONENT"; id: string; x: number; y: number }
  | { type: "SELECT"; id: string | null }
  | { type: "ADD_WIRE"; wire: Wire }
  | { type: "REMOVE_WIRE"; id: string }
  | { type: "SET_PIN_STATE"; pin: number; changes: Partial<PinState> }
  | { type: "SET_LIBRARY_STATE"; changes: Partial<LibraryState> }
  | { type: "UPDATE_SKETCH"; code: string }
  | { type: "APPEND_SERIAL"; text: string }
  | { type: "CLEAR_SERIAL" }
  | { type: "RESET_PINS" }
  | { type: "LOAD_BOARD"; state: BoardState }
  | { type: "SNAPSHOT" }
  | { type: "UNDO" }
  | { type: "REDO" };

// ── Context ────────────────────────────────────────────────────────────────

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
    pinStates: ctx.pinStates,
    libraryState: ctx.libraryState,
    serialOutput: ctx.serialOutput,
    sketchCode: ctx.sketchCode,
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

    REMOVE_WIRE: {
      actions: assign(({ context, event }) => {
        const { [event.id]: _, ...rest } = context.wires;
        return {
          ...pushHistory(context),
          wires: rest,
        };
      }),
    },

    // ── Pins ──

    SET_PIN_STATE: {
      actions: assign(({ context, event }) => ({
        pinStates: context.pinStates.map((ps) =>
          ps.pin === event.pin ? { ...ps, ...event.changes } : ps
        ),
      })),
    },

    SET_LIBRARY_STATE: {
      actions: assign(({ context, event }) => ({
        libraryState: { ...context.libraryState, ...event.changes },
      })),
    },

    RESET_PINS: {
      actions: assign(() => ({
        pinStates: createDefaultBoardState().pinStates,
        libraryState: createDefaultBoardState().libraryState,
      })),
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
        serialOutput: [...context.serialOutput, event.text],
      })),
    },

    CLEAR_SERIAL: {
      actions: assign({ serialOutput: [] }),
    },

    // ── Selection ──

    SELECT: {
      actions: assign({ selectedId: ({ event }) => event.id }),
    },

    // ── Bulk load ──

    LOAD_BOARD: {
      actions: assign(({ event }) => ({
        ...event.state,
        selectedId: null,
        _past: [],
        _future: [],
      })),
    },
  },
});
