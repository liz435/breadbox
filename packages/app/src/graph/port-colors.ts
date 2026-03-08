import type { PortDataType } from "@dreamer/schemas";

const PORT_COLORS: Record<PortDataType, string> = {
  texture: "#3b82f6",   // blue
  float: "#22c55e",     // green
  vec2: "#a855f7",      // purple
  color: "#f59e0b",     // amber
  audio: "#ec4899",     // pink
  trigger: "#ef4444",   // red
  entity: "#06b6d4",    // cyan
  string: "#f97316",    // orange
  shader: "#8b5cf6",    // violet
  material: "#14b8a6",  // teal
  any: "#6b7280",       // gray
};

export function getPortColor(dataType: PortDataType): string {
  return PORT_COLORS[dataType];
}

const NODE_TYPE_COLORS: Record<string, string> = {
  sprite: "#3b82f6",
  shader: "#8b5cf6",
  audio: "#ec4899",
  video: "#f43f5e",
  text: "#f97316",
  code: "#22c55e",
  material: "#14b8a6",
  math: "#6b7280",
  group: "#475569",
  on_start: "#ef4444",
  on_update: "#f59e0b",
  on_input: "#a855f7",
  input_map: "#7c3aed",
};

export function getNodeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? "#6b7280";
}
