import { describe, test, expect } from "bun:test";
import {
  createGraphNode,
  evaluateMathOp,
  MATH_OPERATIONS,
  type MathOperation,
} from "../node-factory";
import type { GraphNodeType } from "@dreamer/schemas";

// ── createGraphNode ─────────────────────────────────────────────────────────

describe("createGraphNode", () => {
  const allTypes: GraphNodeType[] = [
    "setup",
    "loop",
    "digital_write",
    "digital_read",
    "pin_mode",
    "analog_write",
    "analog_read",
    "delay",
    "millis",
    "micros",
    "serial_begin",
    "serial_print",
    "serial_read",
    "if_else",
    "comparison",
    "logic_gate",
    "math",
    "map_value",
    "constrain",
    "variable",
    "constant",
    "servo_write",
    "tone",
    "lcd_print",
    "code_block",
  ];

  test("creates a valid node for every type", () => {
    for (const type of allTypes) {
      const node = createGraphNode(type);
      expect(node.id).toBeTruthy();
      expect(node.type).toBe(type);
      expect(node.name).toBeTruthy();
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
      expect(Array.isArray(node.ports)).toBe(true);
      expect(typeof node.data).toBe("object");
    }
  });

  test("generates unique ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(createGraphNode("setup").id);
    }
    expect(ids.size).toBe(50);
  });

  test("accepts custom id", () => {
    const node = createGraphNode("setup", { id: "custom-id" });
    expect(node.id).toBe("custom-id");
  });

  test("accepts custom name", () => {
    const node = createGraphNode("delay", { name: "My Delay" });
    expect(node.name).toBe("My Delay");
  });

  test("accepts custom position", () => {
    const node = createGraphNode("digital_write", { x: 100, y: 200 });
    expect(node.x).toBe(100);
    expect(node.y).toBe(200);
  });

  test("merges custom data with defaults", () => {
    const node = createGraphNode("digital_write", {
      data: { customField: "test" },
    });
    // Should have both default data and custom data
    expect(node.data.pin).toBe(13);
    expect(node.data.value).toBe("HIGH");
    expect(node.data.customField).toBe("test");
  });

  test("custom data overrides defaults", () => {
    const node = createGraphNode("digital_write", {
      data: { pin: 7 },
    });
    expect(node.data.pin).toBe(7);
  });

  // ── Type-specific defaults ────────────────────────────────────────────────

  test("setup has empty default data", () => {
    const node = createGraphNode("setup");
    expect(node.data).toEqual({});
  });

  test("digital_write has pin and value", () => {
    const node = createGraphNode("digital_write");
    expect(node.data.pin).toBe(13);
    expect(node.data.value).toBe("HIGH");
  });

  test("delay has ms", () => {
    const node = createGraphNode("delay");
    expect(node.data.ms).toBe(1000);
  });

  test("serial_begin has baudRate", () => {
    const node = createGraphNode("serial_begin");
    expect(node.data.baudRate).toBe(9600);
  });

  test("math has operation", () => {
    const node = createGraphNode("math");
    expect(node.data.operation).toBe("add");
  });

  test("variable has name, dataType, and initialValue", () => {
    const node = createGraphNode("variable");
    expect(node.data.name).toBe("myVar");
    expect(node.data.dataType).toBe("integer");
    expect(node.data.initialValue).toBe(0);
  });

  test("code_block has language and code", () => {
    const node = createGraphNode("code_block");
    expect(node.data.language).toBe("cpp");
    expect(typeof node.data.code).toBe("string");
  });

  // ── Ports ─────────────────────────────────────────────────────────────────

  test("setup node has flow_out port", () => {
    const node = createGraphNode("setup");
    const portIds = node.ports.map((p) => p.id);
    expect(portIds).toContain("flow_out");
  });

  test("digital_write node has flow_in, pin, value, and flow_out ports", () => {
    const node = createGraphNode("digital_write");
    const portIds = node.ports.map((p) => p.id);
    expect(portIds).toContain("flow_in");
    expect(portIds).toContain("pin");
    expect(portIds).toContain("value");
    expect(portIds).toContain("flow_out");
  });

  // ── Node sizes differ by type ─────────────────────────────────────────────

  test("code_block is wider than constant", () => {
    const codeBlock = createGraphNode("code_block");
    const constant = createGraphNode("constant");
    expect(codeBlock.width).toBeGreaterThan(constant.width);
  });

  test("node sizes match expected values", () => {
    const setup = createGraphNode("setup");
    expect(setup.width).toBe(160);
    expect(setup.height).toBe(70);

    const serialPrint = createGraphNode("serial_print");
    expect(serialPrint.width).toBe(200);
    expect(serialPrint.height).toBe(100);

    const lcdPrint = createGraphNode("lcd_print");
    expect(lcdPrint.width).toBe(200);
    expect(lcdPrint.height).toBe(110);
  });
});

