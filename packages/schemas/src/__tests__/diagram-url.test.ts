import { describe, test, expect } from "bun:test";
import { encodeDiagramForUrl, decodeDiagramFromUrl } from "../diagram-url";
import { boardStateToDiagram, diagramToBoardState } from "../diagram-adapter";
import { createDefaultBoardState, type BoardState } from "../arduino";
import { DIAGRAM_SCHEMA_V1 } from "./../design";

/** Build a non-trivial board with a few components and wires. */
function makeRichBoard(): BoardState {
  const base = createDefaultBoardState();
  return {
    ...base,
    components: {
      "led-1": {
        id: "led-1",
        type: "led",
        name: "LED",
        x: 10,
        y: 3,
        rotation: 0,
        pins: { anode: null, cathode: null },
        properties: { color: "red" },
      },
      "res-1": {
        id: "res-1",
        type: "resistor",
        name: "Resistor",
        x: 12,
        y: 3,
        rotation: 0,
        pins: { a: null, b: null },
        properties: { resistanceOhms: 220 },
      },
    },
    wires: {
      "wire-1": {
        id: "wire-1",
        fromRow: -999,
        fromCol: 13,
        toRow: 3,
        toCol: 10,
        color: "#fbbf24",
      },
      "wire-2": {
        id: "wire-2",
        fromRow: 3,
        fromCol: 10,
        toRow: 3,
        toCol: 12,
        color: "#fbbf24",
      },
      "wire-gnd": {
        id: "wire-gnd",
        fromRow: -999,
        fromCol: -3,
        toRow: 3,
        toCol: 13,
        color: "#1a1a1a",
      },
    },
    sketchCode: "void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {}\n",
  };
}

describe("diagram-url — encode/decode round-trip", () => {
  test("encodes and decodes a minimal diagram losslessly", () => {
    const board = createDefaultBoardState();
    const diagram = boardStateToDiagram(board);
    const encoded = encodeDiagramForUrl(diagram);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeDiagramFromUrl(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.data).toEqual(diagram);
  });

  test("encoded output is URL-safe (no %-encoding or reserved chars)", () => {
    const diagram = boardStateToDiagram(makeRichBoard());
    const encoded = encodeDiagramForUrl(diagram);
    // LZString's URI variant emits only [A-Za-z0-9+-$]; nothing needing escape.
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
  });

  test("decode rejects empty payload with structured error", () => {
    const result = decodeDiagramFromUrl("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/empty/);
  });

  test("decode rejects garbage payload with structured error", () => {
    const result = decodeDiagramFromUrl("not-a-real-lz-string-blob!!");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  test("round-trip survives diagramToBoardState validation", () => {
    const diagram = boardStateToDiagram(makeRichBoard());
    const encoded = encodeDiagramForUrl(diagram);
    const decoded = decodeDiagramFromUrl(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const applied = diagramToBoardState(decoded.data);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(Object.keys(applied.boardState.components).sort()).toEqual([
      "led-1",
      "res-1",
    ]);
    expect(Object.keys(applied.boardState.wires).length).toBe(3);
  });

  test("compression actually shrinks typical diagram JSON", () => {
    // Build a realistic-size diagram: 8 LEDs + resistors + PSU. Small
    // 2-component diagrams compress poorly because dictionary-based
    // encoders need repetition to win; real user circuits easily
    // have 10+ components with repeating key/value patterns.
    const base = createDefaultBoardState();
    const components: BoardState["components"] = {};
    const wires: BoardState["wires"] = {};
    for (let i = 0; i < 8; i++) {
      components[`led-${i}`] = {
        id: `led-${i}`,
        type: "led",
        name: `LED ${i}`,
        x: 5 + i * 2,
        y: 3,
        rotation: 0,
        pins: { anode: null, cathode: null },
        properties: { color: "red" },
      };
      components[`res-${i}`] = {
        id: `res-${i}`,
        type: "resistor",
        name: `Resistor ${i}`,
        x: 6 + i * 2,
        y: 3,
        rotation: 0,
        pins: { a: null, b: null },
        properties: { resistanceOhms: 220 },
      };
      wires[`wire-${i}a`] = {
        id: `wire-${i}a`,
        fromRow: -999,
        fromCol: (i % 12) + 2,
        toRow: 3,
        toCol: 5 + i * 2,
        color: "#fbbf24",
      };
      wires[`wire-${i}b`] = {
        id: `wire-${i}b`,
        fromRow: 3,
        fromCol: 5 + i * 2,
        toRow: 3,
        toCol: 6 + i * 2,
        color: "#1a1a1a",
      };
    }
    const board: BoardState = { ...base, components, wires };
    const diagram = boardStateToDiagram(board);
    const rawJson = JSON.stringify(diagram);
    const encoded = encodeDiagramForUrl(diagram);
    // Compressed output must be materially smaller than the raw JSON for
    // a realistic circuit. 70 % is a loose bound — typical diagrams with
    // repeating component shapes land closer to 40 %.
    expect(encoded.length).toBeLessThan(rawJson.length * 0.7);
  });

  test("round-trip preserves $schema version marker", () => {
    const diagram = boardStateToDiagram(createDefaultBoardState());
    expect(diagram.$schema).toBe(DIAGRAM_SCHEMA_V1);
    const encoded = encodeDiagramForUrl(diagram);
    const decoded = decodeDiagramFromUrl(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const data = decoded.data as { $schema?: string };
    expect(data.$schema).toBe(DIAGRAM_SCHEMA_V1);
  });
});
