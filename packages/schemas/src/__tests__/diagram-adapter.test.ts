import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIAGRAM_SCHEMA_V1,
  boardStateSchema,
  boardStateToDiagram,
  diagramToBoardState,
  type DreamerDiagramInput,
} from "../index";

// ── Fixture directory ───────────────────────────────────────────────────

const EXAMPLES_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "app",
  "src",
  "examples",
  "boards",
);

function listExamples(): string[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => /^ex-.*\.json$/.test(f))
    .sort();
}

// ── Round-trip fidelity ─────────────────────────────────────────────────

describe("diagram-adapter — round-trip across all example boards", () => {
  for (const name of listExamples()) {
    test(`${name} survives boardState → diagram → boardState`, () => {
      const raw = JSON.parse(
        readFileSync(join(EXAMPLES_DIR, name), "utf8"),
      );
      const original = boardStateSchema.parse(raw);

      const diagram = boardStateToDiagram(original);
      expect(diagram.$schema).toBe(DIAGRAM_SCHEMA_V1);

      const result = diagramToBoardState(diagram);
      if (!result.ok) {
        throw new Error(
          `${name}: diagramToBoardState failed:\n` +
            result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n"),
        );
      }
      const reimported = result.boardState;

      // Semantic equality: components + wires + sketch + env match.
      expect(Object.keys(reimported.components).sort()).toEqual(
        Object.keys(original.components).sort(),
      );
      for (const id of Object.keys(original.components)) {
        const a = original.components[id];
        const b = reimported.components[id];
        expect(b.type).toBe(a.type);
        expect(b.x).toBe(a.x);
        expect(b.y).toBe(a.y);
        expect(b.rotation).toBe(a.rotation);
        expect(b.properties).toEqual(a.properties);
      }

      // Wire count matches; each original wire has a counterpart with the
      // same (fromRow, fromCol) → (toRow, toCol) connectivity.
      expect(Object.values(reimported.wires).length).toBe(
        Object.values(original.wires).length,
      );
      const wireKey = (w: {
        fromRow: number;
        fromCol: number;
        toRow: number;
        toCol: number;
      }) => `${w.fromRow},${w.fromCol}→${w.toRow},${w.toCol}`;
      const originalWireSet = new Set(Object.values(original.wires).map(wireKey));
      const reimportedWireSet = new Set(Object.values(reimported.wires).map(wireKey));
      expect(reimportedWireSet).toEqual(originalWireSet);

      expect(reimported.sketchCode).toBe(original.sketchCode);
      expect(reimported.boardTarget ?? "arduino_uno").toBe(
        original.boardTarget ?? "arduino_uno",
      );
    });
  }
});

// ── Hand-written fixtures ───────────────────────────────────────────────

const MINIMAL_BLINK: DreamerDiagramInput = {
  $schema: DIAGRAM_SCHEMA_V1,
  board: "arduino_uno",
  sketch:
    "void setup() { pinMode(13, OUTPUT); } void loop() { digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }",
  components: [
    {
      id: "led1",
      type: "led",
      at: [7, 5],
      rotation: 0,
      properties: { color: "#ef4444" },
    },
    {
      id: "r1",
      type: "resistor",
      at: [3, 5],
      rotation: 0,
      properties: { resistance: 220 },
    },
  ],
  wires: [
    { from: "arduino.13", to: "r1.a", color: "#fbbf24" },
    { from: "r1.b", to: "led1.anode", color: "#fbbf24" },
    { from: "led1.cathode", to: "arduino.GND", color: "#1a1a1a" },
  ],
  environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
  customLibraries: [],
};

