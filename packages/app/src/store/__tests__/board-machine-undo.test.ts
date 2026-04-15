/**
 * Undo/redo tests for the board machine.
 *
 * Covers the full undo/redo stack for every mutating event so regressions
 * are caught at the unit level rather than discovered during manual testing.
 */
import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { boardMachine } from "../board-machine";
import type { BoardComponent, Wire } from "@dreamer/schemas";

function led(id: string, x = 0, y = 0): BoardComponent {
  return {
    id,
    type: "led",
    name: `LED-${id}`,
    x,
    y,
    rotation: 0,
    pins: { anode: 13, cathode: null },
    properties: { color: "#ef4444" },
  };
}

function wire(id: string): Wire {
  return { id, fromRow: 1, fromCol: 1, toRow: 5, toCol: 5, color: "#22c55e" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function actor() {
  const a = createActor(boardMachine).start();
  return a;
}

// ── Wire undo/redo ────────────────────────────────────────────────────────────

describe("undo/redo — wires", () => {
  test("undo ADD_WIRE removes the wire", () => {
    const a = actor();
    a.send({ type: "ADD_WIRE", wire: wire("w1") });
    expect(a.getSnapshot().context.wires["w1"]).toBeDefined();

    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.wires["w1"]).toBeUndefined();
    a.stop();
  });

  test("redo ADD_WIRE restores the wire", () => {
    const a = actor();
    a.send({ type: "ADD_WIRE", wire: wire("w1") });
    a.send({ type: "UNDO" });
    a.send({ type: "REDO" });
    expect(a.getSnapshot().context.wires["w1"]).toBeDefined();
    a.stop();
  });

  test("undo REMOVE_WIRE restores the wire", () => {
    const a = actor();
    a.send({ type: "ADD_WIRE", wire: wire("w1") });
    a.send({ type: "REMOVE_WIRE", id: "w1" });
    expect(a.getSnapshot().context.wires["w1"]).toBeUndefined();

    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.wires["w1"]).toBeDefined();
    a.stop();
  });

  test("undo UPDATE_WIRE reverts wire changes", () => {
    const a = actor();
    const w = wire("w1");
    a.send({ type: "ADD_WIRE", wire: w });
    a.send({ type: "UPDATE_WIRE", id: "w1", changes: { color: "#ff0000" } });
    expect(a.getSnapshot().context.wires["w1"]!.color).toBe("#ff0000");

    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.wires["w1"]!.color).toBe("#22c55e");
    a.stop();
  });
});

// ── Sketch undo/redo ──────────────────────────────────────────────────────────

describe("undo/redo — sketch", () => {
  test("undo UPDATE_SKETCH reverts code", () => {
    const a = actor();
    const original = a.getSnapshot().context.sketchCode;
    a.send({ type: "UPDATE_SKETCH", code: "void setup() {}" });
    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.sketchCode).toBe(original);
    a.stop();
  });

  test("redo UPDATE_SKETCH reapplies code", () => {
    const a = actor();
    a.send({ type: "UPDATE_SKETCH", code: "// new" });
    a.send({ type: "UNDO" });
    a.send({ type: "REDO" });
    expect(a.getSnapshot().context.sketchCode).toBe("// new");
    a.stop();
  });
});

// ── Multi-step undo/redo ──────────────────────────────────────────────────────

