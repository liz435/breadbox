import { useMemo } from "react";
import {
  DEFAULT_BOARD_TARGET,
  formatArduinoPin,
  isArduinoSignalPin,
  isBoardComponentType,
  resolveComponentPins,
  type BoardComponent,
  type BoardState,
  type ComponentType,
} from "@dreamer/schemas";
import { useBoard } from "@/store/board-context";
import {
  componentSurfaceBoardId,
  terminalAddressKey,
  type Net,
} from "@/breadboard/breadboard-grid";
import { compileElectricalTopology } from "@/simulator/electrical-topology";
import { compileElectricalErc } from "@dreamer/board-domain";

type ElectricalIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  componentId?: string;
  pin?: number;
};

type ElectricalRecommendation = {
  code: string;
  message: string;
};

export type ElectricalReport = {
  estimatedTotalCurrentMa: number;
  pinLoads: Array<{ pin: number; currentMa: number; componentIds: string[] }>;
  railLoads: Array<{ rail: "5V" | "3V3" | "GND" | "external"; currentMa: number; componentIds: string[] }>;
  issues: ElectricalIssue[];
  recommendations: ElectricalRecommendation[];
  hasErrors: boolean;
};

type Point = { row: number; col: number };

type ComponentProfile = {
  signalPinCurrentMa: number;
  railCurrentMa: number;
  mustUseExternalPower: boolean;
};

const PROFILE_DEFAULT: ComponentProfile = {
  signalPinCurrentMa: 0,
  railCurrentMa: 0,
  mustUseExternalPower: false,
};

const COMPONENT_PROFILES: Partial<Record<ComponentType, ComponentProfile>> = {
  led: { signalPinCurrentMa: 10, railCurrentMa: 10, mustUseExternalPower: false },
  rgb_led: { signalPinCurrentMa: 20, railCurrentMa: 30, mustUseExternalPower: false },
  servo: { signalPinCurrentMa: 2, railCurrentMa: 180, mustUseExternalPower: true },
  relay: { signalPinCurrentMa: 2, railCurrentMa: 70, mustUseExternalPower: true },
  dc_motor: { signalPinCurrentMa: 2, railCurrentMa: 250, mustUseExternalPower: true },
  neopixel: { signalPinCurrentMa: 2, railCurrentMa: 60, mustUseExternalPower: true },
  buzzer: { signalPinCurrentMa: 20, railCurrentMa: 25, mustUseExternalPower: false },
  seven_segment: { signalPinCurrentMa: 10, railCurrentMa: 0, mustUseExternalPower: false },
};

const UNO_LIMITS = {
  pinCurrentLimitMa: 20,
  totalCurrentLimitMa: 200,
  rail5vLimitMa: 200,
  rail3v3LimitMa: 50,
};

/** Component terminals come from the same resolver as schematic and SPICE. */
function componentPinPoints(component: BoardComponent): Record<string, Point> {
  return resolveComponentPins(
    component.type,
    component.y,
    component.x,
    component.properties,
  )
}

function powerSupplyPositivePoints(component: BoardComponent): Point[] {
  // Legacy model: treat component (x,y) as positive anchor.
  // MB102 model: positive rails on cols -1 and 11 (per isPositiveRailCol —
  // each pair reads − then + left to right) on rows y/y+1.
  return [
    { row: component.y, col: component.x },
    { row: component.y + 1, col: component.x },
    { row: component.y, col: -1 },
    { row: component.y + 1, col: -1 },
    { row: component.y, col: 11 },
    { row: component.y + 1, col: 11 },
  ];
}

function powerSupplyNegativePoints(component: BoardComponent): Point[] {
  // Negative rails sit on cols -2 and 10 (the first column of each pair).
  return [
    { row: component.y + 1, col: component.x },
    { row: component.y, col: -2 },
    { row: component.y + 1, col: -2 },
    { row: component.y, col: 10 },
    { row: component.y + 1, col: 10 },
  ];
}

function signalPins(component: BoardComponent): string[] {
  if (component.type === "seven_segment") return ["a", "b", "c", "d", "e", "f", "g", "dp"];
  if (component.type === "led") return ["anode"];
  if (component.type === "rgb_led") return ["red", "green", "blue"];
  if (component.type === "servo") return ["signal"];
  if (component.type === "buzzer") return ["positive"];
  if (component.type === "neopixel") return ["din", "signal"];
  if (component.type === "lcd_16x2") return ["rs", "en", "d4", "d5", "d6", "d7"];
  return ["signal", "vout", "data", "din"];
}

