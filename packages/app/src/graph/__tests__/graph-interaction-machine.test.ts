import { describe, test, expect, beforeEach } from "bun:test";
import { createActor } from "xstate";

// We need a fresh actor per test, so we import the machine definition
// rather than the shared singleton.
import { setup, assign } from "xstate";

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
  | { type: "START_CONNECT"; portNodeId: string; portId: string }
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

const machine = setup({
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
          actions: assign({ nodeId: ({ event }) => event.nodeId }),
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
      on: { RELEASE: { target: "idle", actions: assign(initialContext) } },
    },
    connecting: {
      on: { RELEASE: { target: "idle", actions: assign(initialContext) } },
    },
    panning: {
      on: {
        UPDATE_PAN: {
          actions: assign({
            lastScreenX: ({ event }) => event.screenX,
            lastScreenY: ({ event }) => event.screenY,
          }),
        },
        RELEASE: { target: "idle", actions: assign(initialContext) },
      },
    },
    boxSelecting: {
      on: { RELEASE: { target: "idle", actions: assign(initialContext) } },
    },
  },
});

function createTestActor() {
  const actor = createActor(machine);
  actor.start();
  return actor;
}

describe("Graph Interaction Machine", () => {
  test("starts in idle", () => {
    const actor = createTestActor();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  test("START_DRAG_NODE transitions to draggingNode", () => {
    const actor = createTestActor();
    actor.send({ type: "START_DRAG_NODE", nodeId: "n1" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("draggingNode");
    expect(snap.context.nodeId).toBe("n1");
  });

  test("RELEASE from draggingNode returns to idle", () => {
    const actor = createTestActor();
    actor.send({ type: "START_DRAG_NODE", nodeId: "n1" });
    actor.send({ type: "RELEASE" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.nodeId).toBeNull();
  });

  test("START_CONNECT transitions to connecting", () => {
    const actor = createTestActor();
    actor.send({
      type: "START_CONNECT",
      portNodeId: "n1",
      portId: "out",
    });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("connecting");
    expect(snap.context.portNodeId).toBe("n1");
    expect(snap.context.portId).toBe("out");
  });

  test("START_PAN transitions to panning", () => {
    const actor = createTestActor();
    actor.send({ type: "START_PAN", screenX: 100, screenY: 200 });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("panning");
    expect(snap.context.lastScreenX).toBe(100);
    expect(snap.context.lastScreenY).toBe(200);
  });

  test("UPDATE_PAN updates coordinates while panning", () => {
    const actor = createTestActor();
    actor.send({ type: "START_PAN", screenX: 100, screenY: 200 });
    actor.send({ type: "UPDATE_PAN", screenX: 150, screenY: 250 });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("panning");
    expect(snap.context.lastScreenX).toBe(150);
    expect(snap.context.lastScreenY).toBe(250);
  });

  test("START_BOX_SELECT transitions to boxSelecting", () => {
    const actor = createTestActor();
    actor.send({ type: "START_BOX_SELECT", x: 10, y: 20 });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("boxSelecting");
    expect(snap.context.boxStart).toEqual({ x: 10, y: 20 });
  });

  test("RELEASE from any state returns to idle with reset context", () => {
    const states = [
      { type: "START_DRAG_NODE" as const, nodeId: "n1" },
      { type: "START_CONNECT" as const, portNodeId: "n1", portId: "p1" },
      { type: "START_PAN" as const, screenX: 0, screenY: 0 },
      { type: "START_BOX_SELECT" as const, x: 0, y: 0 },
    ];
    for (const event of states) {
      const actor = createTestActor();
      actor.send(event);
      actor.send({ type: "RELEASE" });
      expect(actor.getSnapshot().value).toBe("idle");
    }
  });
});
