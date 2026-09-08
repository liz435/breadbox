import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardOp } from "@dreamer/schemas";
import {
  applyBoardOps,
  BoardDomainError,
  createBoardDocument,
} from "./index";

function op<T extends BoardOp["kind"]>(
  kind: T,
  payload: Extract<BoardOp, { kind: T }>["payload"],
  expectedVersion = 0,
): Extract<BoardOp, { kind: T }> {
  return {
    kind,
    payload,
    opId: `${kind}-1`,
    projectId: "project-1",
    sceneId: "scene-1",
    expectedVersion,
    timestamp: Date.now(),
  } as unknown as Extract<BoardOp, { kind: T }>;
}

describe("board-domain", () => {
  test("applies a batch transactionally and increments revision once", () => {
    const snapshot = createBoardDocument(createDefaultBoardState());
    const next = applyBoardOps(snapshot, [
      op("update_sketch", { code: "void setup() {}" }),
      op("update_board_settings", { settings: { serialBaud: 115200 } }),
    ], { enforceRevision: true });

    expect(next.revision).toBe(1);
    expect(next.state.sketchCode).toBe("void setup() {}");
    expect(next.state.libraryState.serialBaud).toBe(115200);
    expect(snapshot.state.sketchCode).not.toBe(next.state.sketchCode);
  });

  test("rejects a stale revision without partial mutation", () => {
    const snapshot = createBoardDocument(createDefaultBoardState(), 3);
    expect(() => applyBoardOps(snapshot, [
      op("update_sketch", { code: "changed" }, 2),
    ], { enforceRevision: true })).toThrow(BoardDomainError);
    expect(snapshot.state.sketchCode).toBe(createDefaultBoardState().sketchCode);
  });

  test("rejects duplicate component ids", () => {
    const state = createDefaultBoardState();
    const component = Object.values(state.components)[0];
    expect(() => applyBoardOps(createBoardDocument(state), [
      op("place_component", { component: { ...component, id: "breadboard-1" } }),
    ])).toThrow(/already exists/);
  });
});
