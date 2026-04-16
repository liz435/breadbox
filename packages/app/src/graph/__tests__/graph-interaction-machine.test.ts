import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { graphInteractionMachine } from "@/graph/graph-interaction-machine";

const RESET_CONTEXT = {
  nodeId: null,
  portNodeId: null,
  portId: null,
  lastScreenX: 0,
  lastScreenY: 0,
  boxStart: null,
};

function createTestActor() {
  const actor = createActor(graphInteractionMachine);
  actor.start();
  return actor;
}

describe("graphInteractionMachine", () => {
  test("starts in idle with reset context", () => {
    const actor = createTestActor();
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context).toEqual(RESET_CONTEXT);
  });

  test("dragging node stores node id and resets on release", () => {
    const actor = createTestActor();
    actor.send({ type: "START_DRAG_NODE", nodeId: "node-1" });
    expect(actor.getSnapshot().value).toBe("draggingNode");
    expect(actor.getSnapshot().context.nodeId).toBe("node-1");

    actor.send({ type: "RELEASE" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context).toEqual(RESET_CONTEXT);
  });

  test("connecting stores source port details and resets on release", () => {
    const actor = createTestActor();
    actor.send({ type: "START_CONNECT", portNodeId: "node-2", portId: "flow_out" });
    expect(actor.getSnapshot().value).toBe("connecting");
    expect(actor.getSnapshot().context.portNodeId).toBe("node-2");
    expect(actor.getSnapshot().context.portId).toBe("flow_out");

    actor.send({ type: "RELEASE" });
    expect(actor.getSnapshot().context).toEqual(RESET_CONTEXT);
  });

  test("panning updates screen coordinates and ignores UPDATE_PAN while idle", () => {
    const actor = createTestActor();

    actor.send({ type: "UPDATE_PAN", screenX: 300, screenY: 400 });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context).toEqual(RESET_CONTEXT);

    actor.send({ type: "START_PAN", screenX: 100, screenY: 200 });
    actor.send({ type: "UPDATE_PAN", screenX: 150, screenY: 250 });
    expect(actor.getSnapshot().value).toBe("panning");
    expect(actor.getSnapshot().context.lastScreenX).toBe(150);
    expect(actor.getSnapshot().context.lastScreenY).toBe(250);
  });

  test("box selection stores box start and resets on release", () => {
    const actor = createTestActor();
    actor.send({ type: "START_BOX_SELECT", x: 10, y: 20 });
    expect(actor.getSnapshot().value).toBe("boxSelecting");
    expect(actor.getSnapshot().context.boxStart).toEqual({ x: 10, y: 20 });

    actor.send({ type: "RELEASE" });
    expect(actor.getSnapshot().context).toEqual(RESET_CONTEXT);
  });
});