describe("diagram-adapter — minimal blink import", () => {
  test("resolves arduino.13 → {-999, 13}", () => {
    const result = diagramToBoardState(MINIMAL_BLINK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wires = Object.values(result.boardState.wires);
    const d13Wire = wires.find((w) => w.fromRow === -999 && w.fromCol === 13);
    expect(d13Wire).toBeDefined();
  });

  test("resolves r1.a to resistor's left terminal (col=3)", () => {
    const result = diagramToBoardState(MINIMAL_BLINK);
    if (!result.ok) throw new Error("parse failed");
    const wires = Object.values(result.boardState.wires);
    const d13Wire = wires.find((w) => w.fromRow === -999 && w.fromCol === 13);
    expect(d13Wire?.toRow).toBe(5);
    expect(d13Wire?.toCol).toBe(3);
  });

  test("resolves led1.anode to (5, 7)", () => {
    const result = diagramToBoardState(MINIMAL_BLINK);
    if (!result.ok) throw new Error("parse failed");
    const wires = Object.values(result.boardState.wires);
    const anodeWire = wires.find((w) => w.toRow === 5 && w.toCol === 7);
    expect(anodeWire).toBeDefined();
  });

  test("resolves arduino.GND → {-999, -3}", () => {
    const result = diagramToBoardState(MINIMAL_BLINK);
    if (!result.ok) throw new Error("parse failed");
    const wires = Object.values(result.boardState.wires);
    const gndWire = wires.find(
      (w) =>
        (w.fromRow === -999 && w.fromCol === -3) ||
        (w.toRow === -999 && w.toCol === -3),
    );
    expect(gndWire).toBeDefined();
  });

  test("auto-generates wire ids", () => {
    const result = diagramToBoardState(MINIMAL_BLINK);
    if (!result.ok) throw new Error("parse failed");
    const ids = Object.keys(result.boardState.wires);
    expect(ids).toHaveLength(3);
    expect(ids.every((id) => /^wire-\d{3}$/.test(id))).toBe(true);
  });
});

// ── Error reporting ─────────────────────────────────────────────────────

describe("diagram-adapter — error surface", () => {
  test("unknown $schema version is rejected with a clear message", () => {
    const result = diagramToBoardState({
      $schema: "dreamer-diagram-v99",
      components: [],
      wires: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].path).toBe("$schema");
    expect(result.errors[0].message).toContain("dreamer-diagram-v99");
  });

  test("pin-name typo produces a fuzzy suggestion", () => {
    const result = diagramToBoardState({
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "",
      components: [
        {
          id: "led1",
          type: "led",
          at: [7, 5],
          rotation: 0,
          properties: {},
        },
      ],
      wires: [{ from: "arduino.13", to: "led1.anoed" }],
      environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      customLibraries: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.path === "wires[0].to");
    expect(err).toBeDefined();
    expect(err?.message).toContain("anode");
    expect(err?.suggestion).toBe("anode");
  });

  test("duplicate component ids are rejected", () => {
    const result = diagramToBoardState({
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "",
      components: [
        { id: "r1", type: "resistor", at: [3, 5], rotation: 0, properties: {} },
        { id: "r1", type: "resistor", at: [3, 7], rotation: 0, properties: {} },
      ],
      wires: [],
      environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      customLibraries: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].path).toBe("components[1].id");
    expect(result.errors[0].message).toContain("duplicate");
  });

  test("wire to non-existent component is rejected", () => {
    const result = diagramToBoardState({
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "",
      components: [],
      wires: [{ from: "arduino.13", to: "ghost.pin" }],
      environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      customLibraries: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.path === "wires[0].to");
    expect(err?.message).toContain("ghost");
  });

  test("arduino.A7 is rejected on arduino_uno (A0-A5 only)", () => {
    const result = diagramToBoardState({
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "",
      components: [],
      wires: [{ from: "arduino.A7", to: "arduino.GND" }],
      environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      customLibraries: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.path === "wires[0].from");
    expect(err).toBeDefined();
  });

  test("reserved id 'arduino' is rejected", () => {
    const result = diagramToBoardState({
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "",
      components: [
        { id: "arduino", type: "led", at: [5, 5], rotation: 0, properties: {} },
      ],
      wires: [],
      environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      customLibraries: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].path).toContain("components.0.id");
  });
});

// ── PSU shortcut ────────────────────────────────────────────────────────

describe("diagram-adapter — PSU rail shortcut", () => {
  const withPsu: DreamerDiagramInput = {
    $schema: DIAGRAM_SCHEMA_V1,
    board: "arduino_uno",
    sketch: "",
    components: [
      {
        id: "psu1",
        type: "power_supply",
        at: [0, 0],
        rotation: 0,
        properties: { leftVoltage: 5, rightVoltage: 5 },
      },
      {
        id: "servo1",
        type: "servo",
        at: [7, 5],
        rotation: 0,
        properties: {},
      },
    ],
    wires: [
      { from: "psu1.+", to: "servo1.vcc", color: "#ef4444" },
      { from: "psu1.-", to: "servo1.gnd", color: "#1a1a1a" },
    ],
    environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
    customLibraries: [],
  };

  test("psu1.+ / psu1.- resolve to the PSU's positive/negative anchors", () => {
    const result = diagramToBoardState(withPsu);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wires = Object.values(result.boardState.wires);
    const vccWire = wires.find((w) => w.color === "#ef4444");
    const gndWire = wires.find((w) => w.color === "#1a1a1a");
    expect(vccWire?.fromRow).toBe(0);
    expect(vccWire?.fromCol).toBe(0);
    expect(gndWire?.fromRow).toBe(1);
    expect(gndWire?.fromCol).toBe(0);
  });

  test("exports PSU rails back to psu1.+ / psu1.- form", () => {
    const result = diagramToBoardState(withPsu);
    if (!result.ok) throw new Error("parse failed");
    const re = boardStateToDiagram(result.boardState);
    const vccWire = re.wires.find((w) => w.color === "#ef4444");
    const gndWire = re.wires.find((w) => w.color === "#1a1a1a");
    expect(vccWire?.from).toBe("psu1.+");
    expect(gndWire?.from).toBe("psu1.-");
  });
});

// ── Grid fallback ───────────────────────────────────────────────────────

describe("diagram-adapter — grid fallback", () => {
  test("grid.5,9 round-trips as-is when no component owns that point", () => {
    const diagram: DreamerDiagramInput = {
      $schema: DIAGRAM_SCHEMA_V1,
      board: "arduino_uno",
      sketch: "",
      components: [
        { id: "led1", type: "led", at: [7, 5], rotation: 0, properties: {} },
      ],
      wires: [{ from: "arduino.GND", to: "grid.6,9" }],
      environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      customLibraries: [],
    };
    const result = diagramToBoardState(diagram);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const w = Object.values(result.boardState.wires)[0];
    expect(w.toRow).toBe(6);
    expect(w.toCol).toBe(9);

    const re = boardStateToDiagram(result.boardState);
    expect(re.wires[0].to).toBe("grid.6,9");
  });
});
