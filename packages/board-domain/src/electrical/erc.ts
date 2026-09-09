import type { BoardState, CustomFootprintLookup } from "@dreamer/schemas";
import { compileElectricalTopology } from "./topology";

export type ElectricalErcTerminal = {
  terminalId: string;
  componentId: string;
  pinName: string;
  netId: string | null;
  required?: boolean;
  role?: "power" | "ground" | "input" | "output" | "passive";
  voltageRange?: { min: number; max: number };
};

export type ElectricalErcSource = {
  sourceId: string;
  label: string;
  netId: string;
  voltage: number;
  kind?: "power" | "signal";
  drive?: "push-pull" | "open-drain" | "tri-state";
};

export type ElectricalErcIssue = {
  code:
    | "missing_required_terminal"
    | "conflicting_power_sources"
    | "voltage_out_of_range"
    | "output_conflict";
  severity: "error" | "warning";
  message: string;
  componentId?: string;
  terminalId?: string;
  netId?: string;
};

export type ElectricalErcInput = {
  terminals: readonly ElectricalErcTerminal[];
  sources?: readonly ElectricalErcSource[];
};

const REQUIRED_POWER_TERMINALS: Record<string, readonly string[]> = {
  servo: ["vcc", "gnd"],
  relay: ["vcc", "gnd"],
  dc_motor: ["vcc"],
  stepper_motor: ["vplus", "gnd"],
  neopixel: ["vcc", "gnd"],
  dht_sensor: ["vcc", "gnd"],
  ir_receiver: ["vcc", "gnd"],
  oled_display: ["vcc", "gnd"],
  lcd_16x2: ["vdd", "vss"],
  temperature_sensor: ["vcc", "gnd"],
  ultrasonic_sensor: ["vcc", "gnd"],
  pir_sensor: ["vcc", "gnd"],
};

const SUPPLY_RANGES: Record<string, { min: number; max: number }> = {
  servo: { min: 4.8, max: 6 },
  relay: { min: 4.5, max: 5.5 },
  dc_motor: { min: 3, max: 9 },
  stepper_motor: { min: 4.5, max: 5.5 },
  neopixel: { min: 4.5, max: 5.5 },
  dht_sensor: { min: 3, max: 5.5 },
  ir_receiver: { min: 2.7, max: 5.5 },
  oled_display: { min: 3, max: 5.5 },
  lcd_16x2: { min: 4.5, max: 5.5 },
  temperature_sensor: { min: 2.7, max: 5.5 },
  ultrasonic_sensor: { min: 4.5, max: 5.5 },
  pir_sensor: { min: 4.5, max: 5.5 },
};

/** Shared terminal policy used by browser and API adapters. */
export function defaultElectricalErcTerminalSpec(
  componentType: string,
  pinName: string,
): Pick<ElectricalErcTerminal, "required" | "voltageRange"> {
  const required = REQUIRED_POWER_TERMINALS[componentType]?.includes(pinName) ?? false;
  const range = SUPPLY_RANGES[componentType];
  const isSupply = pinName === "vcc" || pinName === "vplus" || pinName === "vdd";
  return {
    ...(required ? { required: true } : {}),
    ...(range && isSupply ? { voltageRange: range } : {}),
  };
}

/**
 * Compile the board-level ERC input once for every consumer. Browser and API
 * reports may keep different presentation fields, but they must not invent
 * different source/terminal semantics for the same persisted Board.
 */
