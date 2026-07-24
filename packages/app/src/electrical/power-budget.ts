import { useMemo } from "react";
import {
  DEFAULT_BOARD_TARGET,
  formatArduinoPin,
  isArduinoSignalPin,
  isBoardComponentType,
  type BoardComponent,
  type BoardState,
  type ComponentType,
} from "@dreamer/schemas";
import { useBoard } from "@/store/board-context";

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

class DisjointSet {
  private readonly parent = new Map<string, string>();

  private make(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.make(key);
    let root = this.parent.get(key)!;
    while (root !== this.parent.get(root)!) root = this.parent.get(root)!;
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function keyGrid(point: Point): string {
  return `g:${point.row}:${point.col}`;
}

function keyArduino(pin: number): string {
  return `a:${pin}`;
}

function componentPinPoints(component: BoardComponent): Record<string, Point> {
  const x = component.x;
  const y = component.y;
  switch (component.type) {
    case "led":
      return { anode: { row: y, col: x }, cathode: { row: y + 1, col: x } };
    case "rgb_led":
      return {
        red: { row: y, col: x },
        green: { row: y + 1, col: x },
        blue: { row: y + 2, col: x },
        common: { row: y + 3, col: x },
      };
    case "resistor":
      return { a: { row: y, col: x }, b: { row: y, col: x + 4 } };
    case "button":
      return { a: { row: y, col: x }, b: { row: y, col: x + 3 } };
    case "servo":
      return { signal: { row: y, col: x }, vcc: { row: y + 1, col: x }, gnd: { row: y + 2, col: x } };
    case "potentiometer":
      return { vcc: { row: y, col: x }, signal: { row: y + 1, col: x }, gnd: { row: y + 2, col: x } };
    case "temperature_sensor":
      return { power: { row: y, col: x }, vout: { row: y + 1, col: x }, ground: { row: y + 2, col: x } };
    case "buzzer":
      return { positive: { row: y, col: x }, negative: { row: y + 1, col: x } };
    case "power_supply":
      return { positive: { row: y, col: x }, negative: { row: y + 1, col: x } };
    case "lcd_16x2":
      return {
        vss: { row: y + 0, col: x },
        vdd: { row: y + 1, col: x },
        vo: { row: y + 2, col: x },
        rs: { row: y + 3, col: x },
        rw: { row: y + 4, col: x },
        e: { row: y + 5, col: x },
        d4: { row: y + 6, col: x },
        d5: { row: y + 7, col: x },
        d6: { row: y + 8, col: x },
        d7: { row: y + 9, col: x },
        a: { row: y + 10, col: x },
        k: { row: y + 11, col: x },
      };
    case "relay":
      return {
        vcc: { row: y + 0, col: x },
        signal: { row: y + 1, col: x },
        gnd: { row: y + 2, col: x },
      };
    case "dc_motor":
      return {
        vcc: { row: y + 0, col: x },
        signal: { row: y + 1, col: x },
      };
    case "neopixel":
      return {
        signal: { row: y + 0, col: x },
        vcc: { row: y + 1, col: x },
        gnd: { row: y + 2, col: x },
      };
    case "seven_segment":
      return {
        a: { row: y + 0, col: x },
        b: { row: y + 1, col: x },
        c: { row: y + 2, col: x },
        d: { row: y + 3, col: x },
        e: { row: y + 4, col: x },
        f: { row: y + 5, col: x },
        g: { row: y + 6, col: x },
        dp: { row: y + 7, col: x },
        gnd: { row: y + 8, col: x },
      };
    default:
      return { signal: { row: y, col: x } };
  }
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
  if (component.type === "lcd_16x2") return ["rs", "e", "d4", "d5", "d6", "d7"];
  return ["signal", "vout", "data", "din"];
}

function powerPins(component: BoardComponent): string[] {
  if (component.type === "servo") return ["vcc"];
  if (component.type === "potentiometer") return ["vcc"];
  if (component.type === "temperature_sensor") return ["power"];
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
  if (component.type === "temperature_sensor") return ["ground"];
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

function netHasGroundRail(ds: DisjointSet, net: string): boolean {
  // Ground rails are cols -2 and 10 (first column of each pair).
  for (let row = 0; row < 30; row++) {
    if (ds.find(keyGrid({ row, col: -2 })) === net) return true;
    if (ds.find(keyGrid({ row, col: 10 })) === net) return true;
  }
  return false;
}

function netHasPowerRail(ds: DisjointSet, net: string): boolean {
  // Power (+) rails are cols -1 and 11 (second column of each pair).
  for (let row = 0; row < 30; row++) {
    if (ds.find(keyGrid({ row, col: -1 })) === net) return true;
    if (ds.find(keyGrid({ row, col: 11 })) === net) return true;
  }
  return false;
}

function connectBreadboardBuses(ds: DisjointSet) {
  for (let row = 0; row < 30; row++) {
    const left = [0, 1, 2, 3, 4].map((col) => keyGrid({ row, col }));
    const right = [5, 6, 7, 8, 9].map((col) => keyGrid({ row, col }));
    for (let i = 1; i < left.length; i++) ds.union(left[0]!, left[i]!);
    for (let i = 1; i < right.length; i++) ds.union(right[0]!, right[i]!);
  }

  // Power rails are vertically continuous across rows.
  for (let row = 1; row < 30; row++) {
    ds.union(keyGrid({ row: 0, col: -2 }), keyGrid({ row, col: -2 }));
    ds.union(keyGrid({ row: 0, col: -1 }), keyGrid({ row, col: -1 }));
    ds.union(keyGrid({ row: 0, col: 10 }), keyGrid({ row, col: 10 }));
    ds.union(keyGrid({ row: 0, col: 11 }), keyGrid({ row, col: 11 }));
  }
}

// TODO(multi-board-resolver): traces nets via the single-board resolver, so
// power-rail islands across multiple surface boards (Q16 — intentionally
// not auto-bridged) are misreported: a load on breadboard-2 may appear
// connected to breadboard-1's 5V rail because their (row, col) coincide.
// power-budget-guard (the project skill) is the natural lint surface for
// rail-island warnings once the resolver is board-aware.
export function analyzeElectricalBoard(board: BoardState): ElectricalReport {
  const boardTarget = board.boardTarget ?? DEFAULT_BOARD_TARGET;
  const issues: ElectricalIssue[] = [];
  const recommendations = new Map<string, string>();
  const ds = new DisjointSet();
  connectBreadboardBuses(ds);

  for (const wire of Object.values(board.wires)) {
    const from = wire.fromRow === -999
      ? keyArduino(wire.fromCol)
      : keyGrid({ row: wire.fromRow, col: wire.fromCol });
    const to = keyGrid({ row: wire.toRow, col: wire.toCol });
    ds.union(from, to);
  }

  const arduinoPinsByNet = new Map<string, Set<number>>();
  for (const wire of Object.values(board.wires)) {
    if (wire.fromRow !== -999) continue;
    const net = ds.find(keyArduino(wire.fromCol));
    if (!arduinoPinsByNet.has(net)) arduinoPinsByNet.set(net, new Set<number>());
    arduinoPinsByNet.get(net)!.add(wire.fromCol);
  }

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
      const net = ds.find(keyGrid(point));
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
      const net = ds.find(keyGrid(point));
      const connectedPins = arduinoPinsByNet.get(net) ?? new Set<number>();
      if (connectedPins.has(-1)) from5v = true;
      if (connectedPins.has(-2)) from3v3 = true;
      if (!fromExternal) {
        for (const other of components) {
          if (other.type !== "power_supply") continue;
          const positivePoints = powerSupplyPositivePoints(other);
          if (positivePoints.some((pos) => ds.find(keyGrid(pos)) === net)) {
            fromExternal = true;
            break;
          }
        }
      }
    }

    for (const gp of groundPins(component)) {
      const point = pins[gp];
      if (!point) continue;
      const net = ds.find(keyGrid(point));
      const connectedPins = arduinoPinsByNet.get(net) ?? new Set<number>();
      if (connectedPins.has(-3) || connectedPins.has(-4) || connectedPins.has(-6)) {
        hasGround = true;
      }
      if (!hasGround) {
        for (const other of components) {
          if (other.type !== "power_supply") continue;
          const negativePoints = powerSupplyNegativePoints(other);
          if (negativePoints.some((pos) => ds.find(keyGrid(pos)) === net)) {
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
        const net = ds.find(keyGrid(point));
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
        const netA = ds.find(keyGrid(sideA));
        const netB = ds.find(keyGrid(sideB));
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
            netHasGroundRail(ds, refNet);
          const hasPowerRef =
            [...refPins].some((pin) => pin === -1 || pin === -2) ||
            netHasPowerRail(ds, refNet);

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
