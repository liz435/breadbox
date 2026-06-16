import { describe, expect, test } from "bun:test";
import { autoPlaceComponents, autoPlaceDiagram } from "../auto-placement";
import { validateDiagram } from "../diagram-validator";
import { resolveComponentPins } from "../component-pins";
import { DIAGRAM_SCHEMA_V1 } from "../design";

type PlacedComponent = { id: string; type: string; at: [number, number] };

describe("autoPlaceComponents", () => {
  test("returns non-arrays unchanged", () => {
    expect(autoPlaceComponents(null)).toBe(null);
    expect(autoPlaceComponents({ not: "an array" })).toEqual({ not: "an array" });
  });

  test("leaves board/surface components untouched", () => {
    const components = [
      { id: "bb", type: "breadboard_full", at: [0, 0] },
      { id: "led1", type: "led", at: [99, 99] },
    ];
    const placed = autoPlaceComponents(components) as PlacedComponent[];
    expect(placed[0].at).toEqual([0, 0]); // board untouched
    expect(placed[1].at).not.toEqual([99, 99]); // discrete re-placed
  });

  test("stacks discrete components on distinct, non-overlapping row spans", () => {
    const components = [
      { id: "led1", type: "led", at: [0, 0] },
      { id: "r1", type: "resistor", at: [0, 0] },
      { id: "srv1", type: "servo", at: [0, 0] },
    ];
    const placed = autoPlaceComponents(components) as PlacedComponent[];

    // Compute each component's occupied row span via the canonical resolver and
    // assert no two spans overlap.
    const spans = placed.map((c) => {
      const rows = Object.values(resolveComponentPins(c.type, c.at[0], c.at[1])).map((p) => p.row);
      return { lo: Math.min(...rows), hi: Math.max(...rows) };
    });
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i];
        const b = spans[j];
        const overlap = a.lo <= b.hi && b.lo <= a.hi;
        expect(overlap).toBe(false);
      }
    }
  });

  test("preserves non-position fields", () => {
    const components = [
      { id: "led1", type: "led", at: [0, 0], properties: { color: "#ef4444" }, rotation: 0 },
    ];
    const placed = autoPlaceComponents(components) as Array<PlacedComponent & { properties: unknown }>;
    expect(placed[0].id).toBe("led1");
    expect(placed[0].properties).toEqual({ color: "#ef4444" });
  });
});

describe("autoPlaceDiagram", () => {
  test("re-places a diagram's components and keeps it valid", () => {
    // A valid LED-blink circuit but with both parts stacked at the same origin
    // (would short). Auto-placement should spread them and keep it applying clean.
    const diagram = {
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "void setup(){pinMode(13,OUTPUT);}\nvoid loop(){digitalWrite(13,HIGH);delay(500);digitalWrite(13,LOW);delay(500);}",
      components: [
        { id: "led1", type: "led", at: [5, 5], rotation: 0, properties: { color: "#ef4444" } },
        { id: "r1", type: "resistor", at: [5, 5], rotation: 0, properties: { resistance: 220 } },
      ],
      wires: [
        { from: "arduino.13", to: "led1.anode", color: "#22c55e" },
        { from: "led1.cathode", to: "r1.b", color: "#1e293b" },
        { from: "r1.a", to: "arduino.GND", color: "#1e293b" },
      ],
    };

    const placed = autoPlaceDiagram(diagram);
    const result = validateDiagram(placed);
    expect(result.ok).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  test("returns non-diagram input unchanged", () => {
    expect(autoPlaceDiagram(42)).toBe(42);
    expect(autoPlaceDiagram({ no: "components" })).toEqual({ no: "components" });
  });
});
