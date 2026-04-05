import { describe, test, expect } from "bun:test";
import { getPortColor, getNodeColor } from "../port-colors";
import type { PortDataType, GraphNodeType } from "@dreamer/schemas";

describe("getPortColor", () => {
  test("returns a color for every port data type", () => {
    const types: PortDataType[] = [
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
    ];
    for (const t of types) {
      const color = getPortColor(t);
      expect(color).toBeTruthy();
      expect(color.startsWith("#")).toBe(true);
    }
  });

  test("different types have different colors (mostly)", () => {
    const colors = new Set([
      getPortColor("flow"),
      getPortColor("digital"),
      getPortColor("analog"),
      getPortColor("integer"),
      getPortColor("string"),
    ]);
    expect(colors.size).toBe(5);
  });
});

describe("getNodeColor", () => {
  test("returns a color for every node type", () => {
    const types: GraphNodeType[] = [
      "setup",
      "loop",
      "digital_write",
      "digital_read",
      "pin_mode",
      "analog_write",
      "analog_read",
      "delay",
      "millis",
      "micros",
      "serial_begin",
      "serial_print",
      "serial_read",
      "if_else",
      "comparison",
      "logic_gate",
      "math",
      "map_value",
      "constrain",
      "variable",
      "constant",
      "servo_write",
      "tone",
      "lcd_print",
      "code_block",
    ];
    for (const t of types) {
      const color = getNodeColor(t);
      expect(color).toBeTruthy();
      expect(color.startsWith("#")).toBe(true);
    }
  });

  test("returns fallback for unknown type", () => {
    const color = getNodeColor("unknown");
    expect(color).toBe("#6b7280");
  });
});
