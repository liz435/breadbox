import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardOp, type BoardState } from "@dreamer/schemas";
import type { ProjectFile } from "../../../db/schemas";
import { createCoreTools } from "../tools";

// Minimal project shell — same shape used by apply-design.test.ts.
function makeProject(boardState: BoardState): ProjectFile {
  const now = new Date().toISOString();
  return {
    project: {
      id: "project-1",
      name: "Test Project",
      ownerId: "test",
      version: 1,
      createdAt: now,
      updatedAt: now,
      threadId: "thread-1",
      activeSceneId: "scene-1",
    },
    scenes: {
      "scene-1": {
        id: "scene-1",
        name: "Scene 1",
        version: 1,
        settings: { background: "#000000", gravity: { x: 0, y: 0 } },
      },
    },
    entities: {},
    sceneEntityIds: { "scene-1": [] },
    components: {
      transform: {}, sprite: {}, tilemap: {}, physicsBody: {},
      script: {}, camera: {},
    },
    assets: {},
    boardState,
  };
}

async function runPropose(
  tools: ReturnType<typeof createCoreTools>["tools"],
  input: unknown,
): Promise<Record<string, unknown>> {
  const execute = tools.propose_circuit.execute as unknown as (
    payload: unknown,
    options: unknown,
  ) => Promise<Record<string, unknown>>;
  return execute(input, {});
}

describe("propose_circuit — throughComponent series routing", () => {
  test("does not short the resistor when entry pin shares a bus with the target", async () => {
    // Regression for the "electricity bypasses the resistor" bug. The
    // model called throughEntryPin="b" / throughExitPin="a" — meaning
    // Arduino enters the resistor at pin b (col 6, RIGHT strip) and the
    // signal exits at pin a (col 3, LEFT strip) heading for a target on
    // the right strip (seven_segment.a at col 5). The codegen used to
    // emit a jumper from (row, 3) → (row, 5), which combined with the
    // right-strip-bus shared by entry pin and target effectively put a
    // zero-ohm wire in parallel with the resistor body — current
    // bypasses the 220Ω entirely. The fix: when the entry pin's bus
    // already includes the target, swap entry/exit so the resistor
    // body becomes the only path between strips.
    const board = createDefaultBoardState();
    board.boardTarget = "arduino_uno";
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project, sceneId: "scene-1", ops, mode: "all", workingBoard: board,
    });

    const result = await runPropose(tools, {
      components: [
        {
          type: "seven_segment",
          name: "Display",
          pinRoles: {
            a: "signal_output", b: "signal_output", c: "signal_output",
            d: "signal_output", e: "signal_output", f: "signal_output",
            g: "signal_output", dp: "signal_output", gnd: "reference_ground",
          },
        },
        {
          type: "resistor",
          name: "R_a",
          properties: { resistance: 220 },
          pinRoles: { a: "passive_series", b: "signal_output" },
        },
      ],
      wires: [
        // The "wrong way around" pin choice the model produced. Codegen
        // must auto-correct it rather than emit a shorting jumper.
        {
          arduinoPin: 2, toComponent: 0, toPin: "a",
          throughComponent: 1, throughEntryPin: "b", throughExitPin: "a",
          color: "#22c55e",
        },
        { arduinoPin: -3, toComponent: 0, toPin: "gnd", color: "#1e293b" },
      ],
      sketch: "void setup(){pinMode(2,OUTPUT);} void loop(){}",
    });

    expect(result.success).toBe(true);

    // Pull all connect_wire ops emitted by propose_circuit.
    const wires = ops
      .filter((op) => op.kind === "connect_wire")
      .map((op) => (op as Extract<BoardOp, { kind: "connect_wire" }>).payload.wire);

    // The Arduino-to-resistor wire MUST land on the LEFT-strip side of
    // the resistor (col 3) — not the right strip (col 6). If we landed
    // on col 6 we'd be on the same row-bus as seg.a (col 5) and the
    // resistor body would be shorted.
    const arduinoWire = wires.find(
      (w) => w.fromRow === -999 && w.fromCol === 2,
    );
    expect(arduinoWire).toBeDefined();
    expect(arduinoWire!.toCol).toBe(3);

    // No wire should bridge LEFT-strip col 3 directly to RIGHT-strip
    // col 5 on the same row — that would be the shorting jumper.
    const shortingJumper = wires.find(
      (w) =>
        w.fromRow === w.toRow &&
        ((w.fromCol === 3 && w.toCol === 5) ||
          (w.fromCol === 5 && w.toCol === 3)),
    );
    expect(shortingJumper).toBeUndefined();
  });

  test("emits expected wires when model picks correct entry/exit (entry='a', exit='b')", async () => {
    // Same circuit, but with the correct pin orientation. Should
    // behave identically to the auto-corrected case above (no jumper
    // needed because resistor.b shares the right-strip bus with seg.a).
    const board = createDefaultBoardState();
    board.boardTarget = "arduino_uno";
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project, sceneId: "scene-1", ops, mode: "all", workingBoard: board,
    });

    const result = await runPropose(tools, {
      components: [
        {
          type: "seven_segment", name: "Display",
          pinRoles: {
            a: "signal_output", b: "signal_output", c: "signal_output",
            d: "signal_output", e: "signal_output", f: "signal_output",
            g: "signal_output", dp: "signal_output", gnd: "reference_ground",
          },
        },
        {
          type: "resistor", name: "R_a",
          properties: { resistance: 220 },
          pinRoles: { a: "passive_series", b: "signal_output" },
        },
      ],
      wires: [
        {
          arduinoPin: 2, toComponent: 0, toPin: "a",
          throughComponent: 1, throughEntryPin: "a", throughExitPin: "b",
          color: "#22c55e",
        },
        { arduinoPin: -3, toComponent: 0, toPin: "gnd", color: "#1e293b" },
      ],
      sketch: "void setup(){pinMode(2,OUTPUT);} void loop(){}",
    });

    expect(result.success).toBe(true);
    const wires = ops
      .filter((op) => op.kind === "connect_wire")
      .map((op) => (op as Extract<BoardOp, { kind: "connect_wire" }>).payload.wire);
    const arduinoWire = wires.find((w) => w.fromRow === -999 && w.fromCol === 2);
    expect(arduinoWire!.toCol).toBe(3);
    const shortingJumper = wires.find(
      (w) =>
        w.fromRow === w.toRow &&
        ((w.fromCol === 3 && w.toCol === 5) ||
          (w.fromCol === 5 && w.toCol === 3)),
    );
    expect(shortingJumper).toBeUndefined();
  });
});
