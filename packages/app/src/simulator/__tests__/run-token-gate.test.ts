import { describe, expect, test } from "bun:test";
import { RunTokenGate } from "../run-token-gate";

describe("RunTokenGate", () => {
  test("ignores stale run token after stop/invalidate", () => {
    const gate = new RunTokenGate();
    const runA = gate.beginRun();

    // User stops before run A compile callback returns.
    gate.invalidate();

    expect(gate.isCurrent(runA)).toBe(false);
  });

  test("new run invalidates prior run token", () => {
    const gate = new RunTokenGate();
    const runA = gate.beginRun();
    const runB = gate.beginRun();

    expect(gate.isCurrent(runA)).toBe(false);
    expect(gate.isCurrent(runB)).toBe(true);
  });
});
