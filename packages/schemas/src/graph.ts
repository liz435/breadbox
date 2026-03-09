import { z } from "zod";
import { nonEmptyStringSchema } from "./primitives";

// ── Port Data Types ─────────────────────────────────────────────────────────

export const portDataTypeSchema = z.enum([
  "texture",
  "float",
  "vec2",
  "color",
  "audio",
  "trigger",
  "entity",
  "string",
  "shader",
  "material",
  "any",
]);

export type PortDataType = z.infer<typeof portDataTypeSchema>;

// ── Port Direction ──────────────────────────────────────────────────────────

export const portDirectionSchema = z.enum(["in", "out"]);

export type PortDirection = z.infer<typeof portDirectionSchema>;

// ── Port ────────────────────────────────────────────────────────────────────

export const portSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  direction: portDirectionSchema,
  dataType: portDataTypeSchema,
});

export type Port = z.infer<typeof portSchema>;

// ── Graph Node Types ────────────────────────────────────────────────────────

export const graphNodeTypeSchema = z.enum([
  "sprite",
  "shader",
  "audio",
  "video",
  "text",
  "code",
  "material",
  "math",
  "group",
  "on_start",
  "on_update",
  "on_input",
  "input_map",
  "composer",
  "output",
]);

export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;

// ── Graph Node ──────────────────────────────────────────────────────────────

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

// ── Edge ────────────────────────────────────────────────────────────────────

export const edgeSchema = z.object({
  id: nonEmptyStringSchema,
  sourceNodeId: nonEmptyStringSchema,
  sourcePortId: nonEmptyStringSchema,
  targetNodeId: nonEmptyStringSchema,
  targetPortId: nonEmptyStringSchema,
});

export type Edge = z.infer<typeof edgeSchema>;

// ── Graph State ─────────────────────────────────────────────────────────────

export const graphStateSchema = z.object({
  nodes: z.record(z.string(), graphNodeSchema),
  edges: z.record(z.string(), edgeSchema),
});

export type GraphState = z.infer<typeof graphStateSchema>;

// ── Port type compatibility ─────────────────────────────────────────────────

const COMPATIBLE_TYPES: Record<PortDataType, ReadonlySet<PortDataType>> = {
  texture: new Set(["texture", "any"]),
  float: new Set(["float", "any"]),
  vec2: new Set(["vec2", "any"]),
  color: new Set(["color", "any"]),
  audio: new Set(["audio", "any"]),
  trigger: new Set(["trigger", "any"]),
  entity: new Set(["entity", "any"]),
  string: new Set(["string", "any"]),
  shader: new Set(["shader", "any"]),
  material: new Set(["material", "any"]),
  any: new Set([
    "texture",
    "float",
    "vec2",
    "color",
    "audio",
    "trigger",
    "entity",
    "string",
    "shader",
    "material",
    "any",
  ]),
};

/**
 * Check if an output port type can connect to an input port type.
 */
export function arePortsCompatible(
  sourceType: PortDataType,
  targetType: PortDataType
): boolean {
  return COMPATIBLE_TYPES[sourceType].has(targetType);
}

// ── Default ports per node type ─────────────────────────────────────────────

export function getDefaultPorts(nodeType: GraphNodeType): Port[] {
  switch (nodeType) {
    case "sprite":
      return [
        { id: "shader_in", name: "Shader", direction: "in", dataType: "shader" },
        { id: "material_in", name: "Material", direction: "in", dataType: "material" },
        { id: "texture_out", name: "Texture", direction: "out", dataType: "texture" },
        { id: "entity_out", name: "Entity", direction: "out", dataType: "entity" },
      ];
    case "shader":
      return [
        { id: "texture_in", name: "Texture", direction: "in", dataType: "texture" },
        { id: "float_in", name: "Float", direction: "in", dataType: "float" },
        { id: "color_in", name: "Color", direction: "in", dataType: "color" },
        { id: "shader_out", name: "Shader", direction: "out", dataType: "shader" },
      ];
    case "audio":
      return [
        { id: "trigger_in", name: "Trigger", direction: "in", dataType: "trigger" },
        { id: "volume_in", name: "Volume", direction: "in", dataType: "float" },
        { id: "pitch_in", name: "Pitch", direction: "in", dataType: "float" },
        { id: "audio_out", name: "Audio", direction: "out", dataType: "audio" },
        { id: "on_complete", name: "On Complete", direction: "out", dataType: "trigger" },
      ];
    case "video":
      return [
        { id: "trigger_in", name: "Trigger", direction: "in", dataType: "trigger" },
        { id: "rate_in", name: "Rate", direction: "in", dataType: "float" },
        { id: "texture_out", name: "Texture", direction: "out", dataType: "texture" },
        { id: "audio_out", name: "Audio", direction: "out", dataType: "audio" },
      ];
    case "text":
      return [
        { id: "vars_in", name: "Variables", direction: "in", dataType: "any" },
        { id: "string_out", name: "String", direction: "out", dataType: "string" },
      ];
    case "code":
      return [
        { id: "trigger_in", name: "Trigger", direction: "in", dataType: "trigger" },
        { id: "data_0_in", name: "Data A", direction: "in", dataType: "any" },
        { id: "data_1_in", name: "Data B", direction: "in", dataType: "any" },
        { id: "trigger_out", name: "Trigger", direction: "out", dataType: "trigger" },
        { id: "data_out", name: "Data", direction: "out", dataType: "any" },
      ];
    case "material":
      return [
        { id: "base_texture_in", name: "Base Texture", direction: "in", dataType: "texture" },
        { id: "normal_in", name: "Normal Map", direction: "in", dataType: "texture" },
        { id: "shader_in", name: "Shader", direction: "in", dataType: "shader" },
        { id: "material_out", name: "Material", direction: "out", dataType: "material" },
      ];
    case "math":
      return [
        { id: "a_in", name: "A", direction: "in", dataType: "float" },
        { id: "b_in", name: "B", direction: "in", dataType: "float" },
        { id: "result_out", name: "Result", direction: "out", dataType: "float" },
      ];
    case "group":
      return [];
    case "on_start":
      return [
        { id: "trigger_out", name: "Trigger", direction: "out", dataType: "trigger" },
      ];
    case "on_update":
      return [
        { id: "trigger_out", name: "Trigger", direction: "out", dataType: "trigger" },
        { id: "dt_out", name: "Delta Time", direction: "out", dataType: "float" },
      ];
    case "on_input":
      return [
        { id: "trigger_out", name: "Trigger", direction: "out", dataType: "trigger" },
        { id: "key_out", name: "Key", direction: "out", dataType: "string" },
      ];
    case "input_map":
      return [
        { id: "actions_out", name: "Actions", direction: "out", dataType: "any" },
      ];
    case "composer":
      return [
        { id: "entities_in", name: "Entities", direction: "in", dataType: "entity" },
        { id: "scene_out", name: "Scene", direction: "out", dataType: "any" },
      ];
    case "output":
      return [
        { id: "scene_in", name: "Scene", direction: "in", dataType: "any" },
        { id: "texture_in", name: "Texture", direction: "in", dataType: "texture" },
        { id: "audio_in", name: "Audio", direction: "in", dataType: "audio" },
      ];
  }
}
