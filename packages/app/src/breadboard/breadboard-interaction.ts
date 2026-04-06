import { setup, assign, createActor } from "xstate";
import type { ComponentType } from "@dreamer/schemas";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";

type InteractionContext = {
  mode: "idle" | "placing" | "wiring" | "dragging" | "wiring_from_pin";
  currentX: number;
  currentY: number;
  componentType: ComponentType | null;
  fromRow: number | null;
  fromCol: number | null;
  componentId: string | null;
  offsetX: number;
  offsetY: number;
  wireFromPin: ArduinoPinInfo | null;
  wireFromX: number;
  wireFromY: number;
};

type InteractionEvent =
  | { type: "START_PLACE"; componentType: ComponentType }
  | { type: "START_WIRE"; fromRow: number; fromCol: number }
  | { type: "START_DRAG"; componentId: string; offsetX: number; offsetY: number }
  | { type: "START_WIRE_FROM_PIN"; pin: ArduinoPinInfo; pinX: number; pinY: number }
  | { type: "POINTER_MOVE"; x: number; y: number }
  | { type: "POINTER_UP" }
  | { type: "CANCEL" };

const initialContext: InteractionContext = {
  mode: "idle",
  currentX: 0,
  currentY: 0,
  componentType: null,
  fromRow: null,
  fromCol: null,
  componentId: null,
  offsetX: 0,
  offsetY: 0,
  wireFromPin: null,
  wireFromX: 0,
  wireFromY: 0,
};

const breadboardInteractionMachine = setup({
  types: {
    context: {} as InteractionContext,
    events: {} as InteractionEvent,
  },
}).createMachine({
  id: "breadboardInteraction",
  initial: "idle",
  context: initialContext,
  states: {
    idle: {
      on: {
        START_PLACE: {
          target: "placing",
          actions: assign({
            mode: () => "placing" as const,
            componentType: ({ event }) => event.componentType,
          }),
        },
        START_WIRE: {
          target: "wiring",
          actions: assign({
            mode: () => "wiring" as const,
            fromRow: ({ event }) => event.fromRow,
            fromCol: ({ event }) => event.fromCol,
          }),
        },
        START_DRAG: {
          target: "dragging",
          actions: assign({
            mode: () => "dragging" as const,
            componentId: ({ event }) => event.componentId,
            offsetX: ({ event }) => event.offsetX,
            offsetY: ({ event }) => event.offsetY,
          }),
        },
        START_WIRE_FROM_PIN: {
          target: "wiring_from_pin",
          actions: assign({
            mode: () => "wiring_from_pin" as const,
            wireFromPin: ({ event }) => event.pin,
            wireFromX: ({ event }) => event.pinX,
            wireFromY: ({ event }) => event.pinY,
          }),
        },
      },
    },
    placing: {
      on: {
        POINTER_MOVE: {
          actions: assign({
            currentX: ({ event }) => event.x,
            currentY: ({ event }) => event.y,
          }),
        },
        POINTER_UP: {
          target: "idle",
          actions: assign(initialContext),
        },
        CANCEL: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    wiring: {
      on: {
        POINTER_MOVE: {
          actions: assign({
            currentX: ({ event }) => event.x,
            currentY: ({ event }) => event.y,
          }),
        },
        POINTER_UP: {
          target: "idle",
          actions: assign(initialContext),
        },
        CANCEL: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    dragging: {
      on: {
        POINTER_MOVE: {
          actions: assign({
            currentX: ({ event }) => event.x,
            currentY: ({ event }) => event.y,
          }),
        },
        POINTER_UP: {
          target: "idle",
          actions: assign(initialContext),
        },
        CANCEL: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    wiring_from_pin: {
      on: {
        POINTER_MOVE: {
          actions: assign({
            currentX: ({ event }) => event.x,
            currentY: ({ event }) => event.y,
          }),
        },
        POINTER_UP: {
          target: "idle",
          actions: assign(initialContext),
        },
        CANCEL: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
  },
});

export type { InteractionContext, InteractionEvent };

export const breadboardInteractionActor = createActor(
  breadboardInteractionMachine
).start();
