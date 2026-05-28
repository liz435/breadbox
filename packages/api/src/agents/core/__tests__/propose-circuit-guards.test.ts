import { describe, expect, test } from "bun:test"
import { createDefaultBoardState, type BoardOp, type BoardState } from "@dreamer/schemas"
import type { ProjectFile } from "../../../db/schemas"
import { createCoreTools } from "../tools"

// ── v1.5.1 guards on propose_circuit ─────────────────────────────────────
//
// Two guards added to fix a production retry-loop bug:
//   1. Code-enforced 3-attempt-per-turn budget (prose-only previously).
//   2. Refuse on a non-empty board (propose_circuit stacked components on
//      top of existing ones rather than replacing).
//
// Both must:
//   - Return success:false with a recognisable failureKind.
//   - Leave the board state untouched (no partial mutations).

function makeProject(boardState: BoardState): ProjectFile {
  const now = new Date().toISOString()
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
  }
}

async function runPropose(
  tools: ReturnType<typeof createCoreTools>["tools"],
  input: unknown,
): Promise<Record<string, unknown>> {
  const execute = tools.propose_circuit.execute as unknown as (
    payload: unknown,
    options: unknown,
  ) => Promise<Record<string, unknown>>
  return execute(input, {})
}

const ledBlinkInput = {
  components: [
    {
      type: "led",
      name: "LED",
      pinRoles: { anode: "signal_output", cathode: "reference_ground" },
    },
    {
      type: "resistor",
      name: "R1",
      pinRoles: { a: "passive_series", b: "passive_series" },
      properties: { resistance: 220 },
    },
  ],
  wires: [
    { arduinoPin: 13, toComponent: 0, toPin: "anode" },
  ],
  ledResistorPairs: [{ ledIndex: 0, resistorIndex: 1 }],
  sketch: "void setup(){pinMode(13,OUTPUT);}\nvoid loop(){digitalWrite(13,HIGH);delay(500);digitalWrite(13,LOW);delay(500);}",
}

describe("propose_circuit v1.5.1 guards", () => {
  test("refuses when board has existing non-Arduino components", async () => {
    const board = createDefaultBoardState()
    board.boardTarget = "arduino_uno"
    // Plant an LED so the board is "non-empty" from propose_circuit's POV.
    board.components["existing-led"] = {
      id: "existing-led",
      type: "led",
      name: "Existing",
      x: 5, y: 5, rotation: 0,
      properties: {},
    } as (typeof board.components)[string]

    const project = makeProject(board)
    const ops: BoardOp[] = []
    const { tools } = createCoreTools({
      project, sceneId: "scene-1", ops, mode: "build", workingBoard: board,
    })

    const result = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(result.success).toBe(false)
    expect(result.failureKind).toBe("board_not_empty")
    expect(result.blocked).toBe(true)
    // No ops emitted, no new components added. The board still has its
    // surfaces (breadboard, possibly arduino) plus the planted existing-led
    // and nothing else.
    expect(ops.length).toBe(0)
    expect(Object.keys(board.components)).toContain("existing-led")
    // Count user-placed (non-surface) components — should be exactly the
    // one we planted, nothing from propose_circuit.
    const userComponents = Object.values(board.components).filter(
      (c) => c.type === "led" || c.type === "resistor" || c.type === "button",
    )
    expect(userComponents.length).toBe(1)
  })

  test("enforces 3-attempt budget across a single run", async () => {
    const board = createDefaultBoardState()
    board.boardTarget = "arduino_uno"
    const project = makeProject(board)
    const ops: BoardOp[] = []
    const { tools } = createCoreTools({
      project, sceneId: "scene-1", ops, mode: "build", workingBoard: board,
    })

    // First call succeeds (empty board, valid input).
    const r1 = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(r1.success).toBe(true)

    // Calls 2 + 3 hit the board_not_empty guard — they each still count
    // toward the attempt budget because the counter increments before the
    // guard check. So by call 4 the budget should be exhausted.
    const r2 = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(r2.success).toBe(false)
    expect(r2.failureKind).toBe("board_not_empty")

    const r3 = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(r3.success).toBe(false)
    expect(r3.failureKind).toBe("board_not_empty")

    // Call 4 should hit attempt_limit (the budget guard runs before
    // board_not_empty, so this overrides).
    const r4 = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(r4.success).toBe(false)
    expect(r4.failureKind).toBe("attempt_limit")
    expect(r4.abandoned).toBe(true)
  })

  test("verify_circuit sees the wires propose_circuit just created", async () => {
    // Regression for the v1.5.2 bug: propose_circuit pushed connect_wire
    // ops to the queue but never mutated workingBoard.wires. verify_circuit
    // (which reads workingBoard directly) saw wiredPins=[] right after a
    // successful build → agent triggered phantom propose_fix retries that
    // added duplicate wires. propose_circuit must mirror its emitted wires
    // into workingBoard.wires so mid-turn reads see fresh state.
    const board = createDefaultBoardState()
    board.boardTarget = "arduino_uno"
    const project = makeProject(board)
    const ops: BoardOp[] = []
    const { tools } = createCoreTools({
      project, sceneId: "scene-1", ops, mode: "build", workingBoard: board,
    })

    const proposeResult = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(proposeResult.success).toBe(true)

    // verify_circuit reads workingBoard.wires. If propose_circuit forgot to
    // mutate, wiredPins comes back empty and the sketch's pinMode(13)/
    // digitalWrite(13) calls get flagged as "unwired_pin_referenced".
    const verifyExec = tools.verify_circuit.execute as unknown as (
      i: unknown,
      o: unknown,
    ) => Promise<{
      success: boolean
      sketchPins: number[]
      wiredPins: number[]
      issues: Array<{ kind: string; pin: number }>
    }>
    const verifyResult = await verifyExec({}, {})
    expect(verifyResult.sketchPins).toContain(13)
    expect(verifyResult.wiredPins).toContain(13)
    // No unwired_pin_referenced issues for the LED's pin.
    const unwired = verifyResult.issues.filter((i) => i.kind === "unwired_pin_referenced")
    expect(unwired).toHaveLength(0)
    expect(verifyResult.success).toBe(true)
  })

  test("attempt budget fires even when every call is on an empty board", async () => {
    // Hypothetical: the agent calls propose_circuit, it returns success,
    // user undoes / scene resets between calls so the board is empty
    // again. Budget should still cap at 3 to prevent infinite retries.
    const board = createDefaultBoardState()
    board.boardTarget = "arduino_uno"
    const project = makeProject(board)
    const ops: BoardOp[] = []
    const { tools } = createCoreTools({
      project, sceneId: "scene-1", ops, mode: "build", workingBoard: board,
    })

    for (let i = 0; i < 3; i++) {
      // Clear the board between calls so board_not_empty doesn't kick in.
      for (const id of Object.keys(board.components)) {
        if (board.components[id]!.type !== "arduino_uno") delete board.components[id]
      }
      board.wires = {}
      const r = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
      expect(r.success).toBe(true)
    }

    // 4th call — board is empty, input is valid, but budget exhausted.
    for (const id of Object.keys(board.components)) {
      if (board.components[id]!.type !== "arduino_uno") delete board.components[id]
    }
    board.wires = {}
    const r4 = await runPropose(tools, ledBlinkInput) as Record<string, unknown>
    expect(r4.success).toBe(false)
    expect(r4.failureKind).toBe("attempt_limit")
  })
})
