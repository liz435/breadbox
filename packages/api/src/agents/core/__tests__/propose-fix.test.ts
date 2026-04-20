import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardOp, type BoardState } from "@dreamer/schemas";
import type { ProjectFile } from "../../../db/schemas";
import { createCoreTools } from "../tools";

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
        settings: {
          background: "#000000",
          gravity: { x: 0, y: 0 },
        },
      },
    },
    entities: {},
    sceneEntityIds: { "scene-1": [] },
    components: {
      transform: {},
      sprite: {},
      tilemap: {},
      physicsBody: {},
      script: {},
      camera: {},
    },
    assets: {},
    boardState,
  };
}

async function runProposeFix(
  tools: ReturnType<typeof createCoreTools>["tools"],
  input: unknown,
): Promise<Record<string, unknown>> {
  const execute = tools.propose_fix.execute as unknown as (
    payload: unknown,
    options: unknown,
  ) => Promise<Record<string, unknown>>;
  return execute(input, {});
}

describe("propose_fix", () => {
  test("treats unknown remove IDs as non-blocking warnings", async () => {
    const board = createDefaultBoardState();
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project,
      sceneId: "scene-1",
      ops,
      mode: "edit",
      workingBoard: board,
    });

    const result = await runProposeFix(tools, {
      removeWires: ["wire-does-not-exist"],
      removeComponents: ["component-does-not-exist"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toContain("Wire wire-does-not-exist not found (skipped).");
    expect(result.warnings).toContain("Component component-does-not-exist not found (skipped).");
    expect(ops.length).toBe(0);
  });

  test("normalizes shared ground to one direct Arduino lead", async () => {
    const board = createDefaultBoardState();
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project,
      sceneId: "scene-1",
      ops,
      mode: "edit",
      workingBoard: board,
    });

    const result = await runProposeFix(tools, {
      addComponents: [
        {
          type: "resistor",
          name: "R1",
          pinRoles: { a: "signal", b: "reference_ground" },
        },
        {
          type: "resistor",
          name: "R2",
          pinRoles: { a: "signal", b: "reference_ground" },
        },
      ],
      addWires: [
        { arduinoPin: 2, toNewComponent: 0, toPin: "a" },
        { arduinoPin: -3, toNewComponent: 0, toPin: "b" },
        { arduinoPin: 3, toNewComponent: 1, toPin: "a" },
        { arduinoPin: -3, toNewComponent: 1, toPin: "b" },
      ],
    });

    expect(result.success).toBe(true);

    const directGroundWires = Object.values(board.wires).filter(
      (wire) => wire.fromRow === -999 && wire.fromCol === -3,
    );
    expect(directGroundWires.length).toBe(1);
  });

  test("reuses an existing direct ground source instead of adding another", async () => {
    const board = createDefaultBoardState();
    board.wires["existing-gnd-source"] = {
      id: "existing-gnd-source",
      fromRow: -999,
      fromCol: -3,
      toRow: 0,
      toCol: -1,
      color: "#1e293b",
    };
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project,
      sceneId: "scene-1",
      ops,
      mode: "edit",
      workingBoard: board,
    });

    const result = await runProposeFix(tools, {
      addComponents: [
        {
          type: "resistor",
          name: "R3",
          pinRoles: { a: "signal", b: "reference_ground" },
        },
      ],
      addWires: [
        { arduinoPin: 4, toNewComponent: 0, toPin: "a" },
        { arduinoPin: -3, toNewComponent: 0, toPin: "b" },
      ],
    });

    expect(result.success).toBe(true);

    const directGroundWires = Object.values(board.wires).filter(
      (wire) => wire.fromRow === -999 && wire.fromCol === -3,
    );
    expect(directGroundWires.length).toBe(1);

    const newlyAddedDirectGroundOps = ops.filter(
      (op) =>
        op.kind === "connect_wire" &&
        op.payload.wire.fromRow === -999 &&
        op.payload.wire.fromCol === -3,
    );
    expect(newlyAddedDirectGroundOps.length).toBe(0);
  });
});
