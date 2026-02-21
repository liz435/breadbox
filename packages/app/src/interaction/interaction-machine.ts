import { setup, assign, createActor } from "xstate";
import type { HandleId, Sprite } from "../types";

type InteractionContext = {
  spriteId: string | null;
  offsetX: number;
  offsetY: number;
  handleId: HandleId | null;
  origin: { x: number; y: number } | null;
  initialSprite: Sprite | null;
  pivot: { x: number; y: number } | null;
  startAngle: number;
  initialRotation: number;
  lastScreenX: number;
  lastScreenY: number;
};

type InteractionEvent =
  | { type: "START_DRAG"; spriteId: string; offsetX: number; offsetY: number }
  | { type: "START_RESIZE"; spriteId: string; handleId: HandleId; origin: { x: number; y: number }; initialSprite: Sprite }
  | { type: "START_ROTATE"; spriteId: string; pivot: { x: number; y: number }; startAngle: number; initialRotation: number }
  | { type: "START_PAINT" }
  | { type: "START_PAN"; screenX: number; screenY: number }
  | { type: "UPDATE_PAN"; screenX: number; screenY: number }
  | { type: "RELEASE" };

const initialContext: InteractionContext = {
  spriteId: null,
  offsetX: 0,
  offsetY: 0,
  handleId: null,
  origin: null,
  initialSprite: null,
  pivot: null,
  startAngle: 0,
  initialRotation: 0,
  lastScreenX: 0,
  lastScreenY: 0,
};

const interactionMachine = setup({
  types: {
    context: {} as InteractionContext,
    events: {} as InteractionEvent,
  },
}).createMachine({
  id: "interaction",
  initial: "idle",
  context: initialContext,
  states: {
    idle: {
      on: {
        START_DRAG: {
          target: "dragging",
          actions: assign({
            spriteId: ({ event }) => event.spriteId,
            offsetX: ({ event }) => event.offsetX,
            offsetY: ({ event }) => event.offsetY,
          }),
        },
        START_RESIZE: {
          target: "resizing",
          actions: assign({
            spriteId: ({ event }) => event.spriteId,
            handleId: ({ event }) => event.handleId,
            origin: ({ event }) => event.origin,
            initialSprite: ({ event }) => event.initialSprite,
          }),
        },
        START_ROTATE: {
          target: "rotating",
          actions: assign({
            spriteId: ({ event }) => event.spriteId,
            pivot: ({ event }) => event.pivot,
            startAngle: ({ event }) => event.startAngle,
            initialRotation: ({ event }) => event.initialRotation,
          }),
        },
        START_PAINT: { target: "painting" },
        START_PAN: {
          target: "panning",
          actions: assign({
            lastScreenX: ({ event }) => event.screenX,
            lastScreenY: ({ event }) => event.screenY,
          }),
        },
      },
    },
    dragging: {
      on: {
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    resizing: {
      on: {
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    rotating: {
      on: {
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    painting: {
      on: {
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    panning: {
      on: {
        UPDATE_PAN: {
          actions: assign({
            lastScreenX: ({ event }) => event.screenX,
            lastScreenY: ({ event }) => event.screenY,
          }),
        },
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
  },
});

export const interactionActor = createActor(interactionMachine).start();
