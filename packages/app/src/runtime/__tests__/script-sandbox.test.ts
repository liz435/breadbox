import { describe, test, expect } from "bun:test";
import { compileScript, type SandboxApi } from "../script-sandbox";

const noopEntities = { get: () => null, list: () => [] };

function makeApi(overrides?: Partial<SandboxApi>): SandboxApi {
  return {
    dt: 0.016,
    time: 0,
    input: {},
    console: { log: () => {} },
    state: {},
    entities: noopEntities,
    ...overrides,
  };
}

describe("compileScript", () => {
  test("compiles and runs a simple script", () => {
    const result = compileScript("function update(dt) { return { moved: dt * 100 }; }", "node-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      const output = result.run(makeApi({ dt: 0.016, time: 1.0 }));
      expect(output.moved).toBeCloseTo(1.6, 1);
    }
  });

  test("captures console.log calls", () => {
    const logs: unknown[][] = [];
    const result = compileScript("console.log('hello', 42);", "node-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      result.run(makeApi({
        console: { log: (...args: unknown[]) => logs.push(args) },
      }));
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(["hello", 42]);
    }
  });

  test("provides dt and time to scripts", () => {
    const result = compileScript(
      "function update() { return { elapsed: time, delta: dt }; }",
      "node-1"
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      const output = result.run(makeApi({ dt: 0.033, time: 5.5 }));
      expect(output.elapsed).toBe(5.5);
      expect(output.delta).toBe(0.033);
    }
  });

  test("handles runtime errors gracefully", () => {
    const result = compileScript(
      "function update() { throw new Error('boom'); }",
      "node-1"
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      const output = result.run(makeApi());
      expect(output.__error).toContain("boom");
    }
  });

  test("returns compile error for invalid syntax", () => {
    const result = compileScript("function {{{", "node-1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Compile error");
    }
  });

  test("provides input values from ports", () => {
    const result = compileScript(
      "function update() { return { got: input.speed }; }",
      "node-1"
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      const output = result.run(makeApi({ input: { speed: 42 } }));
      expect(output.got).toBe(42);
    }
  });

  test("returns empty object when no update function", () => {
    const result = compileScript("const x = 1;", "node-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      const output = result.run(makeApi());
      expect(output).toEqual({});
    }
  });
});
