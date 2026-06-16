import type { GraphNode, GraphNodeType } from "@dreamer/schemas";

type NodeContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function NodeContent({ node }: NodeContentProps) {
  const label = NODE_TYPE_LABELS[node.type as GraphNodeType] ?? node.type;
  return (
    <div className="px-2 py-1 text-[10px] text-muted-foreground truncate">
      {label}
    </div>
  );
}

const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  setup: "Setup",
  loop: "Loop",
  digital_write: "Digital Write",
  digital_read: "Digital Read",
  pin_mode: "Pin Mode",
  analog_write: "Analog Write",
  analog_read: "Analog Read",
  delay: "Delay",
  millis: "Millis",
  micros: "Micros",
  serial_begin: "Serial Begin",
  serial_print: "Serial Print",
  serial_read: "Serial Read",
  if_else: "If / Else",
  comparison: "Comparison",
  logic_gate: "Logic Gate",
  math: "Math",
  map_value: "Map Value",
  constrain: "Constrain",
  variable: "Variable",
  constant: "Constant",
  servo_write: "Servo Write",
  tone: "Tone",
  lcd_print: "LCD Print",
  code_block: "Code Block",
};