function powerPins(component: BoardComponent): string[] {
  if (component.type === "servo") return ["vcc"];
  if (component.type === "potentiometer") return ["vcc"];
  if (component.type === "temperature_sensor") return ["vcc"];
  if (component.type === "buzzer") return ["positive"];
  if (component.type === "dc_motor" || component.type === "relay") return ["vcc", "signal"];
  if (component.type === "neopixel") return ["vcc"];
  if (component.type === "lcd_16x2") return ["vdd", "a"];
  if (component.type === "led" || component.type === "rgb_led") return ["anode", "common"];
  return ["power", "vcc", "positive"];
}

function groundPins(component: BoardComponent): string[] {
  if (component.type === "seven_segment") return ["gnd"];
  if (component.type === "servo") return ["gnd"];
  if (component.type === "potentiometer") return ["gnd"];
  if (component.type === "temperature_sensor") return ["gnd"];
  if (component.type === "buzzer") return ["negative"];
  if (component.type === "lcd_16x2") return ["vss", "k"];
  if (component.type === "led") return ["cathode"];
  if (component.type === "rgb_led") return ["common"];
  return ["gnd", "ground", "negative"];
}

function addLoad(
  map: Map<string, { currentMa: number; componentIds: Set<string> }>,
  key: string,
  currentMa: number,
  componentId: string,
) {
  if (!map.has(key)) map.set(key, { currentMa: 0, componentIds: new Set<string>() });
  const bucket = map.get(key)!;
  bucket.currentMa += currentMa;
  bucket.componentIds.add(componentId);
}

function netHasGroundRail(nets: Net[], netId: string): boolean {
  const net = nets.find((candidate) => candidate.id === netId)
  return net?.points.some((point) => point.col === -2 || point.col === 10) ?? false
}

function netHasPowerRail(nets: Net[], netId: string): boolean {
  const net = nets.find((candidate) => candidate.id === netId)
  return net?.points.some((point) => point.col === -1 || point.col === 11) ?? false
}

