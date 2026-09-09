import { describe, expect, test } from "bun:test";
import {
  component2DVisualRowBounds,
  componentLayoutHeight,
  componentPlacementRowBounds,
  findAutoLayoutRow,
  visualRowBoundsOverlap,
} from "./physical-layout";

describe("cross-viewport physical auto-layout", () => {
  test("derives ordinary layout heights from canonical component pins", () => {
    expect(componentLayoutHeight("rgb_led")).toBe(4);
    expect(componentLayoutHeight("lcd_16x2")).toBe(16);
    expect(componentLayoutHeight("button")).toBe(2);
  });

  test("reproduces the row 6 PSU and row 21 servo overlap in 2D", () => {
    const psu = component2DVisualRowBounds("power_supply", 6);
    const servo = component2DVisualRowBounds("servo", 21);

    expect(psu).toEqual({ top: 6.5, bottom: 19 });
    expect(servo.top).toBeCloseTo(13.97, 2);
    expect(visualRowBoundsOverlap(psu, servo)).toBe(true);
  });

  test("moves that servo to the first row clear in both views", () => {
    const row = findAutoLayoutRow("servo", 21, [
      { type: "power_supply", row: 6, col: 8 },
    ]);

    expect(row).toBe(27);
    expect(visualRowBoundsOverlap(
      componentPlacementRowBounds("power_supply", 6),
      componentPlacementRowBounds("servo", row!),
    )).toBe(false);
  });

  test("uses the full 63-row board when the safe row is beyond the old limit", () => {
    expect(findAutoLayoutRow("servo", 22, [
      { type: "power_supply", row: 18, col: 8 },
    ])).toBe(39);
  });
});
