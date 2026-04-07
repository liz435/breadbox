import { describe, test, expect } from "bun:test";
import {
  gridToPixel,
  pixelToGrid,
  areConnected,
  resolveNets,
  ROWS,
} from "../breadboard-grid";
import type { BoardComponent, Wire } from "@dreamer/schemas";

describe("gridToPixel / pixelToGrid roundtrip", () => {
  test("terminal left side roundtrips", () => {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col <= 4; col++) {
        const pixel = gridToPixel({ row, col });
        const grid = pixelToGrid(pixel.x, pixel.y);
        expect(grid).toEqual({ row, col });
      }
    }
  });

  test("terminal right side roundtrips", () => {
    for (let row = 0; row < 10; row++) {
      for (let col = 5; col <= 9; col++) {
        const pixel = gridToPixel({ row, col });
        const grid = pixelToGrid(pixel.x, pixel.y);
        expect(grid).toEqual({ row, col });
      }
    }
  });

  test("last row roundtrips", () => {
    const pixel = gridToPixel({ row: ROWS - 1, col: 0 });
    const grid = pixelToGrid(pixel.x, pixel.y);
    expect(grid).toEqual({ row: ROWS - 1, col: 0 });
  });
});

describe("areConnected", () => {
  test("same row, same side (left) are connected", () => {
    expect(areConnected({ row: 5, col: 0 }, { row: 5, col: 4 })).toBe(true);
    expect(areConnected({ row: 5, col: 1 }, { row: 5, col: 3 })).toBe(true);
  });

  test("same row, same side (right) are connected", () => {
    expect(areConnected({ row: 5, col: 5 }, { row: 5, col: 9 })).toBe(true);
  });

  test("same row, different sides are NOT connected", () => {
    expect(areConnected({ row: 5, col: 4 }, { row: 5, col: 5 })).toBe(false);
  });

  test("different rows, same side are NOT connected", () => {
    expect(areConnected({ row: 5, col: 0 }, { row: 6, col: 0 })).toBe(false);
  });

  test("same power rail points are connected", () => {
    expect(areConnected({ row: 0, col: -2 }, { row: ROWS - 1, col: -2 })).toBe(true);
  });

  test("different power rails are NOT connected", () => {
    expect(areConnected({ row: 0, col: -2 }, { row: 0, col: -1 })).toBe(false);
  });
});

describe("resolveNets", () => {
  test("wire connects two rows into same net", () => {
    const wire: Wire = {
      id: "w1",
      fromRow: 5,
      fromCol: 0,
      toRow: 10,
      toCol: 0,
      color: "#ff0000",
    };
    const comp: BoardComponent = {
      id: "led1",
      type: "led",
      name: "LED",
      x: 0,
      y: 5,
      rotation: 0,
      pins: { anode: 13 },
      properties: {},
    };
    const nets = resolveNets({ led1: comp }, { w1: wire });
    const net = nets.find((n) => n.arduinoPins.includes(13));
    expect(net).toBeDefined();
  });

  test("disconnected components are in separate nets", () => {
    const comp1: BoardComponent = {
      id: "led1",
      type: "led",
      name: "LED1",
      x: 0,
      y: 5,
      rotation: 0,
      pins: { anode: 13 },
      properties: {},
    };
    const comp2: BoardComponent = {
      id: "led2",
      type: "led",
      name: "LED2",
      x: 0,
      y: 20,
      rotation: 0,
      pins: { anode: 12 },
      properties: {},
    };
    const nets = resolveNets({ led1: comp1, led2: comp2 }, {});
    const net13 = nets.find((n) => n.arduinoPins.includes(13));
    const net12 = nets.find((n) => n.arduinoPins.includes(12));
    expect(net13).toBeDefined();
    expect(net12).toBeDefined();
    // They should NOT be in the same net
    if (net13 && net12) {
      expect(net13.id).not.toBe(net12.id);
    }
  });
});
