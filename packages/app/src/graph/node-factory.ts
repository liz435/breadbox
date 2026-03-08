import type { GraphNode, GraphNodeType } from "@dreamer/schemas";
import { getDefaultPorts } from "@dreamer/schemas";

type CreateNodeOptions = {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
};

const NODE_DEFAULTS: Record<
  GraphNodeType,
  { width: number; height: number; name: string }
> = {
  sprite: { width: 200, height: 150, name: "Sprite" },
  shader: { width: 240, height: 160, name: "Shader" },
  code: { width: 240, height: 160, name: "Script" },
  audio: { width: 200, height: 140, name: "Audio" },
  video: { width: 200, height: 170, name: "Video" },
  text: { width: 200, height: 130, name: "Text" },
  material: { width: 200, height: 120, name: "Material" },
  math: { width: 160, height: 90, name: "Math" },
  group: { width: 240, height: 160, name: "Group" },
  on_start: { width: 160, height: 70, name: "On Start" },
  on_update: { width: 160, height: 80, name: "On Update" },
  on_input: { width: 160, height: 80, name: "On Input" },
  input_map: { width: 200, height: 120, name: "Input Map" },
};

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createGraphNode(
  type: GraphNodeType,
  options: CreateNodeOptions = {}
): GraphNode {
  const defaults = NODE_DEFAULTS[type];
  const data: Record<string, unknown> = { ...getDefaultNodeData(type), ...options.data };

  return {
    id: options.id ?? generateId(),
    type,
    name: options.name ?? defaults.name,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: defaults.width,
    height: defaults.height,
    ports: getDefaultPorts(type),
    data,
  };
}

function getDefaultNodeData(type: GraphNodeType): Record<string, unknown> {
  switch (type) {
    case "sprite":
      return { tint: "#4a9eff", sceneX: 400, sceneY: 300 };
    case "shader":
      return {
        language: "glsl",
        code: [
          "precision mediump float;",
          "",
          "varying vec2 vTextureCoord;",
          "uniform sampler2D uSampler;",
          "",
          "void main() {",
          "  gl_FragColor = texture2D(uSampler, vTextureCoord);",
          "}",
        ].join("\n"),
      };
    case "code":
      return {
        language: "typescript",
        code: [
          "// Script node",
          "export function update(dt: number) {",
          "  ",
          "}",
        ].join("\n"),
      };
    case "audio":
      return { volume: 1.0, pitch: 1.0, loop: false };
    case "video":
      return { playbackRate: 1.0, loop: false };
    case "text":
      return { content: "" };
    case "material":
      return { blend: "normal" };
    case "math":
      return { operation: "add" };
    case "group":
      return { childNodeIds: [] };
    case "on_start":
      return {};
    case "on_update":
      return {};
    case "on_input":
      return { listenKeys: ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] };
    case "input_map":
      return {
        actions: [
          { name: "move_up", label: "Move Up", keys: ["w", "W", "ArrowUp"] },
          { name: "move_down", label: "Move Down", keys: ["s", "S", "ArrowDown"] },
          { name: "move_left", label: "Move Left", keys: ["a", "A", "ArrowLeft"] },
          { name: "move_right", label: "Move Right", keys: ["d", "D", "ArrowRight"] },
        ],
      };
  }
}

// ── Input map actions ────────────────────────────────────────────────────────

export type InputAction = {
  name: string;
  label: string;
  keys: string[];
};

// ── Math operations ─────────────────────────────────────────────────────────

export type MathOperation =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "lerp"
  | "clamp"
  | "min"
  | "max"
  | "abs"
  | "sin"
  | "cos"
  | "random";

export const MATH_OPERATIONS: {
  value: MathOperation;
  label: string;
  inputs: number;
}[] = [
  { value: "add", label: "Add", inputs: 2 },
  { value: "subtract", label: "Subtract", inputs: 2 },
  { value: "multiply", label: "Multiply", inputs: 2 },
  { value: "divide", label: "Divide", inputs: 2 },
  { value: "lerp", label: "Lerp", inputs: 3 },
  { value: "clamp", label: "Clamp", inputs: 3 },
  { value: "min", label: "Min", inputs: 2 },
  { value: "max", label: "Max", inputs: 2 },
  { value: "abs", label: "Abs", inputs: 1 },
  { value: "sin", label: "Sin", inputs: 1 },
  { value: "cos", label: "Cos", inputs: 1 },
  { value: "random", label: "Random", inputs: 0 },
];

export function evaluateMathOp(
  op: MathOperation,
  a: number,
  b: number,
  c: number = 0
): number {
  switch (op) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return b !== 0 ? a / b : 0;
    case "lerp":
      return a + (b - a) * c;
    case "clamp":
      return Math.max(b, Math.min(c, a));
    case "min":
      return Math.min(a, b);
    case "max":
      return Math.max(a, b);
    case "abs":
      return Math.abs(a);
    case "sin":
      return Math.sin(a);
    case "cos":
      return Math.cos(a);
    case "random":
      return Math.random();
  }
}
