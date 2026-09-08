import { describe, expect, test } from "bun:test";
import { createDefaultBoardState, type BoardComponent } from "@dreamer/schemas";
import {
  compileElectricalTopology,
  electricalTerminalKey,
} from "./topology";

function resistor(id: string, parentId?: string): BoardComponent {
  return {
    id,
    type: "resistor",
    name: id,
    x: 0,
    y: 5,
    rotation: 0,
    pins: { a: null, b: null },
    properties: { resistance: 220 },
    parentId,
  };
}

describe("board-domain electrical topology", () => {
  test("keeps a component's named terminals on the same manually shorted net", () => {
    const board = createDefaultBoardState();
    board.components.r1 = resistor("r1", "breadboard-1");
    board.wires.short = {
      id: "short",
      fromRow: 5,
      fromCol: 3,
      toRow: 5,
      toCol: 6,
      color: "black",
    };

    const topology = compileElectricalTopology(board);
    const a = topology.terminalToNet.get(electricalTerminalKey("r1", "a"));
    const b = topology.terminalToNet.get(electricalTerminalKey("r1", "b"));
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  test("does not merge identical row/column coordinates across surface boards", () => {
    const board = createDefaultBoardState();
    board.components["breadboard-2"] = {
      id: "breadboard-2",
      type: "breadboard_full",
      name: "Breadboard 2",
      x: 600,
      y: 0,
      rotation: 0,
      pins: {},
      properties: {},
    };
    board.components.r1 = resistor("r1", "breadboard-1");
    board.components.r2 = resistor("r2", "breadboard-2");

    const topology = compileElectricalTopology(board);
    expect(topology.terminalToNet.get(electricalTerminalKey("r1", "a")))
      .not.toBe(topology.terminalToNet.get(electricalTerminalKey("r2", "a")));
  });
});
