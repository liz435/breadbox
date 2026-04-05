import { z } from "zod";
import { nonEmptyStringSchema } from "./primitives";
import {
  arduinoPortDataTypeSchema,
  arduinoNodeTypeSchema,
  type ArduinoPortDataType,
  type ArduinoNodeType,
} from "./arduino-graph";

// ── Port Data Types (Arduino) ──────────────────────────────────────────────

export const portDataTypeSchema = arduinoPortDataTypeSchema;
export type PortDataType = ArduinoPortDataType;

// ── Port Direction ─────────────────────────────────────────────────────────

export const portDirectionSchema = z.enum(["in", "out"]);
export type PortDirection = z.infer<typeof portDirectionSchema>;

// ── Port ───────────────────────────────────────────────────────────────────

export const portSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  direction: portDirectionSchema,
  dataType: portDataTypeSchema,
});
export type Port = z.infer<typeof portSchema>;

// ── Graph Node Types (Arduino) ─────────────────────────────────────────────

export const graphNodeTypeSchema = arduinoNodeTypeSchema;
export type GraphNodeType = ArduinoNodeType;

// ── Graph Node ─────────────────────────────────────────────────────────────

export const graphNodeSchema = z.object({
  id: nonEmptyStringSchema,
  type: graphNodeTypeSchema,
  name: nonEmptyStringSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  ports: z.array(portSchema),
  data: z.record(z.string(), z.unknown()),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

// ── Edge ───────────────────────────────────────────────────────────────────

export const edgeSchema = z.object({
  id: nonEmptyStringSchema,
  sourceNodeId: nonEmptyStringSchema,
  sourcePortId: nonEmptyStringSchema,
  targetNodeId: nonEmptyStringSchema,
  targetPortId: nonEmptyStringSchema,
});
export type Edge = z.infer<typeof edgeSchema>;

// ── Graph State ────────────────────────────────────────────────────────────

export const graphStateSchema = z.object({
  nodes: z.record(z.string(), graphNodeSchema),
  edges: z.record(z.string(), edgeSchema),
});
export type GraphState = z.infer<typeof graphStateSchema>;

// ── Port type compatibility ────────────────────────────────────────────────

const COMPATIBLE_TYPES: Record<PortDataType, ReadonlySet<PortDataType>> = {
  flow: new Set(["flow"]),
  digital: new Set(["digital", "integer", "boolean", "any"]),
  analog: new Set(["analog", "integer", "float", "any"]),
  pwm: new Set(["pwm", "integer", "any"]),
  integer: new Set(["integer", "float", "analog", "pwm", "digital", "any"]),
  float: new Set(["float", "integer", "any"]),
  string: new Set(["string", "any"]),
  boolean: new Set(["boolean", "digital", "any"]),
  pin: new Set(["pin", "integer", "any"]),
  any: new Set([
    "flow",
    "digital",
    "analog",
    "pwm",
    "integer",
    "float",
    "string",
    "boolean",
    "pin",
    "any",
  ]),
};

export function arePortsCompatible(
  sourceType: PortDataType,
  targetType: PortDataType
): boolean {
  return COMPATIBLE_TYPES[sourceType].has(targetType);
}

// ── Default ports per node type ────────────────────────────────────────────

export function getDefaultPorts(nodeType: GraphNodeType): Port[] {
  switch (nodeType) {
    case "setup":
      return [
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "loop":
      return [
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "digital_write":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "value", name: "Value", direction: "in", dataType: "digital" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "digital_read":
      return [
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "value", name: "Value", direction: "out", dataType: "digital" },
      ];
    case "pin_mode":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "analog_write":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "value", name: "Value", direction: "in", dataType: "pwm" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "analog_read":
      return [
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "value", name: "Value", direction: "out", dataType: "analog" },
      ];
    case "delay":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "ms", name: "Milliseconds", direction: "in", dataType: "integer" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "millis":
      return [
        { id: "value", name: "Value", direction: "out", dataType: "integer" },
      ];
    case "micros":
      return [
        { id: "value", name: "Value", direction: "out", dataType: "integer" },
      ];
    case "serial_begin":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "serial_print":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "value", name: "Value", direction: "in", dataType: "any" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "serial_read":
      return [
        { id: "value", name: "Value", direction: "out", dataType: "integer" },
      ];
    case "if_else":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "condition", name: "Condition", direction: "in", dataType: "boolean" },
        { id: "flow_true", name: "True", direction: "out", dataType: "flow" },
        { id: "flow_false", name: "False", direction: "out", dataType: "flow" },
      ];
    case "comparison":
      return [
        { id: "a", name: "A", direction: "in", dataType: "any" },
        { id: "b", name: "B", direction: "in", dataType: "any" },
        { id: "result", name: "Result", direction: "out", dataType: "boolean" },
      ];
    case "logic_gate":
      return [
        { id: "a", name: "A", direction: "in", dataType: "boolean" },
        { id: "b", name: "B", direction: "in", dataType: "boolean" },
        { id: "result", name: "Result", direction: "out", dataType: "boolean" },
      ];
    case "math":
      return [
        { id: "a", name: "A", direction: "in", dataType: "float" },
        { id: "b", name: "B", direction: "in", dataType: "float" },
        { id: "result", name: "Result", direction: "out", dataType: "float" },
      ];
    case "map_value":
      return [
        { id: "value", name: "Value", direction: "in", dataType: "integer" },
        { id: "result", name: "Result", direction: "out", dataType: "integer" },
      ];
    case "constrain":
      return [
        { id: "value", name: "Value", direction: "in", dataType: "integer" },
        { id: "result", name: "Result", direction: "out", dataType: "integer" },
      ];
    case "variable":
      return [
        { id: "set", name: "Set", direction: "in", dataType: "any" },
        { id: "get", name: "Get", direction: "out", dataType: "any" },
      ];
    case "constant":
      return [
        { id: "value", name: "Value", direction: "out", dataType: "any" },
      ];
    case "servo_write":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "angle", name: "Angle", direction: "in", dataType: "integer" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "tone":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "pin", name: "Pin", direction: "in", dataType: "pin" },
        { id: "frequency", name: "Frequency", direction: "in", dataType: "integer" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "lcd_print":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "text", name: "Text", direction: "in", dataType: "string" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
    case "code_block":
      return [
        { id: "flow_in", name: "Flow", direction: "in", dataType: "flow" },
        { id: "flow_out", name: "Flow", direction: "out", dataType: "flow" },
      ];
  }
}