export function analyzeElectricalBoard(board: BoardState): ElectricalReport {
  const boardTarget = board.boardTarget ?? DEFAULT_BOARD_TARGET;
  const issues: ElectricalIssue[] = [];
  const recommendations = new Map<string, string>();
  const topology = compileElectricalTopology(board.components, board.wires);
  const nets = topology.nets;
  for (const issue of compileElectricalErc(board)) {
    issues.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      componentId: issue.componentId,
    });
  }
  const netIdAt = (component: BoardComponent, point: Point): string => {
    const boardId = componentSurfaceBoardId(component, board.components);
    const addressKey = terminalAddressKey({ ...point, boardId });
    return nets.find((net) => net.points.some((candidate) => terminalAddressKey(candidate) === addressKey))?.id
      ?? `unconnected:${addressKey}`;
  };
  const arduinoPinsByNet = new Map<string, Set<number>>(
    nets
      .filter((net) => net.arduinoPins.length > 0)
      .map((net) => [net.id, new Set(net.arduinoPins)]),
  );

  const pinLoads = new Map<string, { currentMa: number; componentIds: Set<string> }>();
  const railLoads = new Map<string, { currentMa: number; componentIds: Set<string> }>();
  const components = Object.values(board.components).filter((c) => !isBoardComponentType(c.type));
  const hasSupply = components.some((c) => c.type === "power_supply");

  for (const component of components) {
    const profile = COMPONENT_PROFILES[component.type as ComponentType] ?? PROFILE_DEFAULT;
    const pins = componentPinPoints(component);

    for (const signalPin of signalPins(component)) {
      const point = pins[signalPin];
      if (!point) continue;
      const net = netIdAt(component, point);
      const connectedPins = arduinoPinsByNet.get(net) ?? new Set<number>();
      for (const pin of connectedPins) {
        if (isArduinoSignalPin(pin)) addLoad(pinLoads, String(pin), profile.signalPinCurrentMa, component.id);
      }
    }

    let from5v = false;
    let from3v3 = false;
    let fromExternal = false;
    let hasGround = false;
    for (const p of powerPins(component)) {
      const point = pins[p];
      if (!point) continue;
      const net = netIdAt(component, point);
      const connectedPins = arduinoPinsByNet.get(net) ?? new Set<number>();
      if (connectedPins.has(-1)) from5v = true;
      if (connectedPins.has(-2)) from3v3 = true;
      if (!fromExternal) {
        for (const other of components) {
          if (other.type !== "power_supply") continue;
          const positivePoints = powerSupplyPositivePoints(other);
          if (positivePoints.some((pos) => netIdAt(other, pos) === net)) {
            fromExternal = true;
            break;
          }
        }
      }
    }

    for (const gp of groundPins(component)) {
      const point = pins[gp];
      if (!point) continue;
      const net = netIdAt(component, point);
      const connectedPins = arduinoPinsByNet.get(net) ?? new Set<number>();
      if (connectedPins.has(-3) || connectedPins.has(-4) || connectedPins.has(-6)) {
        hasGround = true;
      }
      if (!hasGround) {
        for (const other of components) {
          if (other.type !== "power_supply") continue;
          const negativePoints = powerSupplyNegativePoints(other);
          if (negativePoints.some((pos) => netIdAt(other, pos) === net)) {
            hasGround = true;
            break;
          }
        }
      }
    }

    if (profile.railCurrentMa > 0) {
      if (from5v) addLoad(railLoads, "5V", profile.railCurrentMa, component.id);
      if (from3v3) addLoad(railLoads, "3V3", profile.railCurrentMa, component.id);
      if (fromExternal) addLoad(railLoads, "external", profile.railCurrentMa, component.id);
    }

    if (profile.mustUseExternalPower && !fromExternal) {
      issues.push({
        severity: "error",
        code: "EXTERNAL_POWER_REQUIRED",
        componentId: component.id,
        message: `${component.name} (${component.type}) should use external power with common ground.`,
      });
      recommendations.set(
        "add_external_supply",
        "Add a power_supply and wire load power from it; tie external negative to Arduino GND."
      );
    }
    if (profile.mustUseExternalPower && from5v) {
      issues.push({
        severity: "error",
        code: "HIGH_CURRENT_ON_ARDUINO_5V",
        componentId: component.id,
        message: `${component.name} (${component.type}) appears powered from Arduino 5V.`,
      });
    }

    if (component.type === "lcd_16x2") {
      const hasAnySignalConnection = signalPins(component).some((sp) => {
        const point = pins[sp];
        if (!point) return false;
        const net = netIdAt(component, point);
        const connectedPins = arduinoPinsByNet.get(net) ?? new Set<number>();
        return [...connectedPins].some((pin) => isArduinoSignalPin(pin));
      });
      const isEffectivelyUsed = hasAnySignalConnection || from5v || from3v3 || fromExternal || hasGround;
      if (isEffectivelyUsed) {
        if (!(from5v || from3v3 || fromExternal)) {
          issues.push({
            severity: "error",
            code: "LCD_POWER_MISSING",
            componentId: component.id,
            message: `${component.name} (lcd_16x2) is wired for control but has no VDD power connection.`,
          });
        }
        if (!hasGround) {
          issues.push({
            severity: "error",
            code: "LCD_GROUND_MISSING",
            componentId: component.id,
            message: `${component.name} (lcd_16x2) is wired for control but has no ground (VSS/K) connection.`,
          });
        }
      }
    }

    if (component.type === "button") {
      const sideA = pins.a;
      const sideB = pins.b;
      if (sideA && sideB) {
        const netA = netIdAt(component, sideA);
        const netB = netIdAt(component, sideB);
        const pinsA = arduinoPinsByNet.get(netA) ?? new Set<number>();
        const pinsB = arduinoPinsByNet.get(netB) ?? new Set<number>();
        const sideAHasSignal = [...pinsA].some((pin) => isArduinoSignalPin(pin));
        const sideBHasSignal = [...pinsB].some((pin) => isArduinoSignalPin(pin));

        if (sideAHasSignal && sideBHasSignal) {
          issues.push({
            severity: "error",
            code: "BUTTON_SIGNAL_BOTH_SIDES",
            componentId: component.id,
            message: `${component.name} (button) has Arduino signal wires on both sides. Use one side for input and the opposite side for power/ground reference.`,
          });
        } else if (sideAHasSignal || sideBHasSignal) {
          const refPins = sideAHasSignal ? pinsB : pinsA;
          const refNet = sideAHasSignal ? netB : netA;
          const hasGroundRef =
            [...refPins].some((pin) => pin === -3 || pin === -4 || pin === -6) ||
            netHasGroundRail(nets, refNet);
          const hasPowerRef =
            [...refPins].some((pin) => pin === -1 || pin === -2) ||
            netHasPowerRail(nets, refNet);

          if (!hasGroundRef && !hasPowerRef) {
            issues.push({
              severity: "error",
              code: "BUTTON_REFERENCE_MISSING",
              componentId: component.id,
              message: `${component.name} (button) input has no opposite-side reference. Wire the other side to GND (for INPUT_PULLUP) or 5V/3V3 (for INPUT).`,
            });
          }
        }
      }
    }
  }

  const hasLcd = components.some((c) => c.type === "lcd_16x2");
  if (hasLcd) {
    const lcdCandidateResistors = components.filter(
      (c) => {
        if (c.type !== "resistor") return false;
        const normalized = c.name.toLowerCase().replace(/[_-]+/g, " ");
        return /(lcd|contrast|backlight|\bvo\b|\brw\b|\brs\b|\ba\b|\bk\b)/i.test(normalized);
      },
    );
    for (const resistor of lcdCandidateResistors) {
      const leadA = { row: resistor.y, col: resistor.x };
      const leadB = { row: resistor.y, col: resistor.x + 4 };
      const hasLeadWire = Object.values(board.wires).some(
        (wire) =>
          (wire.toRow === leadA.row && wire.toCol === leadA.col) ||
          (wire.fromRow !== -999 && wire.fromRow === leadA.row && wire.fromCol === leadA.col) ||
          (wire.toRow === leadB.row && wire.toCol === leadB.col) ||
          (wire.fromRow !== -999 && wire.fromRow === leadB.row && wire.fromCol === leadB.col),
      );
      if (!hasLeadWire) {
        issues.push({
          severity: "error",
          code: "LCD_RESISTOR_UNCONNECTED",
          componentId: resistor.id,
          message: `${resistor.name} (resistor) looks LCD-related but neither lead is wired.`,
        });
      }
    }
  }

  for (const [key, value] of pinLoads.entries()) {
    const pin = Number(key);
    if (value.currentMa > UNO_LIMITS.pinCurrentLimitMa) {
      issues.push({
        severity: "error",
        code: "PIN_OVERCURRENT",
        pin,
        message: `${formatArduinoPin(pin, boardTarget)} estimated at ${value.currentMa.toFixed(1)}mA (limit ${UNO_LIMITS.pinCurrentLimitMa}mA).`,
      });
      recommendations.set("use_driver", "Use transistor/MOSFET drivers for high-current loads.");
    } else if (value.currentMa > UNO_LIMITS.pinCurrentLimitMa * 0.75) {
      issues.push({
        severity: "warning",
        code: "PIN_NEAR_LIMIT",
        pin,
        message: `${formatArduinoPin(pin, boardTarget)} is near current limit (${value.currentMa.toFixed(1)}mA).`,
      });
    }
  }

  const rail5v = railLoads.get("5V")?.currentMa ?? 0;
  const rail3v3 = railLoads.get("3V3")?.currentMa ?? 0;
  const total = rail5v + rail3v3;
  if (rail5v > UNO_LIMITS.rail5vLimitMa) {
    issues.push({
      severity: "error",
      code: "RAIL_OVERCURRENT_5V",
      message: `5V rail estimated at ${rail5v.toFixed(1)}mA (limit ${UNO_LIMITS.rail5vLimitMa}mA).`,
    });
  }
  if (rail3v3 > UNO_LIMITS.rail3v3LimitMa) {
    issues.push({
      severity: "error",
      code: "RAIL_OVERCURRENT_3V3",
      message: `3V3 rail estimated at ${rail3v3.toFixed(1)}mA (limit ${UNO_LIMITS.rail3v3LimitMa}mA).`,
    });
  }
  if (total > UNO_LIMITS.totalCurrentLimitMa) {
    issues.push({
      severity: "error",
      code: "BOARD_TOTAL_OVERCURRENT",
      message: `Total estimated draw is ${total.toFixed(1)}mA (limit ${UNO_LIMITS.totalCurrentLimitMa}mA).`,
    });
  }

  if (!hasSupply && components.some((c) => (COMPONENT_PROFILES[c.type as ComponentType]?.mustUseExternalPower))) {
    recommendations.set(
      "missing_supply_component",
      "Add a power_supply component for servo/motor/relay/high LED count circuits."
    );
  }

  return {
    estimatedTotalCurrentMa: Number(total.toFixed(2)),
    pinLoads: [...pinLoads.entries()].map(([pin, v]) => ({
      pin: Number(pin),
      currentMa: Number(v.currentMa.toFixed(2)),
      componentIds: [...v.componentIds.values()],
    })).sort((a, b) => a.pin - b.pin),
    railLoads: [...railLoads.entries()].map(([rail, v]) => ({
      rail: rail as "5V" | "3V3" | "GND" | "external",
      currentMa: Number(v.currentMa.toFixed(2)),
      componentIds: [...v.componentIds.values()],
    })).sort((a, b) => a.rail.localeCompare(b.rail)),
    issues,
    recommendations: [...recommendations.entries()].map(([code, message]) => ({ code, message })),
    hasErrors: issues.some((i) => i.severity === "error"),
  };
}

export function useElectricalReport(): ElectricalReport {
  const { state } = useBoard();
  return useMemo(
    () =>
      analyzeElectricalBoard({
        components: state.components,
        wires: state.wires,
        libraryState: state.libraryState,
        serialOutput: state.serialOutput,
        sketchCode: state.sketchCode,
        customLibraries: state.customLibraries,
        environment: state.environment,
      }),
    [
      state.components,
      state.wires,
      state.libraryState,
      state.serialOutput,
      state.sketchCode,
      state.customLibraries,
    ],
  );
}
