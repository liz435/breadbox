import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardOp, type BoardState, type DreamerDiagramInput } from "@dreamer/schemas";
import type { ProjectFile } from "../../../db/schemas";
import { createCoreTools } from "../tools";

function makeProject(boardState: BoardState): ProjectFile {
  const now = new Date().toISOString();
  return {
    project: {
      id: "project-1",
      name: "Test Project",
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

async function runApplyDesign(
  tools: ReturnType<typeof createCoreTools>["tools"],
  input: DreamerDiagramInput,
): Promise<Record<string, unknown>> {
  const execute = tools.apply_design.execute as unknown as (
    payload: unknown,
    options: unknown,
  ) => Promise<Record<string, unknown>>;
  return execute(input, {});
}

describe("apply_design", () => {
  test("emits one load_board op and syncs full board-level fields", async () => {
    const board = createDefaultBoardState();
    board.boardTarget = "arduino_uno";
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project,
      sceneId: "scene-1",
      ops,
      mode: "all",
      workingBoard: board,
    });

    const diagram: DreamerDiagramInput = {
      $schema: "dreamer-diagram-v1",
      board: "arduino_mega_2560",
      sketch: "void setup() {}\nvoid loop() {}\n",
      components: [
        { id: "led1", type: "led", at: [7, 5], rotation: 0, properties: {} },
      ],
      wires: [
        { from: "arduino.13", to: "led1.anode" },
        { from: "led1.cathode", to: "arduino.GND" },
      ],
      customLibraries: [
        { name: "Foo.h", code: "#pragma once\n", description: "test" },
      ],
      environment: {
        obstacles: [{ id: "obs-1", shape: "wall", x1: 0, y1: 0, x2: 10, y2: 10, label: "wall" }],
        boundaryEnabled: true,
        boundaryMargin: 120,
      },
    };

    const result = await runApplyDesign(tools, diagram);
    expect(result.ok).toBe(true);

    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("load_board");
    if (ops[0].kind !== "load_board") return;
    expect(ops[0].payload.state.boardTarget).toBe("arduino_mega_2560");
    expect(Object.keys(ops[0].payload.state.customLibraries)).toContain("Foo.h");
    expect(ops[0].payload.state.environment.boundaryMargin).toBe(120);

    expect(board.boardTarget as string).toBe("arduino_mega_2560");
    expect(Object.keys(board.customLibraries)).toContain("Foo.h");
    expect(board.environment.boundaryMargin).toBe(120);
  });

  test("is available in build and edit modes", () => {
    const board = createDefaultBoardState();
    const project = makeProject(board);

    const build = createCoreTools({
      project,
      sceneId: "scene-1",
      ops: [],
      mode: "build",
      workingBoard: board,
    });
    const edit = createCoreTools({
      project,
      sceneId: "scene-1",
      ops: [],
      mode: "edit",
      workingBoard: board,
    });

    expect("apply_design" in build.tools).toBe(true);
    expect("apply_design" in edit.tools).toBe(true);
  });
});
