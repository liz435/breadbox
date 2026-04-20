import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardState } from "@dreamer/schemas";
import type { ProjectFile } from "../../db/schemas";
import { routeRequest } from "../router";

function makeProject(boardState: BoardState): ProjectFile {
  const now = new Date().toISOString();
  return {
    project: {
      id: "project-1",
      name: "Router Test",
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

describe("routeRequest diagram import intent", () => {
  test("routes to build mode on empty board", () => {
    const board = createDefaultBoardState();
    const decision = routeRequest({
      prompt: 'paste this diagram {"$schema":"dreamer-diagram-v1","components":[],"wires":[]}',
      project: makeProject(board),
      priorRuns: [],
    });

    expect(decision.toolMode).toBe("build");
    expect(decision.reasons.some((r) => r.includes("diagram import"))).toBe(true);
  });

  test("routes to edit mode on populated board", () => {
    const board = createDefaultBoardState();
    board.components["led-1"] = {
      id: "led-1",
      type: "led",
      name: "LED",
      x: 7,
      y: 5,
      rotation: 0,
      pins: { anode: null, cathode: null },
      properties: {},
    };

    const decision = routeRequest({
      prompt: "import diagram payload with $schema: \"dreamer-diagram-v1\"",
      project: makeProject(board),
      priorRuns: [],
    });

    expect(decision.toolMode).toBe("edit");
    expect(decision.reasons.some((r) => r.includes("diagram import"))).toBe(true);
  });
});
