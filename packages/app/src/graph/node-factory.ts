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
  setup: { width: 160, height: 70, name: "Setup" },
  loop: { width: 160, height: 70, name: "Loop" },
  digital_write: { width: 180, height: 100, name: "Digital Write" },
  digital_read: { width: 180, height: 100, name: "Digital Read" },
  pin_mode: { width: 180, height: 90, name: "Pin Mode" },
  analog_write: { width: 180, height: 100, name: "Analog Write" },
  analog_read: { width: 180, height: 100, name: "Analog Read" },
  delay: { width: 140, height: 80, name: "Delay" },
  millis: { width: 140, height: 70, name: "Millis" },
  micros: { width: 140, height: 70, name: "Micros" },
  serial_begin: { width: 180, height: 80, name: "Serial Begin" },
  serial_print: { width: 200, height: 100, name: "Serial Print" },
  serial_read: { width: 180, height: 90, name: "Serial Read" },
  if_else: { width: 180, height: 120, name: "If / Else" },
  comparison: { width: 160, height: 90, name: "Comparison" },
  logic_gate: { width: 140, height: 80, name: "Logic Gate" },
  math: { width: 160, height: 90, name: "Math" },
  map_value: { width: 180, height: 100, name: "Map Value" },
  constrain: { width: 180, height: 90, name: "Constrain" },
  variable: { width: 160, height: 90, name: "Variable" },
  constant: { width: 140, height: 70, name: "Constant" },
  servo_write: { width: 180, height: 100, name: "Servo Write" },
  tone: { width: 180, height: 100, name: "Tone" },
  lcd_print: { width: 200, height: 110, name: "LCD Print" },
  code_block: { width: 240, height: 160, name: "Code Block" },
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
    case "setup":
      return {};
    case "loop":
      return {};
    case "digital_write":
      return { pin: 13, value: "HIGH" };
    case "digital_read":
      return { pin: 2 };
    case "pin_mode":
      return { pin: 13, mode: "OUTPUT" };
    case "analog_write":
      return { pin: 9, value: 128 };
    case "analog_read":
      return { pin: 0 };
    case "delay":
      return { ms: 1000 };
    case "millis":
      return {};
    case "micros":
      return {};
    case "serial_begin":
      return { baudRate: 9600 };
    case "serial_print":
      return { value: "", newline: true };
    case "serial_read":
      return {};
    case "if_else":
      return {};
    case "comparison":
      return { operator: "==" };
    case "logic_gate":
      return { gate: "AND" };
    case "math":
      return { operation: "add" };
    case "map_value":
      return { fromLow: 0, fromHigh: 1023, toLow: 0, toHigh: 255 };
    case "constrain":
      return { low: 0, high: 255 };
    case "variable":
      return { name: "myVar", dataType: "integer", initialValue: 0 };
    case "constant":
      return { value: 0, dataType: "integer" };
    case "servo_write":
      return { pin: 9, angle: 90 };
    case "tone":
      return { pin: 8, frequency: 440, duration: 0 };
    case "lcd_print":
      return { address: 0x27, cols: 16, rows: 2, text: "" };
    case "code_block":
      return {
        language: "cpp",
        code: "// Custom Arduino code\n",
      };
  }
}

// ── Input map actions (legacy, used by graph inspector) ─────────────────────

export type InputAction = {
  name: string;
  label: string;
  keys: string[];
};

// ── Math operations ───────────────────��────────────────────────���────────────

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
