import { setup, assign, createActor } from "xstate";

type GraphInteractionContext = {
  nodeId: string | null;
  portNodeId: string | null;
  portId: string | null;
  lastScreenX: number;
  lastScreenY: number;
  boxStart: { x: number; y: number } | null;
};

type GraphInteractionEvent =
  | { type: "START_DRAG_NODE"; nodeId: string }
  | {
      type: "START_CONNECT";
      portNodeId: string;
      portId: string;
    }
  | { type: "START_PAN"; screenX: number; screenY: number }
  | { type: "UPDATE_PAN"; screenX: number; screenY: number }
  | { type: "START_BOX_SELECT"; x: number; y: number }
  | { type: "RELEASE" };

const initialContext: GraphInteractionContext = {
  nodeId: null,
  portNodeId: null,
  portId: null,
  lastScreenX: 0,
  lastScreenY: 0,
  boxStart: null,
};

export const graphInteractionMachine = setup({
  types: {
    context: {} as GraphInteractionContext,
    events: {} as GraphInteractionEvent,
  },
}).createMachine({
  id: "graphInteraction",
  initial: "idle",
  context: initialContext,
  states: {
    idle: {
      on: {
        START_DRAG_NODE: {
          target: "draggingNode",
          actions: assign({
            nodeId: ({ event }) => event.nodeId,
          }),
        },
        START_CONNECT: {
          target: "connecting",
          actions: assign({
            portNodeId: ({ event }) => event.portNodeId,
            portId: ({ event }) => event.portId,
          }),
        },
        START_PAN: {
          target: "panning",
          actions: assign({
            lastScreenX: ({ event }) => event.screenX,
            lastScreenY: ({ event }) => event.screenY,
          }),
        },
        START_BOX_SELECT: {
          target: "boxSelecting",
          actions: assign({
            boxStart: ({ event }) => ({ x: event.x, y: event.y }),
          }),
        },
      },
    },
    draggingNode: {
      on: {
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
    connecting: {
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
    boxSelecting: {
      on: {
        RELEASE: {
          target: "idle",
          actions: assign(initialContext),
        },
      },
    },
  },
});

export const graphInteractionActor = createActor(
  graphInteractionMachine
).start();
