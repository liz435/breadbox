import type { GraphNode, Edge, GraphNodeType } from "@dreamer/schemas";

// ── Types ──────────────────────────────────────────────────────────────────

type FlowChain = {
  nodeIds: string[];
  hasCycle: boolean;
};

type DataResolution = {
  /** The C++ expression string for this input */
  expression: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function isFlowEdge(
  edge: Edge,
  nodes: Record<string, GraphNode>,
): boolean {
  const sourceNode = nodes[edge.sourceNodeId];
  if (!sourceNode) return false;
  const port = sourceNode.ports.find((p) => p.id === edge.sourcePortId);
  return port?.dataType === "flow";
}

function findFlowSuccessor(
  nodeId: string,
  portId: string,
  edges: Record<string, Edge>,
): string | null {
  for (const edge of Object.values(edges)) {
    if (edge.sourceNodeId === nodeId && edge.sourcePortId === portId) {
      return edge.targetNodeId;
    }
  }
  return null;
}

/**
 * Follow flow connections from an entry node, building a chain in order.
 * Detects cycles by tracking visited nodes.
 */
function followFlowChain(
  startNodeId: string,
  flowOutPort: string,
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
): FlowChain {
  const visited = new Set<string>();
  const chain: string[] = [];
  let currentId = findFlowSuccessor(startNodeId, flowOutPort, edges);

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return { nodeIds: chain, hasCycle: true };
    }
    visited.add(currentId);
    chain.push(currentId);

    const node = nodes[currentId];
    if (!node) break;

    // Find the flow_out port to continue the chain
    const flowOut = node.ports.find(
      (p) => p.id === "flow_out" && p.direction === "out" && p.dataType === "flow",
    );
    if (!flowOut) break;

    currentId = findFlowSuccessor(currentId, flowOut.id, edges);
  }

  return { nodeIds: chain, hasCycle: false };
}

/**
 * Resolve a data input for a node: check if there is a data connection
 * providing a value; if so, generate the source node's expression.
 * Otherwise fall back to the node's own data field.
 */
function resolveDataInput(
  nodeId: string,
  portId: string,
  fallback: unknown,
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
): string {
  // Find a non-flow edge targeting this port
  for (const edge of Object.values(edges)) {
    if (edge.targetNodeId === nodeId && edge.targetPortId === portId) {
      if (isFlowEdge(edge, nodes)) continue;
      const sourceNode = nodes[edge.sourceNodeId];
      if (sourceNode) {
        return generateExpression(sourceNode, nodes, edges);
      }
    }
  }
  return String(fallback ?? "0");
}

/**
 * Generate a C++ expression for a node that produces a value (not a statement).
 */
function generateExpression(
  node: GraphNode,
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
): string {
  switch (node.type) {
    case "digital_read": {
      const pin = resolveDataInput(node.id, "pin", node.data.pin, nodes, edges);
      return `digitalRead(${pin})`;
    }
    case "analog_read": {
      const pin = resolveDataInput(node.id, "pin", node.data.pin, nodes, edges);
      return `analogRead(${pin})`;
    }
    case "millis":
      return "millis()";
    case "micros":
      return "micros()";
    case "comparison": {
      const a = resolveDataInput(node.id, "a", "0", nodes, edges);
      const b = resolveDataInput(node.id, "b", "0", nodes, edges);
      const op = String(node.data.operator ?? "==");
      return `(${a} ${op} ${b})`;
    }
    case "logic_gate": {
      const a = resolveDataInput(node.id, "a", "false", nodes, edges);
      const b = resolveDataInput(node.id, "b", "false", nodes, edges);
      const gate = String(node.data.gate ?? "AND");
      if (gate === "NOT") return `!${a}`;
      const cOp = gate === "AND" ? "&&" : "||";
      return `(${a} ${cOp} ${b})`;
    }
    case "math": {
      const a = resolveDataInput(node.id, "a", "0", nodes, edges);
      const b = resolveDataInput(node.id, "b", "0", nodes, edges);
      const operation = String(node.data.operation ?? "add");
      switch (operation) {
        case "add":
          return `(${a} + ${b})`;
        case "subtract":
          return `(${a} - ${b})`;
        case "multiply":
          return `(${a} * ${b})`;
        case "divide":
          return `(${a} / ${b})`;
        case "abs":
          return `abs(${a})`;
        case "min":
          return `min(${a}, ${b})`;
        case "max":
          return `max(${a}, ${b})`;
        default:
          return `(${a} + ${b})`;
      }
    }
    case "map_value": {
      const val = resolveDataInput(node.id, "value", "0", nodes, edges);
      const fromLow = String(node.data.fromLow ?? 0);
      const fromHigh = String(node.data.fromHigh ?? 1023);
      const toLow = String(node.data.toLow ?? 0);
      const toHigh = String(node.data.toHigh ?? 255);
      return `map(${val}, ${fromLow}, ${fromHigh}, ${toLow}, ${toHigh})`;
    }
    case "constrain": {
      const val = resolveDataInput(node.id, "value", "0", nodes, edges);
      const low = String(node.data.low ?? 0);
      const high = String(node.data.high ?? 255);
      return `constrain(${val}, ${low}, ${high})`;
    }
    case "variable":
      return String(node.data.name ?? "myVar");
    case "constant":
      return String(node.data.value ?? "0");
    case "serial_read":
      return "Serial.read()";
    default:
      return "0";
  }
}

