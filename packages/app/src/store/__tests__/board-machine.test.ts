import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { boardMachine } from "../board-machine";
import type { BoardComponent, Wire } from "@dreamer/schemas";

function createTestComponent(overrides: Partial<BoardComponent> = {}): BoardComponent {
  return {
    id: crypto.randomUUID(),
    type: "led",
    name: "LED",
    x: 10,
    y: 5,
    rotation: 0,
    pins: { anode: 13, cathode: null },
    properties: { color: "#ef4444" },
    ...overrides,
  };
}

function createTestWire(overrides: Partial<Wire> = {}): Wire {
  return {
    id: crypto.randomUUID(),
    fromRow: 1,
    fromCol: 1,
    toRow: 10,
    toCol: 5,
    color: "#22c55e",
    ...overrides,
  };
}

describe("boardMachine", () => {
  test("initial context has empty board with 20 pins", () => {
    const actor = createActor(boardMachine).start();
    const ctx = actor.getSnapshot().context;
    expect(Object.keys(ctx.components)).toHaveLength(0);
    expect(Object.keys(ctx.wires)).toHaveLength(0);
    expect(ctx.pinStates).toHaveLength(20);
    expect(ctx.selectedId).toBeNull();
    expect(ctx.sketchCode).toBe("");
    expect(ctx.serialOutput).toEqual([]);
    actor.stop();
  });

  test("PLACE_COMPONENT adds component and selects it", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({ id: "led-1" });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    const ctx = actor.getSnapshot().context;
    expect(ctx.components["led-1"]).toEqual(led);
    expect(ctx.selectedId).toBe("led-1");
    actor.stop();
  });

  test("REMOVE_COMPONENT removes and deselects", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({ id: "led-1" });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    actor.send({ type: "REMOVE_COMPONENT", id: "led-1" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.components["led-1"]).toBeUndefined();
    expect(ctx.selectedId).toBeNull();
    actor.stop();
  });

  test("MOVE_COMPONENT updates position", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({ id: "led-1" });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    actor.send({ type: "MOVE_COMPONENT", id: "led-1", x: 20, y: 15 });
    const ctx = actor.getSnapshot().context;
    expect(ctx.components["led-1"].x).toBe(20);
    expect(ctx.components["led-1"].y).toBe(15);
    actor.stop();
  });

  test("ADD_WIRE and REMOVE_WIRE", () => {
    const actor = createActor(boardMachine).start();
    const wire = createTestWire({ id: "wire-1" });
    actor.send({ type: "ADD_WIRE", wire });
    expect(actor.getSnapshot().context.wires["wire-1"]).toEqual(wire);
    actor.send({ type: "REMOVE_WIRE", id: "wire-1" });
    expect(actor.getSnapshot().context.wires["wire-1"]).toBeUndefined();
    actor.stop();
  });

  test("SET_PIN_STATE updates specific pin", () => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "SET_PIN_STATE", pin: 13, changes: { mode: "OUTPUT", digitalValue: 1 } });
    const pin13 = actor.getSnapshot().context.pinStates[13];
    expect(pin13.mode).toBe("OUTPUT");
    expect(pin13.digitalValue).toBe(1);
    actor.stop();
  });

  test("UPDATE_SKETCH stores code", () => {
    const actor = createActor(boardMachine).start();
    const code = "void setup() { pinMode(13, OUTPUT); }";
    actor.send({ type: "UPDATE_SKETCH", code });
    expect(actor.getSnapshot().context.sketchCode).toBe(code);
    actor.stop();
  });

  test("APPEND_SERIAL and CLEAR_SERIAL", () => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "APPEND_SERIAL", text: "Hello" });
    actor.send({ type: "APPEND_SERIAL", text: "World" });
    expect(actor.getSnapshot().context.serialOutput).toEqual(["Hello", "World"]);
    actor.send({ type: "CLEAR_SERIAL" });
    expect(actor.getSnapshot().context.serialOutput).toEqual([]);
    actor.stop();
  });

  test("UNDO/REDO for component placement", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({ id: "led-1" });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    expect(Object.keys(actor.getSnapshot().context.components)).toHaveLength(1);

    actor.send({ type: "UNDO" });
    expect(Object.keys(actor.getSnapshot().context.components)).toHaveLength(0);

    actor.send({ type: "REDO" });
    expect(Object.keys(actor.getSnapshot().context.components)).toHaveLength(1);
    actor.stop();
  });

  test("RESET_PINS restores all pins to defaults", () => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "SET_PIN_STATE", pin: 13, changes: { mode: "OUTPUT", digitalValue: 1 } });
    actor.send({ type: "RESET_PINS" });
    const pin13 = actor.getSnapshot().context.pinStates[13];
    expect(pin13.mode).toBe("UNSET");
    expect(pin13.digitalValue).toBe(0);
    actor.stop();
  });

  test("LOAD_BOARD replaces entire state", () => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "PLACE_COMPONENT", component: createTestComponent({ id: "old" }) });
    actor.send({
      type: "LOAD_BOARD",
      state: {
        components: { new1: createTestComponent({ id: "new1", name: "New LED" }) },
        wires: {},
        pinStates: actor.getSnapshot().context.pinStates,
        libraryState: { servos: {}, lcd: null, serialBaud: 9600 },
        serialOutput: ["loaded"],
        sketchCode: "// loaded",
      },
    });
    const ctx = actor.getSnapshot().context;
    expect(ctx.components["old"]).toBeUndefined();
    expect(ctx.components["new1"].name).toBe("New LED");
    expect(ctx.serialOutput).toEqual(["loaded"]);
    expect(ctx.libraryState.serialBaud).toBe(9600);
    expect(ctx._past).toHaveLength(0); // history reset on load
    actor.stop();
  });
});
