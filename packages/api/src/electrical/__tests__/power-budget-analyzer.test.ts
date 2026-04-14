import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardComponent, type BoardState } from "@dreamer/schemas";
import { analyzePowerBudget } from "../power-budget-analyzer";

function place(board: BoardState, component: BoardComponent) {
  board.components[component.id] = component;
}

function connect(
  board: BoardState,
  id: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
) {
  board.wires[id] = { id, fromRow, fromCol, toRow, toCol, color: "#22c55e" };
}

describe("analyzePowerBudget", () => {
  test("flags servo powered from Arduino 5V without external supply", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "servo-1",
      type: "servo",
      name: "Servo",
      x: 2,
      y: 5,
      rotation: 0,
      pins: { signal: null, vcc: null, gnd: null },
      properties: {},
    });

    connect(board, "w-signal", -999, 9, 5, 2);
    connect(board, "w-vcc", -999, -1, 6, 2);
    connect(board, "w-gnd", -999, -3, 7, 2);

    const report = analyzePowerBudget(board);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("EXTERNAL_POWER_REQUIRED");
    expect(codes).toContain("HIGH_CURRENT_ON_ARDUINO_5V");
  });

  test("passes external-supply servo topology with common ground", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "servo-1",
      type: "servo",
      name: "Servo",
      x: 2,
      y: 5,
      rotation: 0,
      pins: { signal: null, vcc: null, gnd: null },
      properties: {},
    });
    place(board, {
      id: "supply-1",
      type: "power_supply",
      name: "Supply",
      x: 8,
      y: 12,
      rotation: 0,
      pins: { positive: null, negative: null },
      properties: {},
    });

    connect(board, "w-signal", -999, 9, 5, 2);
    connect(board, "w-pwr", 12, 8, 6, 2);
    connect(board, "w-neg", 13, 8, 7, 2);
    connect(board, "w-common-gnd", -999, -3, 13, 8);

    const report = analyzePowerBudget(board);
    const errorCodes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(errorCodes).not.toContain("EXTERNAL_POWER_REQUIRED");
    expect(errorCodes).not.toContain("HIGH_CURRENT_ON_ARDUINO_5V");
  });

  test("recognizes MB102 rail-based supply wiring as external power", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "servo-1",
      type: "servo",
      name: "Servo",
      x: 2,
      y: 5,
      rotation: 0,
      pins: { signal: null, vcc: null, gnd: null },
      properties: {},
    });
    place(board, {
      id: "supply-1",
      type: "power_supply",
      name: "MB102",
      x: -1,
      y: 20,
      rotation: 0,
      pins: {},
      properties: { leftVoltage: 5, rightVoltage: 3.3 },
    });

    connect(board, "w-signal", -999, 9, 5, 2);
    // MB102 positive rail (-2) to servo VCC row; row bus links col 4 -> col 2.
    connect(board, "w-ext-vcc", 20, -2, 6, 4);
    // Common ground: Arduino GND to MB102 negative rail (-1).
    connect(board, "w-common-gnd", -999, -3, 20, -1);
    // MB102 negative rail to servo ground row.
    connect(board, "w-servo-gnd", 20, -1, 7, 4);

    const report = analyzePowerBudget(board);
    const errorCodes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(errorCodes).not.toContain("EXTERNAL_POWER_REQUIRED");
    expect(errorCodes).not.toContain("HIGH_CURRENT_ON_ARDUINO_5V");
  });

  test("recognizes external power across different rows on the same rail", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "servo-1",
      type: "servo",
      name: "Servo",
      x: 2,
      y: 5,
      rotation: 0,
      pins: { signal: null, vcc: null, gnd: null },
      properties: {},
    });
    place(board, {
      id: "supply-1",
      type: "power_supply",
      name: "MB102",
      x: -1,
      y: 20,
      rotation: 0,
      pins: {},
      properties: { leftVoltage: 5, rightVoltage: 3.3 },
    });

    connect(board, "w-signal", -999, 9, 5, 2);
    // Supply+ on one row of the + rail.
    connect(board, "w-rail-source", 20, -2, 20, 0);
    // Servo VCC tied to a different row of the same + rail.
    connect(board, "w-servo-vcc", 25, -2, 6, 2);
    // Common ground and servo return on a different rail row.
    connect(board, "w-common-gnd", -999, -3, 20, -1);
    connect(board, "w-servo-gnd", 27, -1, 7, 2);

    const report = analyzePowerBudget(board);
    const errorCodes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(errorCodes).not.toContain("EXTERNAL_POWER_REQUIRED");
    expect(errorCodes).not.toContain("HIGH_CURRENT_ON_ARDUINO_5V");
  });

  test("flags per-pin overcurrent for ten LEDs on one pin", () => {
    const board = createDefaultBoardState();

    for (let i = 0; i < 10; i++) {
      const row = i * 2;
      place(board, {
        id: `led-${i}`,
        type: "led",
        name: `LED ${i}`,
        x: 2,
        y: row,
        rotation: 0,
        pins: { anode: null, cathode: null },
        properties: { color: "#ef4444" },
      });
      connect(board, `w-led-${i}`, -999, 9, row, 2);
    }

    const report = analyzePowerBudget(board);
    const overcurrentIssues = report.issues.filter((issue) => issue.code === "PIN_OVERCURRENT");
    expect(overcurrentIssues.length).toBeGreaterThan(0);
    expect(overcurrentIssues.some((issue) => issue.pin === 9)).toBe(true);
  });

  test("flags direct-fanout wiring that should be rail/bus distributed", () => {
    const board = createDefaultBoardState();
    connect(board, "w-gnd-1", -999, -3, 5, 2);
    connect(board, "w-gnd-2", -999, -3, 9, 2);
    connect(board, "w-sig-1", -999, 9, 4, 2);
    connect(board, "w-sig-2", -999, 9, 10, 2);

    const report = analyzePowerBudget(board);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("PIN_DIRECT_FANOUT");
    expect(codes).toContain("GROUND_NOT_RAIL_DISTRIBUTED");
  });

  test("does not flag external-power-required when high-current part is placed but unpowered", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "seg-1",
      type: "seven_segment",
      name: "Seven Segment",
      x: 2,
      y: 5,
      rotation: 0,
      pins: { a: null, b: null, c: null, d: null, e: null, f: null, g: null },
      properties: {},
    });

    const report = analyzePowerBudget(board);
    const errorCodes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(errorCodes).not.toContain("EXTERNAL_POWER_REQUIRED");
  });

  test("flags LCD with control wiring but missing VDD and VSS", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "lcd-1",
      type: "lcd_16x2",
      name: "LCD",
      x: 5,
      y: 5,
      rotation: 0,
      pins: { vss: null, vdd: null, vo: null, rs: null, rw: null, e: null, d4: null, d5: null, d6: null, d7: null, a: null, k: null },
      properties: {},
    });

    connect(board, "w-rs", -999, 12, 8, 5);
    connect(board, "w-en", -999, 11, 10, 5);
    connect(board, "w-d4", -999, 5, 11, 5);
    connect(board, "w-d5", -999, 4, 12, 5);
    connect(board, "w-d6", -999, 3, 13, 5);
    connect(board, "w-d7", -999, 2, 14, 5);

    const report = analyzePowerBudget(board);
    const codes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes).toContain("LCD_POWER_MISSING");
    expect(codes).toContain("LCD_GROUND_MISSING");
  });

  test("flags unconnected LCD-related resistor", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "lcd-1",
      type: "lcd_16x2",
      name: "LCD",
      x: 5,
      y: 5,
      rotation: 0,
      pins: { vss: null, vdd: null, vo: null, rs: null, rw: null, e: null, d4: null, d5: null, d6: null, d7: null, a: null, k: null },
      properties: {},
    });
    place(board, {
      id: "r-lcd-contrast",
      type: "resistor",
      name: "LCD_contrast_resistor",
      x: 2,
      y: 20,
      rotation: 0,
      pins: { a: null, b: null },
      properties: { resistance: 1000 },
    });

    // Valid LCD power/ground so only resistor-specific issue is tested.
    connect(board, "w-vdd", -999, -1, 6, 5);
    connect(board, "w-vss", -999, -3, 5, 5);
    connect(board, "w-rs", -999, 12, 8, 5);

    const report = analyzePowerBudget(board);
    const codes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes).toContain("LCD_RESISTOR_UNCONNECTED");
  });

  test("flags button input with no opposite-side reference", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "btn-1",
      type: "button",
      name: "Button",
      x: 3,
      y: 10,
      rotation: 0,
      pins: { a: null, b: null },
      properties: {},
    });

    connect(board, "w-btn-signal", -999, 2, 10, 3);

    const report = analyzePowerBudget(board);
    const codes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes).toContain("BUTTON_REFERENCE_MISSING");
  });

  test("flags button wired with signals on both sides", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "btn-1",
      type: "button",
      name: "Button",
      x: 3,
      y: 10,
      rotation: 0,
      pins: { a: null, b: null },
      properties: {},
    });

    connect(board, "w-btn-signal-a", -999, 2, 10, 3);
    connect(board, "w-btn-signal-b", -999, 4, 11, 6);

    const report = analyzePowerBudget(board);
    const codes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes).toContain("BUTTON_SIGNAL_BOTH_SIDES");
  });

  test("accepts button with opposite-side ground reference", () => {
    const board = createDefaultBoardState();
    place(board, {
      id: "btn-1",
      type: "button",
      name: "Button",
      x: 3,
      y: 10,
      rotation: 0,
      pins: { a: null, b: null },
      properties: {},
    });

    connect(board, "w-btn-signal", -999, 2, 10, 3);
    connect(board, "w-btn-gnd", -999, -3, 11, 6);

    const report = analyzePowerBudget(board);
    const codes = report.issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes).not.toContain("BUTTON_REFERENCE_MISSING");
    expect(codes).not.toContain("BUTTON_SIGNAL_BOTH_SIDES");
  });
});
