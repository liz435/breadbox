import { describe, test, expect } from "bun:test";
import { generateArduinoCode } from "../arduino-codegen";
import { createGraphNode } from "../node-factory";
import type { GraphNode, Edge } from "@dreamer/schemas";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEdge(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): Edge {
  return {
    id: `edge-${sourceNodeId}-${sourcePortId}-${targetNodeId}-${targetPortId}`,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  };
}

function toRecord(nodes: GraphNode[]): Record<string, GraphNode> {
  const record: Record<string, GraphNode> = {};
  for (const node of nodes) {
    record[node.id] = node;
  }
  return record;
}

function edgeRecord(edges: Edge[]): Record<string, Edge> {
  const record: Record<string, Edge> = {};
  for (const edge of edges) {
    record[edge.id] = edge;
  }
  return record;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("generateArduinoCode", () => {
  test("empty graph returns empty sketch template", () => {
    const result = generateArduinoCode({}, {});
    expect(result).toContain("void setup()");
    expect(result).toContain("void loop()");
    expect(result).toContain("// put your setup code here");
  });

  test("setup + pin_mode generates valid setup function", () => {
    const setup = createGraphNode("setup", { id: "setup-1" });
    const pinMode = createGraphNode("pin_mode", {
      id: "pm-1",
      data: { pin: 13, mode: "OUTPUT" },
    });

    const nodes = toRecord([setup, pinMode]);
    const edges = edgeRecord([
      makeEdge("setup-1", "flow_out", "pm-1", "flow_in"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("void setup()");
    expect(result).toContain("pinMode(13, OUTPUT);");
  });

  test("setup + loop with digital_write + delay generates blink sketch", () => {
    const setup = createGraphNode("setup", { id: "setup-1" });
    const pinMode = createGraphNode("pin_mode", {
      id: "pm-1",
      data: { pin: 13, mode: "OUTPUT" },
    });
    const loop = createGraphNode("loop", { id: "loop-1" });
    const dw1 = createGraphNode("digital_write", {
      id: "dw-1",
      data: { pin: 13, value: "HIGH" },
    });
    const delay1 = createGraphNode("delay", {
      id: "del-1",
      data: { ms: 1000 },
    });
    const dw2 = createGraphNode("digital_write", {
      id: "dw-2",
      data: { pin: 13, value: "LOW" },
    });
    const delay2 = createGraphNode("delay", {
      id: "del-2",
      data: { ms: 1000 },
    });

    const nodes = toRecord([setup, pinMode, loop, dw1, delay1, dw2, delay2]);
    const edges = edgeRecord([
      // setup chain
      makeEdge("setup-1", "flow_out", "pm-1", "flow_in"),
      // loop chain
      makeEdge("loop-1", "flow_out", "dw-1", "flow_in"),
      makeEdge("dw-1", "flow_out", "del-1", "flow_in"),
      makeEdge("del-1", "flow_out", "dw-2", "flow_in"),
      makeEdge("dw-2", "flow_out", "del-2", "flow_in"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("void setup()");
    expect(result).toContain("pinMode(13, OUTPUT);");
    expect(result).toContain("void loop()");
    expect(result).toContain("digitalWrite(13, HIGH);");
    expect(result).toContain("delay(1000);");
    expect(result).toContain("digitalWrite(13, LOW);");
  });

  test("variable and constant nodes generate globals", () => {
    const setup = createGraphNode("setup", { id: "setup-1" });
    const variable = createGraphNode("variable", {
      id: "var-1",
      data: { name: "ledState", dataType: "integer", initialValue: 0 },
    });
    const constant = createGraphNode("constant", {
      id: "const-1",
      data: { name: "LED_PIN", dataType: "integer", value: 13 },
    });

    const nodes = toRecord([setup, variable, constant]);
    const edges = edgeRecord([]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("int ledState = 0;");
    expect(result).toContain("const int LED_PIN = 13;");
  });

  test("cycle detection returns error comment", () => {
    const setup = createGraphNode("setup", { id: "setup-1" });
    const dw1 = createGraphNode("digital_write", {
      id: "dw-1",
      data: { pin: 13, value: "HIGH" },
    });
    const delay1 = createGraphNode("delay", {
      id: "del-1",
      data: { ms: 500 },
    });

    const nodes = toRecord([setup, dw1, delay1]);
    // Create a cycle: setup -> dw1 -> del1 -> dw1
    const edges = edgeRecord([
      makeEdge("setup-1", "flow_out", "dw-1", "flow_in"),
      makeEdge("dw-1", "flow_out", "del-1", "flow_in"),
      makeEdge("del-1", "flow_out", "dw-1", "flow_in"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("// Error: circular connection detected");
  });

  test("data connections resolve to source expressions", () => {
    const setup = createGraphNode("setup", { id: "setup-1" });
    const analogRead = createGraphNode("analog_read", {
      id: "ar-1",
      data: { pin: 0 },
    });
    const serialBegin = createGraphNode("serial_begin", {
      id: "sb-1",
      data: { baudRate: 9600 },
    });
    const serialPrint = createGraphNode("serial_print", {
      id: "sp-1",
      data: { value: "" },
    });

    const nodes = toRecord([setup, analogRead, serialBegin, serialPrint]);
    const edges = edgeRecord([
      // Flow: setup -> serialBegin -> serialPrint
      makeEdge("setup-1", "flow_out", "sb-1", "flow_in"),
      makeEdge("sb-1", "flow_out", "sp-1", "flow_in"),
      // Data: analogRead.value -> serialPrint.value
      makeEdge("ar-1", "value", "sp-1", "value"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("Serial.begin(9600);");
    expect(result).toContain("Serial.println(analogRead(0));");
  });

  test("if_else generates branching code", () => {
    const loop = createGraphNode("loop", { id: "loop-1" });
    const cmp = createGraphNode("comparison", {
      id: "cmp-1",
      data: { operator: ">" },
    });
    const ifElse = createGraphNode("if_else", { id: "if-1" });
    const dwHigh = createGraphNode("digital_write", {
      id: "dw-high",
      data: { pin: 13, value: "HIGH" },
    });
    const dwLow = createGraphNode("digital_write", {
      id: "dw-low",
      data: { pin: 13, value: "LOW" },
    });

    const nodes = toRecord([loop, cmp, ifElse, dwHigh, dwLow]);
    const edges = edgeRecord([
      // Flow: loop -> if_else
      makeEdge("loop-1", "flow_out", "if-1", "flow_in"),
      // Data: comparison -> if_else condition
      makeEdge("cmp-1", "result", "if-1", "condition"),
      // True branch
      makeEdge("if-1", "flow_true", "dw-high", "flow_in"),
      // False branch
      makeEdge("if-1", "flow_false", "dw-low", "flow_in"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("if ((0 > 0))");
    expect(result).toContain("digitalWrite(13, HIGH);");
    expect(result).toContain("} else {");
    expect(result).toContain("digitalWrite(13, LOW);");
  });

  test("servo_write includes Servo.h and global", () => {
    const setup = createGraphNode("setup", { id: "setup-1" });
    const servo = createGraphNode("servo_write", {
      id: "sv-1",
      data: { pin: 9, angle: 90 },
    });

    const nodes = toRecord([setup, servo]);
    const edges = edgeRecord([
      makeEdge("setup-1", "flow_out", "sv-1", "flow_in"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("#include <Servo.h>");
    expect(result).toContain("Servo myServo;");
    expect(result).toContain("myServo.write(90);");
  });

  test("code_block passes through raw code", () => {
    const loop = createGraphNode("loop", { id: "loop-1" });
    const codeBlock = createGraphNode("code_block", {
      id: "cb-1",
      data: { code: "PORTB ^= (1 << 5);" },
    });

    const nodes = toRecord([loop, codeBlock]);
    const edges = edgeRecord([
      makeEdge("loop-1", "flow_out", "cb-1", "flow_in"),
    ]);

    const result = generateArduinoCode(nodes, edges);
    expect(result).toContain("PORTB ^= (1 << 5);");
  });
});
