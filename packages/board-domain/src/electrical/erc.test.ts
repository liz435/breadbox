import { describe, expect, test } from "bun:test";
import { runElectricalErc } from "./erc";

describe("shared electrical ERC", () => {
  test("reports an unconnected required terminal", () => {
    const issues = runElectricalErc({
      terminals: [{ terminalId: "servo:vcc", componentId: "servo", pinName: "vcc", netId: null, required: true }],
    });
    expect(issues[0]?.code).toBe("missing_required_terminal");
    expect(issues[0]?.severity).toBe("error");
  });

  test("reports incompatible sources on one net but ignores duplicate aliases", () => {
    const issues = runElectricalErc({
      terminals: [],
      sources: [
        { sourceId: "arduino:5V", label: "Arduino 5V", netId: "net-1", voltage: 5 },
        { sourceId: "arduino:5V", label: "Arduino 5V alias", netId: "net-1", voltage: 5 },
        { sourceId: "arduino:3V3", label: "Arduino 3V3", netId: "net-1", voltage: 3.3 },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("conflicting_power_sources");
  });

  test("reports a terminal voltage range violation", () => {
    const issues = runElectricalErc({
      terminals: [{
        terminalId: "servo:vcc",
        componentId: "servo",
        pinName: "vcc",
        netId: "net-5v",
        voltageRange: { min: 4.8, max: 6 },
      }],
      sources: [{ sourceId: "pico:3v3", label: "Pico 3.3V", netId: "net-5v", voltage: 3.3 }],
    });
    expect(issues.map((issue) => issue.code)).toEqual(["voltage_out_of_range"]);
  });

  test("reports multiple push-pull outputs even when their voltage matches", () => {
    const issues = runElectricalErc({
      terminals: [],
      sources: [
        { sourceId: "gpio:12", label: "GPIO12", netId: "signal", voltage: 5, kind: "signal", drive: "push-pull" },
        { sourceId: "gpio:13", label: "GPIO13", netId: "signal", voltage: 5, kind: "signal", drive: "push-pull" },
      ],
    });
    expect(issues.map((issue) => issue.code)).toEqual(["output_conflict"]);
  });

  test("allows an open-drain bus and tri-stated source to share a net", () => {
    const issues = runElectricalErc({
      terminals: [],
      sources: [
        { sourceId: "i2c:a", label: "I2C A", netId: "sda", voltage: 3.3, kind: "signal", drive: "open-drain" },
        { sourceId: "i2c:b", label: "I2C B", netId: "sda", voltage: 3.3, kind: "signal", drive: "tri-state" },
      ],
    });
    expect(issues).toEqual([]);
  });
});