// ── evaluateMathOp ──────────────────────────────────────────────────────────

describe("evaluateMathOp", () => {
  test("add", () => {
    expect(evaluateMathOp("add", 3, 4)).toBe(7);
  });

  test("subtract", () => {
    expect(evaluateMathOp("subtract", 10, 3)).toBe(7);
  });

  test("multiply", () => {
    expect(evaluateMathOp("multiply", 3, 4)).toBe(12);
  });

  test("divide", () => {
    expect(evaluateMathOp("divide", 10, 4)).toBe(2.5);
  });

  test("divide by zero returns 0", () => {
    expect(evaluateMathOp("divide", 10, 0)).toBe(0);
  });

  test("lerp", () => {
    expect(evaluateMathOp("lerp", 0, 10, 0.5)).toBe(5);
    expect(evaluateMathOp("lerp", 0, 10, 0)).toBe(0);
    expect(evaluateMathOp("lerp", 0, 10, 1)).toBe(10);
  });

  test("clamp", () => {
    expect(evaluateMathOp("clamp", 5, 0, 10)).toBe(5);
    expect(evaluateMathOp("clamp", -5, 0, 10)).toBe(0);
    expect(evaluateMathOp("clamp", 15, 0, 10)).toBe(10);
  });

  test("min", () => {
    expect(evaluateMathOp("min", 3, 7)).toBe(3);
    expect(evaluateMathOp("min", 7, 3)).toBe(3);
  });

  test("max", () => {
    expect(evaluateMathOp("max", 3, 7)).toBe(7);
    expect(evaluateMathOp("max", 7, 3)).toBe(7);
  });

  test("abs", () => {
    expect(evaluateMathOp("abs", -5, 0)).toBe(5);
    expect(evaluateMathOp("abs", 5, 0)).toBe(5);
  });

  test("sin", () => {
    expect(evaluateMathOp("sin", 0, 0)).toBe(0);
    expect(Math.abs(evaluateMathOp("sin", Math.PI / 2, 0) - 1)).toBeLessThan(
      0.0001
    );
  });

  test("cos", () => {
    expect(evaluateMathOp("cos", 0, 0)).toBe(1);
    expect(Math.abs(evaluateMathOp("cos", Math.PI, 0) - -1)).toBeLessThan(
      0.0001
    );
  });

  test("random returns value between 0 and 1", () => {
    for (let i = 0; i < 20; i++) {
      const val = evaluateMathOp("random", 0, 0);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

// ── MATH_OPERATIONS ─────────────────────────────────────────────────────────

describe("MATH_OPERATIONS", () => {
  test("has all operations", () => {
    const ops: MathOperation[] = [
      "add",
      "subtract",
      "multiply",
      "divide",
      "lerp",
      "clamp",
      "min",
      "max",
      "abs",
      "sin",
      "cos",
      "random",
    ];
    for (const op of ops) {
      expect(MATH_OPERATIONS.find((m) => m.value === op)).toBeDefined();
    }
  });

  test("each operation has a label and input count", () => {
    for (const op of MATH_OPERATIONS) {
      expect(op.label).toBeTruthy();
      expect(typeof op.inputs).toBe("number");
      expect(op.inputs).toBeGreaterThanOrEqual(0);
    }
  });
});
