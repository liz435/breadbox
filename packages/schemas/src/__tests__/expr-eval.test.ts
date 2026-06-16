import { describe, expect, test } from "bun:test";
import { evaluateExpression } from "../expr-eval";

describe("evaluateExpression", () => {
  test("arithmetic and precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("10 / 4")).toBe(2.5);
    expect(evaluateExpression("10 % 3")).toBe(1);
    expect(evaluateExpression("-5 + 2")).toBe(-3);
  });

  test("variables from context", () => {
    expect(evaluateExpression("value / 100 * 5", { value: 80 })).toBe(4);
    expect(evaluateExpression("a + b", { a: 1.5, b: 2.5 })).toBe(4);
  });

  test("functions", () => {
    expect(evaluateExpression("min(5, 3, 8)")).toBe(3);
    expect(evaluateExpression("max(value, 10)", { value: 4 })).toBe(10);
    expect(evaluateExpression("clamp(value, 0, 100)", { value: 150 })).toBe(100);
    expect(evaluateExpression("abs(-7)")).toBe(7);
    expect(evaluateExpression("round(2.6)")).toBe(3);
  });

  test("comparisons return 1/0", () => {
    expect(evaluateExpression("value > 50", { value: 80 })).toBe(1);
    expect(evaluateExpression("value <= 50", { value: 80 })).toBe(0);
    expect(evaluateExpression("value == 80", { value: 80 })).toBe(1);
  });

  test("rejects unknown variables and functions", () => {
    expect(() => evaluateExpression("nope + 1")).toThrow();
    expect(() => evaluateExpression("frobnicate(2)")).toThrow();
  });

  test("rejects malformed input (no code execution)", () => {
    expect(() => evaluateExpression("2 +")).toThrow();
    expect(() => evaluateExpression("(2 + 3")).toThrow();
    expect(() => evaluateExpression("process.exit(1)")).toThrow();
    expect(() => evaluateExpression("1 / 0")).toThrow(); // non-finite
  });
});
