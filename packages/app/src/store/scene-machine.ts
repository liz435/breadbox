import { setup, assign } from "xstate";
import type { SceneState, Sprite, TilemapData } from "../types";

export type SceneEvent =
  | { type: "ADD_SPRITE"; sprite: Sprite }
  | { type: "SELECT"; id: string | null }
  | { type: "REMOVE"; id: string }
  | { type: "UPDATE"; id: string; changes: Partial<Omit<Sprite, "id" | "image">> }
  | { type: "INIT_TILEMAP"; width: number; height: number; tileSize: number }
  | { type: "PAINT_TILE"; row: number; col: number; tileType: number }
  | { type: "SET_BRUSH"; brush: number }
  | { type: "CLEAR_TILEMAP" }
  | { type: "SNAPSHOT" }
  | { type: "UNDO" }
  | { type: "REDO" };

const MAX_HISTORY = 100;

export type SceneMachineContext = SceneState & {
  _past: SceneState[];
  _future: SceneState[];
};

function sceneData(ctx: SceneMachineContext): SceneState {
  return {
    sprites: ctx.sprites,
    selectedId: ctx.selectedId,
    tilemap: ctx.tilemap,
    activeBrush: ctx.activeBrush,
  };
}

function pushHistory(ctx: SceneMachineContext): { _past: SceneState[]; _future: SceneState[] } {
  const past = [...ctx._past, sceneData(ctx)];
  if (past.length > MAX_HISTORY) past.shift();
  return { _past: past, _future: [] };
}

const initialContext: SceneMachineContext = {
  sprites: [],
  selectedId: null,
  tilemap: null,
  activeBrush: 0,
  _past: [],
  _future: [],
};

export const sceneMachine = setup({
  types: {
    context: {} as SceneMachineContext,
    events: {} as SceneEvent,
  },
  guards: {
    canPaintTile: ({ context, event }) => {
      if (event.type !== "PAINT_TILE") return false;
      if (!context.tilemap) return false;
      const { row, col, tileType } = event;
      if (row < 0 || row >= context.tilemap.height || col < 0 || col >= context.tilemap.width) return false;
      if (context.tilemap.tiles[row][col] === tileType) return false;
      return true;
    },
    canUndo: ({ context }) => context._past.length > 0,
    canRedo: ({ context }) => context._future.length > 0,
  },
}).createMachine({
  id: "scene",
  context: initialContext,
  on: {
    // Explicit snapshot — call before starting a gesture (drag/resize/rotate/paint)
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
          _past: past,
          _future: [sceneData(context), ...context._future],
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
          _past: [...context._past, sceneData(context)],
          _future: future,
        };
      }),
    },

    // ── Discrete actions: auto-snapshot ──

    ADD_SPRITE: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        sprites: [...context.sprites, event.sprite],
        selectedId: event.sprite.id,
      })),
    },
    REMOVE: {
      actions: assign(({ context, event }) => ({
        ...pushHistory(context),
        sprites: context.sprites.filter((s) => s.id !== event.id),
        selectedId: context.selectedId === event.id ? null : context.selectedId,
      })),
    },
    INIT_TILEMAP: {
      actions: assign(({ context, event }) => {
        const tiles: number[][] = [];
        for (let r = 0; r < event.height; r++) {
          tiles.push(new Array(event.width).fill(0));
        }
        const tilemap: TilemapData = {
          width: event.width,
          height: event.height,
          tileSize: event.tileSize,
          tiles,
        };
        return { ...pushHistory(context), tilemap };
      }),
    },
    CLEAR_TILEMAP: {
      actions: assign(({ context }) => ({
        ...pushHistory(context),
        tilemap: null,
      })),
    },

    // ── Non-undoable ──

    SELECT: {
      actions: assign({
        selectedId: ({ event }) => event.id,
      }),
    },
    SET_BRUSH: {
      actions: assign({
        activeBrush: ({ event }) => event.brush,
      }),
    },

    // ── Continuous actions: caller sends SNAPSHOT before the gesture ──

    UPDATE: {
      actions: assign({
        sprites: ({ context, event }) =>
          context.sprites.map((s) =>
            s.id === event.id ? { ...s, ...event.changes } : s
          ),
      }),
    },
    PAINT_TILE: {
      guard: "canPaintTile",
      actions: assign({
        tilemap: ({ context, event }) => {
          const tm = context.tilemap!;
          const newTiles = tm.tiles.map((r, ri) =>
            ri === event.row ? r.map((c, ci) => (ci === event.col ? event.tileType : c)) : r
          );
          return { ...tm, tiles: newTiles };
        },
      }),
    },
  },
});