export function compileElectricalErc(
  board: Pick<BoardState, "components" | "wires">,
  customFootprints?: CustomFootprintLookup,
): ElectricalErcIssue[] {
  const topology = compileElectricalTopology(board, customFootprints);
  const sources: ElectricalErcSource[] = [];
  for (const net of topology.nets) {
    if (net.arduinoPins.some((pin) => pin === -1 || pin === -12)) {
      sources.push({ sourceId: "arduino:5V", label: "Arduino 5V", netId: net.id, voltage: 5, kind: "power" });
    }
    if (net.arduinoPins.includes(-2)) {
      sources.push({ sourceId: "arduino:3V3", label: "Arduino 3.3V", netId: net.id, voltage: 3.3, kind: "power" });
    }
  }
  for (const terminal of topology.terminals) {
    const component = board.components[terminal.componentId];
    if (component?.type !== "power_supply" || terminal.netId == null || !terminal.pinName.toLowerCase().includes("positive")) continue;
    const pinName = terminal.pinName.toLowerCase();
    // The readable `positive` alias is the module's primary left channel (5V
    // by default); explicit rail terminals carry their side in the name.
    const rightSide = pinName.includes("right");
    const side = rightSide ? "rightVoltage" : "leftVoltage";
    const voltage = typeof component.properties?.[side] === "number" ? component.properties[side] as number : side === "leftVoltage" ? 5 : 3.3;
    sources.push({ sourceId: `${component.id}:${side}`, label: `${component.name} ${side}`, netId: terminal.netId, voltage, kind: "power" });
  }
  return runElectricalErc({
    terminals: topology.terminals.map((terminal) => ({
      terminalId: `${terminal.componentId}:${terminal.pinName}`,
      componentId: terminal.componentId,
      pinName: terminal.pinName,
      netId: terminal.netId,
      ...defaultElectricalErcTerminalSpec(componentTypeOf(board, terminal.componentId), terminal.pinName),
    })),
    sources,
  });
}

function componentTypeOf(board: Pick<BoardState, "components">, componentId: string): string {
  return board.components[componentId]?.type ?? "unknown";
}

/**
 * Shared, deterministic ERC rules. Adapters decide how a BoardComponent or a
 * runtime pin state becomes a terminal/source; the rules themselves do not
 * know about React, API DTOs, or a solver.
 */
export function runElectricalErc(input: ElectricalErcInput): ElectricalErcIssue[] {
  const issues: ElectricalErcIssue[] = [];

  for (const terminal of input.terminals) {
    if (terminal.required && terminal.netId == null) {
      issues.push({
        code: "missing_required_terminal",
        severity: "error",
        message: `${terminal.componentId} terminal ${terminal.pinName} is required but not connected`,
        componentId: terminal.componentId,
        terminalId: terminal.terminalId,
      });
    }
  }

  const sourcesByNet = new Map<string, ElectricalErcSource[]>();
  for (const source of input.sources ?? []) {
    const list = sourcesByNet.get(source.netId) ?? [];
    if (!list.some((existing) => existing.sourceId === source.sourceId)) list.push(source);
    sourcesByNet.set(source.netId, list);
  }
  for (const [netId, sources] of sourcesByNet) {
    const voltageClasses = new Map<number, ElectricalErcSource[]>();
    for (const source of sources) {
      const key = Math.round(source.voltage * 1000) / 1000;
      const list = voltageClasses.get(key) ?? [];
      list.push(source);
      voltageClasses.set(key, list);
    }
    if (voltageClasses.size > 1) {
      issues.push({
        code: "conflicting_power_sources",
        severity: "error",
        netId,
        message: `Net ${netId} connects incompatible power sources: ${sources.map((source) => `${source.label} (${source.voltage}V)`).join(", ")}`,
      });
    }

    const pushPullSources = sources.filter((source) => source.drive === "push-pull");
    if (pushPullSources.length > 1) {
      issues.push({
        code: "output_conflict",
        severity: "error",
        netId,
        message: `Net ${netId} has multiple push-pull outputs: ${pushPullSources.map((source) => source.label).join(", ")}`,
      });
    }
  }

  const sourceList = input.sources ?? [];
  for (const terminal of input.terminals) {
    if (!terminal.voltageRange || terminal.netId == null) continue;
    const sources = sourceList.filter((source) => source.netId === terminal.netId);
    const outOfRange = sources.filter((source) =>
      source.voltage < terminal.voltageRange!.min || source.voltage > terminal.voltageRange!.max,
    );
    if (outOfRange.length === 0) continue;
    issues.push({
      code: "voltage_out_of_range",
      severity: "error",
      componentId: terminal.componentId,
      terminalId: terminal.terminalId,
      netId: terminal.netId,
      message: `${terminal.componentId} terminal ${terminal.pinName} accepts ${terminal.voltageRange.min}-${terminal.voltageRange.max}V but is connected to ${outOfRange.map((source) => `${source.label} (${source.voltage}V)`).join(", ")}`,
    });
  }

  return issues;
}
