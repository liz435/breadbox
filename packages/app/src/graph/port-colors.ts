import type { PortDataType } from "@dreamer/schemas";

const PORT_COLORS: Record<PortDataType, string> = {
  flow: "#ef4444",      // red
  digital: "#3b82f6",   // blue
  analog: "#22c55e",    // green
  pwm: "#a855f7",       // purple
  integer: "#06b6d4",   // cyan
  float: "#14b8a6",     // teal
  string: "#f97316",    // orange
  boolean: "#f59e0b",   // amber
  pin: "#ec4899",       // pink
  any: "#6b7280",       // gray
};

export function getPortColor(dataType: PortDataType): string {
  return PORT_COLORS[dataType];
}

const NODE_TYPE_COLORS: Record<string, string> = {
  setup: "#ef4444",
  loop: "#f59e0b",
  digital_write: "#3b82f6",
  digital_read: "#60a5fa",
  pin_mode: "#8b5cf6",
  analog_write: "#22c55e",
  analog_read: "#4ade80",
  delay: "#f97316",
  millis: "#06b6d4",
  micros: "#06b6d4",
  serial_begin: "#ec4899",
  serial_print: "#f472b6",
  serial_read: "#f472b6",
  if_else: "#a855f7",
  comparison: "#7c3aed",
  logic_gate: "#c084fc",
  math: "#14b8a6",
  map_value: "#2dd4bf",
  constrain: "#2dd4bf",
  variable: "#f59e0b",
  constant: "#fbbf24",
  servo_write: "#10b981",
  tone: "#34d399",
  lcd_print: "#6366f1",
  code_block: "#475569",
};

export function getNodeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? "#6b7280";
}
