import { describe, test, expect } from "bun:test";
import { getPortColor, getNodeColor } from "../port-colors";
import type { PortDataType, GraphNodeType } from "@dreamer/schemas";

describe("getPortColor", () => {
  test("returns a color for every port data type", () => {
    const types: PortDataType[] = [
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
    ];
    for (const t of types) {
      const color = getPortColor(t);
      expect(color).toBeTruthy();
      expect(color.startsWith("#")).toBe(true);
    }
  });

  test("different types have different colors (mostly)", () => {
    const colors = new Set([
      getPortColor("texture"),
      getPortColor("float"),
      getPortColor("audio"),
      getPortColor("trigger"),
      getPortColor("shader"),
    ]);
    expect(colors.size).toBe(5);
  });
});

describe("getNodeColor", () => {
  test("returns a color for every node type", () => {
    const types: GraphNodeType[] = [
      "sprite",
      "shader",
      "audio",
      "video",
      "text",
      "code",
      "material",
      "math",
      "group",
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
