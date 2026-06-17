import { setup, assign, createActor } from "xstate";
import type { PlaceableComponentType } from "@dreamer/schemas";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";

type InteractionContext = {
  mode: "idle" | "placing" | "wiring" | "dragging" | "wiring_from_pin";
  /** Board-coordinate X from latest pointer move (used for ghost previews). */
  currentX: number;
  /** Board-coordinate Y from latest pointer move. */
  currentY: number;
  /** Snapped grid row from latest pointer move. */
  gridRow: number | null;
  /** Snapped grid col from latest pointer move. */
  gridCol: number | null;

  // ── Placing state ──
  componentType: PlaceableComponentType | null;
  placingRotation: number;

  // ── Wiring (hole-to-hole) state ──
  fromRow: number | null;
  fromCol: number | null;
  /** When true, the first wire click has been made. */
  wireStartSet: boolean;

  // ── Dragging state ──
  componentId: string | null;
  offsetX: number;
  offsetY: number;
  dragStartRow: number;
  dragStartCol: number;

  // ── Arduino-pin wiring state ──
  wireFromPin: ArduinoPinInfo | null;
  wireFromX: number;
  wireFromY: number;
};

type InteractionEvent =
  | { type: "START_PLACE"; componentType: PlaceableComponentType }
  | { type: "START_WIRE"; fromRow: number; fromCol: number }
  | { type: "SET_WIRE_START"; row: number; col: number }
  | { type: "START_DRAG"; componentId: string; offsetX: number; offsetY: number; startRow: number; startCol: number }
  | { type: "START_WIRE_FROM_PIN"; pin: ArduinoPinInfo; pinX: number; pinY: number }
  | { type: "POINTER_MOVE"; x: number; y: number; gridRow: number; gridCol: number }
  | { type: "POINTER_UP" }
  | { type: "CANCEL" }
  | { type: "ROTATE" };

const initialContext: InteractionContext = {
  mode: "idle",
  currentX: 0,
  currentY: 0,
  gridRow: null,
  gridCol: null,
  componentType: null,
  placingRotation: 0,
  fromRow: null,
  fromCol: null,
  wireStartSet: false,
  componentId: null,
  offsetX: 0,
  offsetY: 0,
  dragStartRow: 0,
  dragStartCol: 0,
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
            placingRotation: () => 0,
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
            dragStartRow: ({ event }) => event.startRow,
            dragStartCol: ({ event }) => event.startCol,
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
            gridRow: ({ event }) => event.gridRow,
            gridCol: ({ event }) => event.gridCol,
          }),
        },
        SET_WIRE_START: {
          actions: assign({
            fromRow: ({ event }) => event.row,
            fromCol: ({ event }) => event.col,
            wireStartSet: () => true,
          }),
        },
        ROTATE: {
          actions: assign({
            placingRotation: ({ context }) => (context.placingRotation + 1) % 4,
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
            gridRow: ({ event }) => event.gridRow,
            gridCol: ({ event }) => event.gridCol,
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
            gridRow: ({ event }) => event.gridRow,
            gridCol: ({ event }) => event.gridCol,
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
            gridRow: ({ event }) => event.gridRow,
            gridCol: ({ event }) => event.gridCol,
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
