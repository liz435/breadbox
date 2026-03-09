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
    "sprite",
    "shader",
    "audio",
    "video",
    "text",
    "code",
    "material",
    "math",
    "group",
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
      ids.add(createGraphNode("sprite").id);
    }
    expect(ids.size).toBe(50);
  });

  test("accepts custom id", () => {
    const node = createGraphNode("sprite", { id: "custom-id" });
    expect(node.id).toBe("custom-id");
  });

  test("accepts custom name", () => {
    const node = createGraphNode("shader", { name: "My Shader" });
    expect(node.name).toBe("My Shader");
  });

  test("accepts custom position", () => {
    const node = createGraphNode("audio", { x: 100, y: 200 });
    expect(node.x).toBe(100);
    expect(node.y).toBe(200);
  });

  test("merges custom data with defaults", () => {
    const node = createGraphNode("shader", {
      data: { customField: "test" },
    });
    // Should have both default shader data and custom data
    expect(node.data.language).toBe("glsl");
    expect(typeof node.data.code).toBe("string");
    expect(node.data.customField).toBe("test");
  });

  test("custom data overrides defaults", () => {
    const node = createGraphNode("shader", {
      data: { language: "wgsl" },
    });
    expect(node.data.language).toBe("wgsl");
  });

  // ── Type-specific defaults ────────────────────────────────────────────────

  test("sprite has tint and scene position", () => {
    const node = createGraphNode("sprite");
    expect(node.data.tint).toBe("#4a9eff");
    expect(typeof node.data.sceneX).toBe("number");
    expect(typeof node.data.sceneY).toBe("number");
  });

  test("shader has language and code", () => {
    const node = createGraphNode("shader");
    expect(node.data.language).toBe("glsl");
    expect(typeof node.data.code).toBe("string");
    expect((node.data.code as string).includes("void main")).toBe(true);
  });

  test("code has language and code", () => {
    const node = createGraphNode("code");
    expect(node.data.language).toBe("typescript");
    expect(typeof node.data.code).toBe("string");
  });

  test("audio has volume, pitch, loop", () => {
    const node = createGraphNode("audio");
    expect(node.data.volume).toBe(1.0);
    expect(node.data.pitch).toBe(1.0);
    expect(node.data.loop).toBe(false);
  });

  test("video has playbackRate and loop", () => {
    const node = createGraphNode("video");
    expect(node.data.playbackRate).toBe(1.0);
    expect(node.data.loop).toBe(false);
  });

  test("text has content", () => {
    const node = createGraphNode("text");
    expect(node.data.content).toBe("");
  });

  test("math has operation", () => {
    const node = createGraphNode("math");
    expect(node.data.operation).toBe("add");
  });

  test("group has childNodeIds", () => {
    const node = createGraphNode("group");
    expect(Array.isArray(node.data.childNodeIds)).toBe(true);
  });

  // ── Ports ─────────────────────────────────────────────────────────────────

  test("sprite node has correct default ports", () => {
    const node = createGraphNode("sprite");
    const portIds = node.ports.map((p) => p.id);
    expect(portIds).toContain("shader_in");
    expect(portIds).toContain("texture_out");
  });

  test("shader node has correct default ports", () => {
    const node = createGraphNode("shader");
    const portIds = node.ports.map((p) => p.id);
    expect(portIds).toContain("texture_in");
    expect(portIds).toContain("shader_out");
  });

  // ── Node sizes differ by type ─────────────────────────────────────────────

  test("shader is wider than math", () => {
    const shader = createGraphNode("shader");
    const math = createGraphNode("math");
    expect(shader.width).toBeGreaterThan(math.width);
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
