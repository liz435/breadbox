import { describe, expect, test } from "bun:test";
import { buildExternalEditPrompt } from "../diagram-prompt";
import { DIAGRAM_SCHEMA_V1 } from "../design";
import { BOARD_TARGETS } from "../board-targets";
import { componentTypeSchema, isBoardComponentType } from "../arduino";
import { getComponentPinNames } from "../component-pins";

const SAMPLE = JSON.stringify(
  {
    $schema: DIAGRAM_SCHEMA_V1,
    board: "arduino_uno",
    sketch: "void setup() {}\nvoid loop() {}",
    components: [{ id: "led1", type: "led", at: [5, 5], properties: {} }],
    wires: [{ from: "arduino.13", to: "led1.anode", color: "#eab308" }],
  },
  null,
  2,
);

describe("buildExternalEditPrompt", () => {
  const prompt = buildExternalEditPrompt(SAMPLE);

  test("embeds the diagram JSON verbatim", () => {
    expect(prompt).toContain(SAMPLE);
  });

  test("declares the schema version and a return-JSON-only instruction", () => {
    expect(prompt).toContain(DIAGRAM_SCHEMA_V1);
    expect(prompt.toLowerCase()).toContain("only");
  });

  test("lists every supported board target", () => {
    for (const board of Object.values(BOARD_TARGETS)) {
      expect(prompt).toContain(board.id);
      expect(prompt).toContain(board.label);
    }
  });

  test("includes the generated pin reference for representative parts", () => {
    expect(prompt).toContain("led: anode, cathode");
    expect(prompt).toContain("button: a, b");
    expect(prompt).toContain("potentiometer: vcc, signal, gnd");
  });

  test("special-cases pinless wireable types", () => {
    expect(prompt).toContain("power_supply:");
    expect(prompt).toContain("ic:");
  });

  test("regression: no wireable component type is silently dropped", () => {
    for (const type of componentTypeSchema.options) {
      if (isBoardComponentType(type)) continue;
      const pins = getComponentPinNames(type);
      if (pins.length > 0) {
        expect(prompt).toContain(`${type}: ${pins.join(", ")}`);
      }
    }
  });

  test("documents the wire-endpoint grammar", () => {
    expect(prompt).toContain("arduino.13");
    expect(prompt).toContain("arduino.GND");
    expect(prompt).toContain("<id>.<pin>");
  });

  test("leaves a placeholder when no change is provided", () => {
    expect(prompt).toContain("<describe the change you want here>");
  });

  test("bakes a provided change into the My change section", () => {
    const withChange = buildExternalEditPrompt(SAMPLE, {
      change: "add a push button on pin 2 that toggles the LED",
    });
    expect(withChange).toContain("add a push button on pin 2 that toggles the LED");
    expect(withChange).not.toContain("<describe the change you want here>");
  });

  test("falls back to the placeholder for a blank/whitespace change", () => {
    expect(buildExternalEditPrompt(SAMPLE, { change: "   " })).toContain(
      "<describe the change you want here>",
    );
  });
});