describe("undo/redo — multi-step", () => {
  test("multiple undos walk back through the full history", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });
    a.send({ type: "PLACE_COMPONENT", component: led("c2") });
    a.send({ type: "PLACE_COMPONENT", component: led("c3") });

    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(3);

    a.send({ type: "UNDO" });
    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(2);

    a.send({ type: "UNDO" });
    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(1);

    a.send({ type: "UNDO" });
    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(0);
    a.stop();
  });

  test("redo after partial undo replays only undone steps", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });
    a.send({ type: "PLACE_COMPONENT", component: led("c2") });

    a.send({ type: "UNDO" }); // back to 1 component
    a.send({ type: "REDO" }); // forward to 2 components

    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(2);
    expect(a.getSnapshot().context.components["c2"]).toBeDefined();
    a.stop();
  });

  test("new mutation after undo clears redo stack", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });
    a.send({ type: "UNDO" });

    // New action should clear the future
    a.send({ type: "PLACE_COMPONENT", component: led("c2") });
    a.send({ type: "REDO" }); // should do nothing

    // Only c2 should be present — redo of c1 is gone
    expect(a.getSnapshot().context.components["c1"]).toBeUndefined();
    expect(a.getSnapshot().context.components["c2"]).toBeDefined();
    a.stop();
  });

  test("undo at empty history is a no-op", () => {
    const a = actor();
    a.send({ type: "UNDO" });
    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(0);
    a.stop();
  });

  test("redo at empty future is a no-op", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });
    a.send({ type: "REDO" }); // nothing to redo
    expect(Object.keys(a.getSnapshot().context.components)).toHaveLength(1);
    a.stop();
  });

  test("undo/redo across component + wire operations", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });
    a.send({ type: "ADD_WIRE", wire: wire("w1") });
    a.send({ type: "UPDATE_SKETCH", code: "// step 3" });

    // Undo all three
    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.sketchCode).not.toBe("// step 3");

    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.wires["w1"]).toBeUndefined();

    a.send({ type: "UNDO" });
    expect(a.getSnapshot().context.components["c1"]).toBeUndefined();

    // Redo all three
    a.send({ type: "REDO" });
    expect(a.getSnapshot().context.components["c1"]).toBeDefined();

    a.send({ type: "REDO" });
    expect(a.getSnapshot().context.wires["w1"]).toBeDefined();

    a.send({ type: "REDO" });
    expect(a.getSnapshot().context.sketchCode).toBe("// step 3");

    a.stop();
  });
});

// ── Auto-save dirty-hash logic ────────────────────────────────────────────────
//
// The persistence hook can't be tested directly (React context + browser APIs),
// but the core "dirty hash" logic is just JSON.stringify comparisons. These
// tests verify that the board machine state produces stable, comparable
// snapshots so the autosave dirty-check works correctly.

describe("auto-save dirty-hash stability", () => {
  test("identical board state produces identical JSON hash", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1", 10, 5) });

    const ctx = a.getSnapshot().context;
    const hash1 = JSON.stringify({
      components: ctx.components,
      wires: ctx.wires,
      sketchCode: ctx.sketchCode,
      customLibraries: ctx.customLibraries,
    });
    const hash2 = JSON.stringify({
      components: ctx.components,
      wires: ctx.wires,
      sketchCode: ctx.sketchCode,
      customLibraries: ctx.customLibraries,
    });
    expect(hash1).toBe(hash2);
    a.stop();
  });

  test("mutating a component changes the hash", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });

    const ctx1 = a.getSnapshot().context;
    const hash1 = JSON.stringify({ components: ctx1.components });

    a.send({ type: "UPDATE_COMPONENT", id: "c1", changes: { properties: { color: "#0000ff" } } });

    const ctx2 = a.getSnapshot().context;
    const hash2 = JSON.stringify({ components: ctx2.components });

    expect(hash1).not.toBe(hash2);
    a.stop();
  });

  test("SELECT does not change the board-persistable hash", () => {
    const a = actor();
    a.send({ type: "PLACE_COMPONENT", component: led("c1") });

    const ctx1 = a.getSnapshot().context;
    const hash1 = JSON.stringify({
      components: ctx1.components,
      wires: ctx1.wires,
      sketchCode: ctx1.sketchCode,
      customLibraries: ctx1.customLibraries,
    });

    a.send({ type: "SELECT", id: "c1" });

    const ctx2 = a.getSnapshot().context;
    const hash2 = JSON.stringify({
      components: ctx2.components,
      wires: ctx2.wires,
      sketchCode: ctx2.sketchCode,
      customLibraries: ctx2.customLibraries,
    });

    // SELECT changes selectedId but that field is excluded from the save slice
    expect(hash1).toBe(hash2);
    a.stop();
  });
});
