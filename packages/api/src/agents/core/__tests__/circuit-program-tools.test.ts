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

async function runApplyCircuitProgram(
  tools: ReturnType<typeof createCoreTools>["tools"],
  input: unknown,
): Promise<Record<string, unknown>> {
  const execute = tools.apply_circuit_program.execute as unknown as (
    payload: unknown,
    options: unknown,
  ) => Promise<Record<string, unknown>>;
  return execute(input, {});
}

describe("CircuitProgram core tools", () => {
  test("apply_circuit_program compiles and emits a load_board op", async () => {
    const board = createDefaultBoardState();
    const project = makeProject(board);
    const ops: BoardOp[] = [];
    const { tools } = createCoreTools({
      project,
      sceneId: "scene-1",
      ops,
      mode: "build",
      workingBoard: board,
    });

    const result = await runApplyCircuitProgram(tools, {
      version: "circuit-program-v1",
      board: "arduino_uno",
      mode: "build",
      program: {
        modules: [
          {
            id: "led1",
            type: "led",
            role: "status_light",
            properties: { color: "#ef4444" },
            pins: {
              anode: { role: "signal_output", arduinoPin: "D9", net: "led_signal" },
              cathode: { role: "reference_ground", arduinoPin: "GND", net: "gnd_bus" },
            },
          },
        ],
        nets: [
          {
            id: "led_signal",
            kind: "signal",
            members: [{ arduinoPin: "D9" }, { moduleId: "led1", pin: "anode" }],
            constraints: ["pwm_capable_pin"],
          },
          {
            id: "gnd_bus",
            kind: "ground",
            members: [{ arduinoPin: "GND" }, { moduleId: "led1", pin: "cathode" }],
          },
        ],
        layout: { strategy: "auto" },
        sketch: {
          code: "void setup() { pinMode(9, OUTPUT); }\nvoid loop() { analogWrite(9, 128); }\n",
          behaviors: ["dim_led"],
          pinClaims: ["D9"],
        },
      },
      words: {
        labels: [{ target: "led1", label: "status led" }],
        userTerms: ["status led"],
        editHandles: ["status_light"],
      },
      profiles: {
        components: [{ moduleId: "led1", profile: "led/default" }],
        examples: [],
        behaviors: [{ moduleId: "led1", runtime: "pwm", inspectorFields: ["brightness"], animationModel: "realistic_led" }],
      },
    });

    expect(result.ok).toBe(true);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.kind).toBe("load_board");
    if (ops[0]?.kind !== "load_board") return;
    expect(Object.keys(ops[0].payload.state.components)).toContain("led1");
    expect(board.sketchCode.includes("analogWrite")).toBe(true);
  });

  test("CircuitProgram tools are available in build mode and excluded from edit mode", () => {
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

    expect("generate_circuit_program" in build.tools).toBe(true);
    expect("apply_circuit_program" in build.tools).toBe(true);
    expect("generate_circuit_program" in edit.tools).toBe(false);
    expect("apply_circuit_program" in edit.tools).toBe(false);
  });
});