/**
 * Generate a C++ statement for a flow-connected node.
 */
function generateStatement(
  node: GraphNode,
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
  indent: string,
): string {
  switch (node.type) {
    case "pin_mode": {
      const pin = resolveDataInput(node.id, "pin", node.data.pin, nodes, edges);
      const mode = String(node.data.mode ?? "OUTPUT");
      return `${indent}pinMode(${pin}, ${mode});`;
    }
    case "digital_write": {
      const pin = resolveDataInput(node.id, "pin", node.data.pin, nodes, edges);
      const value = resolveDataInput(node.id, "value", node.data.value, nodes, edges);
      return `${indent}digitalWrite(${pin}, ${value});`;
    }
    case "analog_write": {
      const pin = resolveDataInput(node.id, "pin", node.data.pin, nodes, edges);
      const value = resolveDataInput(node.id, "value", node.data.value, nodes, edges);
      return `${indent}analogWrite(${pin}, ${value});`;
    }
    case "delay": {
      const ms = resolveDataInput(node.id, "ms", node.data.ms, nodes, edges);
      return `${indent}delay(${ms});`;
    }
    case "serial_begin": {
      const baud = String(node.data.baudRate ?? node.data.baud ?? 9600);
      return `${indent}Serial.begin(${baud});`;
    }
    case "serial_print": {
      const value = resolveDataInput(node.id, "value", node.data.value, nodes, edges);
      const quoted = typeof node.data.value === "string" && !hasDataConnection(node.id, "value", edges)
        ? `"${value}"`
        : value;
      return `${indent}Serial.println(${quoted});`;
    }
    case "if_else": {
      const condition = resolveDataInput(node.id, "condition", "false", nodes, edges);
      const lines: string[] = [];
      lines.push(`${indent}if (${condition}) {`);

      // Follow true branch
      const trueBranch = followFlowChain(node.id, "flow_true", nodes, edges);
      if (trueBranch.hasCycle) {
        lines.push(`${indent}  // Error: circular connection detected`);
      } else {
        for (const nid of trueBranch.nodeIds) {
          const n = nodes[nid];
          if (n) lines.push(generateStatement(n, nodes, edges, indent + "  "));
        }
      }

      // Follow false branch
      const falseBranch = followFlowChain(node.id, "flow_false", nodes, edges);
      if (falseBranch.nodeIds.length > 0 || falseBranch.hasCycle) {
        lines.push(`${indent}} else {`);
        if (falseBranch.hasCycle) {
          lines.push(`${indent}  // Error: circular connection detected`);
        } else {
          for (const nid of falseBranch.nodeIds) {
            const n = nodes[nid];
            if (n) lines.push(generateStatement(n, nodes, edges, indent + "  "));
          }
        }
      }

      lines.push(`${indent}}`);
      return lines.join("\n");
    }
    case "servo_write": {
      const angle = resolveDataInput(node.id, "angle", node.data.angle, nodes, edges);
      return `${indent}myServo.write(${angle});`;
    }
    case "tone": {
      const pin = resolveDataInput(node.id, "pin", node.data.pin, nodes, edges);
      const frequency = resolveDataInput(node.id, "frequency", node.data.frequency, nodes, edges);
      return `${indent}tone(${pin}, ${frequency});`;
    }
    case "lcd_print": {
      const text = resolveDataInput(node.id, "text", node.data.text, nodes, edges);
      const quoted = typeof node.data.text === "string" && !hasDataConnection(node.id, "text", edges)
        ? `"${text}"`
        : text;
      return `${indent}lcd.print(${quoted});`;
    }
    case "code_block": {
      const code = String(node.data.code ?? "");
      // Indent each line of raw code
      return code
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
    }
    default:
      return `${indent}// ${node.type} (unsupported)`;
  }
}

