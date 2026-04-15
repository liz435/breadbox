import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardState } from "@dreamer/schemas";
import { analyzeRoutingPolicy, normalizeDirectPinFanout } from "../routing-policy";

function connect(
  board: BoardState,
  id: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
) {
  board.wires[id] = { id, fromRow, fromCol, toRow, toCol, color: "#22c55e" };
}

describe("routing policy", () => {
  test("flags direct fanout and shared direct ground/power wiring", () => {
    const board = createDefaultBoardState();
    connect(board, "w1", -999, 9, 5, 2);
    connect(board, "w2", -999, 9, 8, 2);
    connect(board, "w3", -999, -3, 6, 2);
    connect(board, "w4", -999, -3, 10, 2);
    connect(board, "w5", -999, -1, 7, 2);
    connect(board, "w6", -999, -1, 11, 2);

    const analysis = analyzeRoutingPolicy(board);
    expect(analysis.maxPinFanout).toBe(2);
    expect(analysis.pinsOverDirectFanout).toBe(3);
    expect(analysis.directGroundCount).toBe(2);
    expect(analysis.directPowerCount).toBe(2);
    expect(analysis.violations.some((v) => v.code === "PIN_DIRECT_FANOUT" && v.pin === 9)).toBe(true);
    expect(analysis.violations.some((v) => v.code === "GROUND_NOT_RAIL_DISTRIBUTED")).toBe(true);
    expect(analysis.violations.some((v) => v.code === "POWER_NOT_RAIL_DISTRIBUTED")).toBe(true);
  });

  test("normalizes direct pin fanout via rails/bus to one Arduino lead per pin", () => {
    const board = createDefaultBoardState();
    connect(board, "w1", -999, 9, 5, 2);
    connect(board, "w2", -999, 9, 8, 2);
    connect(board, "w3", -999, -3, 6, 2);
    connect(board, "w4", -999, -3, 10, 2);

    const fix = normalizeDirectPinFanout({
      board,
      opCtx: { projectId: "p1", sceneId: "s1", expectedVersion: 1 },
    });
    expect(fix).not.toBeNull();
    expect((fix?.ops.length ?? 0) > 0).toBe(true);

    const analysis = analyzeRoutingPolicy(board);
    expect(analysis.maxPinFanout).toBe(1);
    expect(analysis.pinsOverDirectFanout).toBe(0);
    expect(analysis.directGroundCount).toBe(1);
    expect(analysis.violations.length).toBe(0);
  });
});
