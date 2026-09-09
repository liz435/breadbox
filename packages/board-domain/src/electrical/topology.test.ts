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
  test("resolves terminal-strip connectivity across all 63 board rows", () => {
    const board = createDefaultBoardState();
    board.components.servo = {
      id: "servo",
      type: "servo",
      name: "Servo",
      x: 2,
      y: 37,
      rotation: 0,
      pins: { signal: null, vcc: null, gnd: null },
      properties: {},
    };
    board.wires.signal = {
      id: "signal",
      fromRow: -999,
      fromCol: 9,
      toRow: 37,
      toCol: 0,
      color: "orange",
    };

    const topology = compileElectricalTopology(board);
    const signalNetId = topology.terminalToNet.get(electricalTerminalKey("servo", "signal"));
    expect(signalNetId).toBeDefined();
    expect(topology.nets.find((net) => net.id === signalNetId)?.arduinoPins).toContain(9);
  });

  test("merges PSU semantic anchors with the physical rail pads", () => {
    const board = createDefaultBoardState();
    board.components.psu = {
      id: "psu",
      type: "power_supply",
      name: "External 5V",
      x: 8,
      y: 9,
      rotation: 0,
      pins: {},
      properties: { leftVoltage: 5, rightVoltage: 5 },
    };
    board.components.servo = {
      id: "servo",
      type: "servo",
      name: "Servo",
      x: 2,
      y: 4,
      rotation: 0,
      pins: { signal: null, vcc: null, gnd: null },
      properties: {},
    };
    board.wires.vcc = {
      id: "vcc",
      fromRow: 9,
      fromCol: 8,
      toRow: 5,
      toCol: 2,
      color: "red",
    };

    const topology = compileElectricalTopology(board);
    const vccNet = topology.terminalToNet.get(electricalTerminalKey("servo", "vcc"));
    const psuPositive = topology.terminalToNet.get(electricalTerminalKey("psu", "positive"));
    const psuRailPositive = topology.terminalToNet.get(electricalTerminalKey("psu", "leftPositive"));
    expect(vccNet).toBeDefined();
    expect(psuPositive).toBe(vccNet);
    expect(psuRailPositive).toBe(vccNet);
  });

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