function hasDataConnection(
  nodeId: string,
  portId: string,
  edges: Record<string, Edge>,
): boolean {
  for (const edge of Object.values(edges)) {
    if (edge.targetNodeId === nodeId && edge.targetPortId === portId) {
      return true;
    }
  }
  return false;
}

// ── Globals collection ─────────────────────────────────────────────────────

function collectGlobals(nodes: Record<string, GraphNode>): string[] {
  const lines: string[] = [];
  const needsServo = Object.values(nodes).some((n) => n.type === "servo_write");
  const needsLcd = Object.values(nodes).some((n) => n.type === "lcd_print");

  if (needsServo) {
    lines.push("#include <Servo.h>");
    lines.push("Servo myServo;");
  }
  if (needsLcd) {
    lines.push("#include <LiquidCrystal_I2C.h>");
    const lcdNode = Object.values(nodes).find((n) => n.type === "lcd_print");
    const addr = lcdNode?.data.address ?? "0x27";
    const cols = lcdNode?.data.cols ?? 16;
    const rows = lcdNode?.data.rows ?? 2;
    lines.push(`LiquidCrystal_I2C lcd(${addr}, ${cols}, ${rows});`);
  }

  for (const node of Object.values(nodes)) {
    if (node.type === "variable") {
      const name = String(node.data.name ?? "myVar");
      const dt = String(node.data.dataType ?? "integer");
      const cppType = dataTypeToCpp(dt);
      const init = String(node.data.initialValue ?? "0");
      lines.push(`${cppType} ${name} = ${init};`);
    }
    if (node.type === "constant") {
      const name = typeof node.data.name === "string" ? node.data.name : null;
      if (name) {
        const dt = String(node.data.dataType ?? "integer");
        const cppType = dataTypeToCpp(dt);
        const val = String(node.data.value ?? "0");
        lines.push(`const ${cppType} ${name} = ${val};`);
      }
    }
  }

  return lines;
}

function dataTypeToCpp(dt: string): string {
  switch (dt) {
    case "integer":
      return "int";
    case "float":
      return "float";
    case "boolean":
      return "bool";
    case "string":
      return "String";
    default:
      return "int";
  }
}

// ── Main codegen function ──────────────────────────────────────────────────

const EMPTY_SKETCH = `void setup() {
  // put your setup code here
}

void loop() {
  // put your main code here
}
`;

export function generateArduinoCode(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
): string {
  const nodeList = Object.values(nodes);
  const setupNode = nodeList.find((n) => n.type === "setup");
  const loopNode = nodeList.find((n) => n.type === "loop");

  if (!setupNode && !loopNode) {
    return EMPTY_SKETCH;
  }

  const globals = collectGlobals(nodes);
  const lines: string[] = [];

  // Globals
  if (globals.length > 0) {
    for (const g of globals) {
      lines.push(g);
    }
    lines.push("");
  }

  // setup()
  lines.push("void setup() {");
  if (setupNode) {
    const chain = followFlowChain(setupNode.id, "flow_out", nodes, edges);
    if (chain.hasCycle) {
      lines.push("  // Error: circular connection detected");
    } else {
      for (const nid of chain.nodeIds) {
        const node = nodes[nid];
        if (node) {
          lines.push(generateStatement(node, nodes, edges, "  "));
        }
      }
    }
  }
  lines.push("}");
  lines.push("");

  // loop()
  lines.push("void loop() {");
  if (loopNode) {
    const chain = followFlowChain(loopNode.id, "flow_out", nodes, edges);
    if (chain.hasCycle) {
      lines.push("  // Error: circular connection detected");
    } else {
      for (const nid of chain.nodeIds) {
        const node = nodes[nid];
        if (node) {
          lines.push(generateStatement(node, nodes, edges, "  "));
        }
      }
    }
  }
  lines.push("}");

  return lines.join("\n") + "\n";
}
