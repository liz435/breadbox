import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { boardMachine } from "../board-machine";
import { DEFAULT_SKETCH_CODE, type BoardComponent, type Wire } from "@dreamer/schemas";

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

// The machine seeds an explicit `breadboard-1` in initial context so the
// canvas always paints a surface board. Tests that count `components`
// must account for it; see board-machine-undo.test.ts for the same pattern.
const SEED_COUNT = 1;

describe("boardMachine", () => {
  test("initial context contains only the seeded breadboard", () => {
    const actor = createActor(boardMachine).start();
    const ctx = actor.getSnapshot().context;
    expect(Object.keys(ctx.components)).toHaveLength(SEED_COUNT);
    expect(ctx.components["breadboard-1"]?.type).toBe("breadboard_full");
    expect(Object.keys(ctx.wires)).toHaveLength(0);
    expect(ctx.selectedId).toBeNull();
    expect(ctx.sketchCode).toBe(DEFAULT_SKETCH_CODE);
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

  // Pin state is now owned by the PinStateStore, not the board machine.
  // Cross-reference tests for the store live in simulator/__tests__.

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
    const out = actor.getSnapshot().context.serialOutput
    expect(out.map((e) => e.text)).toEqual(["Hello", "World"]);
    actor.send({ type: "CLEAR_SERIAL" });
    expect(actor.getSnapshot().context.serialOutput).toEqual([]);
    actor.stop();
  });

  test("UNDO/REDO for component placement", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({ id: "led-1" });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    expect(Object.keys(actor.getSnapshot().context.components)).toHaveLength(1 + SEED_COUNT);

    actor.send({ type: "UNDO" });
    expect(Object.keys(actor.getSnapshot().context.components)).toHaveLength(0 + SEED_COUNT);

    actor.send({ type: "REDO" });
    expect(Object.keys(actor.getSnapshot().context.components)).toHaveLength(1 + SEED_COUNT);
    actor.stop();
  });

  test("UNDO/REDO for component move", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({ id: "led-1", x: 10, y: 5 });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    actor.send({ type: "MOVE_COMPONENT", id: "led-1", x: 20, y: 15 });
    expect(actor.getSnapshot().context.components["led-1"].x).toBe(20);
    expect(actor.getSnapshot().context.components["led-1"].y).toBe(15);

    actor.send({ type: "UNDO" });
    expect(actor.getSnapshot().context.components["led-1"].x).toBe(10);
    expect(actor.getSnapshot().context.components["led-1"].y).toBe(5);

    actor.send({ type: "REDO" });
    expect(actor.getSnapshot().context.components["led-1"].x).toBe(20);
    expect(actor.getSnapshot().context.components["led-1"].y).toBe(15);
    actor.stop();
  });

  test("UNDO/REDO for component update", () => {
    const actor = createActor(boardMachine).start();
    const led = createTestComponent({
      id: "led-1",
      properties: { color: "#ef4444" },
      rotation: 0,
    });
    actor.send({ type: "PLACE_COMPONENT", component: led });
    actor.send({
      type: "UPDATE_COMPONENT",
      id: "led-1",
      changes: { rotation: 1, properties: { color: "#22c55e" } },
    });
    expect(actor.getSnapshot().context.components["led-1"].rotation).toBe(1);
    expect(actor.getSnapshot().context.components["led-1"].properties.color).toBe("#22c55e");

    actor.send({ type: "UNDO" });
    expect(actor.getSnapshot().context.components["led-1"].rotation).toBe(0);
    expect(actor.getSnapshot().context.components["led-1"].properties.color).toBe("#ef4444");

    actor.send({ type: "REDO" });
    expect(actor.getSnapshot().context.components["led-1"].rotation).toBe(1);
    expect(actor.getSnapshot().context.components["led-1"].properties.color).toBe("#22c55e");
    actor.stop();
  });

  test("RESET_PINS dispatches without error (pin state owned by PinStateStore)", () => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "RESET_PINS" });
    // No assertion on pinStates — they no longer live on the machine context.
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
        libraryState: { servos: {}, lcd: null, serialBaud: 9600, oled: {}, neopixels: {} },
        serialOutput: [{ text: "loaded", ts: 0 }],
        sketchCode: "// loaded",
        customLibraries: {},
        environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
      },
    });
    const ctx = actor.getSnapshot().context;
    expect(ctx.components["old"]).toBeUndefined();
    expect(ctx.components["new1"].name).toBe("New LED");
    expect(ctx.serialOutput.map((e) => e.text)).toEqual(["loaded"]);
    expect(ctx.libraryState.serialBaud).toBe(9600);
    expect(ctx._past).toHaveLength(0); // history reset on load
    actor.stop();
  });

  test("LOAD_BOARD seeds default sketch for empty legacy board", () => {
    const actor = createActor(boardMachine).start();
    actor.send({
      type: "LOAD_BOARD",
      state: {
        components: {},
        wires: {},
        libraryState: { servos: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {} },
        serialOutput: [],
        sketchCode: "",
        customLibraries: {},
        environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
      },
    });
    expect(actor.getSnapshot().context.sketchCode).toBe(DEFAULT_SKETCH_CODE);
    actor.stop();
  });

  test("LOAD_BOARD normalizes legacy DC motor wiring swap", () => {
    const actor = createActor(boardMachine).start();
    actor.send({
      type: "LOAD_BOARD",
      state: {
        components: {
          "psu-1": {
            id: "psu-1",
            type: "power_supply",
            name: "External 5V",
            x: 0,
            y: 0,
            rotation: 0,
            pins: {},
            properties: { leftVoltage: 5, rightVoltage: 5 },
          },
          "motor-1": {
            id: "motor-1",
            type: "dc_motor",
            name: "DC Motor",
            x: 7,
            y: 5,
            rotation: 0,
            pins: { signal: 9 },
            properties: {},
          },
        },
        wires: {
          "wire-d9": {
            id: "wire-d9",
            fromRow: -999,
            fromCol: 9,
            toRow: 5,
            toCol: 7,
            color: "#fbbf24",
          },
          "wire-vcc": {
            id: "wire-vcc",
            fromRow: 0,
            fromCol: 11,
            toRow: 6,
            toCol: 7,
            color: "#ef4444",
          },
          "wire-gnd": {
            id: "wire-gnd",
            fromRow: 0,
            fromCol: 10,
            toRow: 7,
            toCol: 7,
            color: "#1a1a1a",
          },
        },
        libraryState: { servos: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {} },
        serialOutput: [],
        sketchCode: "// motor",
        customLibraries: {},
        environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
      },
    });

    const ctx = actor.getSnapshot().context;
    expect(ctx.wires["wire-d9"]?.toRow).toBe(6);
    expect(ctx.wires["wire-d9"]?.toCol).toBe(7);
    expect(ctx.wires["wire-vcc"]?.toRow).toBe(5);
    expect(ctx.wires["wire-vcc"]?.toCol).toBe(7);
    expect(ctx.wires["wire-gnd"]).toBeUndefined();
    actor.stop();
  });
});
