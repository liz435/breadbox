import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardOp, type BoardState } from "@dreamer/schemas";
import {
  componentPlacementRowBounds,
  visualRowBoundsOverlap,
} from "@dreamer/board-domain";
import type { ProjectFile } from "../../../db/schemas";
import { createCoreTools } from "../tools";

function makeProject(boardState: BoardState): ProjectFile {
  const now = new Date().toISOString();
  return {
    project: {
      id: "project-psu",
      name: "PSU agent test",
      ownerId: "test",
      version: 1,
      createdAt: now,
      updatedAt: now,
      threadId: "thread-psu",
      activeSceneId: "scene-psu",
    },
    scenes: {
      "scene-psu": {
        id: "scene-psu",
        name: "Scene",
        version: 1,
        settings: { background: "#000000", gravity: { x: 0, y: 0 } },
      },
    },
    entities: {},
    sceneEntityIds: { "scene-psu": [] },
    components: {
      transform: {}, sprite: {}, tilemap: {}, physicsBody: {},
      script: {}, camera: {},
    },
    assets: {},
    boardState,
  };
}

const servoComponents = [
  {
    type: "servo",
    name: "Servo",
    pinRoles: {
      signal: "signal_output",
      vcc: "reference_power",
      gnd: "reference_ground",
    },
  },
  {
    type: "power_supply",
    name: "External 5V Supply",
    pinRoles: {
      positive: "reference_power",
      negative: "reference_ground",
    },
  },
];

const servoWires = [
  { arduinoPin: 9, toComponent: 0, toPin: "signal", color: "#eab308" },
  { fromComponent: 1, fromPin: "positive", toComponent: 0, toPin: "vcc", color: "#ef4444" },
  { fromComponent: 1, fromPin: "negative", toComponent: 0, toPin: "gnd", color: "#1e293b" },
  { arduinoPin: -3, toComponent: 1, toPin: "negative", color: "#1e293b" },
];

const servoSketch = "#include <Servo.h>\nServo s;\nvoid setup(){s.attach(9);}\nvoid loop(){s.write(90);}";

describe("agent external power supply wiring", () => {
  test("propose_circuit places and wires an external PSU for a servo", async () => {
    const board = createDefaultBoardState();
    board.boardTarget = "arduino_uno";
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project, sceneId: "scene-psu", ops, mode: "build", workingBoard: board,
    });

    const execute = tools.propose_circuit.execute as unknown as (
      input: unknown,
      options: unknown,
    ) => Promise<Record<string, unknown>>;
    const result = await execute({
      components: servoComponents,
      wires: servoWires,
      sketch: servoSketch,
    }, {});

    expect(result.success).toBe(true);
    expect(Object.values(board.components).some((c) => c.type === "power_supply")).toBe(true);
    const servo = Object.values(board.components).find((c) => c.type === "servo");
    const powerSupply = Object.values(board.components).find((c) => c.type === "power_supply");
    expect(servo).toBeDefined();
    expect(powerSupply).toBeDefined();
    // The PSU is laid out first; the servo then clears the union of the 2D
    // renderer bounds and calibrated 3D bounds.
    expect(powerSupply!.y).toBeLessThan(servo!.y);
    expect(servo!.y).toBe(27);
    expect(visualRowBoundsOverlap(
      componentPlacementRowBounds(powerSupply!.type, powerSupply!.y),
      componentPlacementRowBounds(servo!.type, servo!.y),
    )).toBe(false);

    const wires = ops
      .filter((op) => op.kind === "connect_wire")
      .map((op) => (op as Extract<BoardOp, { kind: "connect_wire" }>).payload.wire);
    // Arduino GND fans out through a rail anchor, so it produces two wire
    // segments; the two PSU-to-servo wires and signal wire make five total.
    expect(wires).toHaveLength(5);
    expect(wires.some((wire) => wire.fromRow !== -999 && wire.fromCol === 8)).toBe(true);
    expect(wires.some((wire) => wire.fromRow === -999 && wire.fromCol === -3)).toBe(true);
  });

  test("propose_fix accepts a new PSU as the source of servo power wires", async () => {
    const board = createDefaultBoardState();
    board.boardTarget = "arduino_uno";
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project, sceneId: "scene-psu", ops, mode: "edit", workingBoard: board,
    });

    const execute = tools.propose_fix.execute as unknown as (
      input: unknown,
      options: unknown,
    ) => Promise<Record<string, unknown>>;
    const result = await execute({
      addComponents: servoComponents,
      addWires: [
        { arduinoPin: 9, toNewComponent: 0, toPin: "signal", color: "#eab308" },
        { fromNewComponent: 1, fromPin: "positive", toNewComponent: 0, toPin: "vcc", color: "#ef4444" },
        { fromNewComponent: 1, fromPin: "negative", toNewComponent: 0, toPin: "gnd", color: "#1e293b" },
        { arduinoPin: -3, toNewComponent: 1, toPin: "negative", color: "#1e293b" },
      ],
      sketch: servoSketch,
    }, {});

    expect(result.success).toBe(true);
    expect(Object.values(board.components).some((c) => c.type === "power_supply")).toBe(true);
    expect(Object.values(board.wires).some((wire) => wire.fromRow !== -999 && wire.fromCol === 8)).toBe(true);
  });

  test("propose_fix places a servo below an existing PSU when its calibrated body would overlap above", async () => {
    const board = createDefaultBoardState();
    board.boardTarget = "arduino_uno";
    board.components["psu-existing"] = {
      id: "psu-existing",
      type: "power_supply",
      name: "External 5V Supply",
      x: 8,
      y: 18,
      rotation: 0,
      pins: {},
      properties: { leftVoltage: 5, rightVoltage: 3.3 },
    };
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project, sceneId: "scene-psu", ops, mode: "edit", workingBoard: board,
    });

    const execute = tools.propose_fix.execute as unknown as (
      input: unknown,
      options: unknown,
    ) => Promise<Record<string, unknown>>;
    const result = await execute({
      addComponents: [servoComponents[0]],
      addWires: [
        { arduinoPin: 9, toNewComponent: 0, toPin: "signal", color: "#eab308" },
        { fromExistingComponent: "psu-existing", fromPin: "positive", toNewComponent: 0, toPin: "vcc", color: "#ef4444" },
        { fromExistingComponent: "psu-existing", fromPin: "negative", toNewComponent: 0, toPin: "gnd", color: "#1e293b" },
        { arduinoPin: -3, toExistingComponent: "psu-existing", toPin: "negative", color: "#1e293b" },
      ],
      sketch: servoSketch,
    }, {});

    expect(result.success).toBe(true);
    const servo = Object.values(board.components).find((component) => component.type === "servo");
    expect(servo).toBeDefined();
    expect(servo!.y).toBe(39);
    expect(visualRowBoundsOverlap(
      componentPlacementRowBounds("power_supply", 18),
      componentPlacementRowBounds(servo!.type, servo!.y),
    )).toBe(false);
    expect(Object.values(board.wires).some(
      (wire) => wire.fromRow === -999 && wire.fromCol === 9 &&
        wire.toRow === servo!.y && wire.toCol === servo!.x,
    )).toBe(true);
  });
});
