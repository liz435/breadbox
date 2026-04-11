import type {
  BoardComponent,
  BoardState,
  ComponentType,
  PinLoad,
  PowerBudgetReport,
  PowerIssue,
  RailLoad,
} from "@dreamer/schemas";
import { ARDUINO_UNO_ELECTRICAL_PROFILE } from "./profiles/arduino-uno";
import { getComponentElectricalProfile } from "./profiles/components";

type Point = { row: number; col: number };

class DisjointSet {
  private readonly parent = new Map<string, string>();

  make(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.make(key);
    let root = this.parent.get(key)!;
    while (root !== this.parent.get(root)!) {
      root = this.parent.get(root)!;
    }
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

function keyForGrid(point: Point): string {
  return `g:${point.row}:${point.col}`;
}

function keyForArduinoPin(pin: number): string {
  return `a:${pin}`;
}

function arduinoPinLabel(pin: number): string {
  if (pin === -1) return "5V";
  if (pin === -2) return "3V3";
  if (pin === -3 || pin === -4 || pin === -6) return "GND";
  if (pin >= 14 && pin <= 19) return `A${pin - 14}`;
  return `D${pin}`;
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
      return { a: { row: y, col: x }, b: { row: y + 1, col: x + 3 } };
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
    default:
      return { signal: { row: y, col: x } };
  }
}

function powerSupplyPositivePoints(component: BoardComponent): Point[] {
  // Legacy model: treat component (x,y) as positive pin anchor.
  // MB102 model: positive rails at cols -2 and 11 on rows y/y+1.
  return [
    { row: component.y, col: component.x },
    { row: component.y + 1, col: component.x },
    { row: component.y, col: -2 },
    { row: component.y + 1, col: -2 },
    { row: component.y, col: 11 },
    { row: component.y + 1, col: 11 },
  ];
}

function chooseSignalPins(component: BoardComponent): string[] {
  if (component.type === "led") return ["anode"];
  if (component.type === "rgb_led") return ["red", "green", "blue"];
  if (component.type === "servo") return ["signal"];
  if (component.type === "buzzer") return ["positive"];
  if (component.type === "relay") return ["signal"];
  if (component.type === "dc_motor") return ["signal"];
  if (component.type === "neopixel") return ["signal", "din"];
  return ["signal", "vout", "data", "din"];
}

function choosePowerPins(component: BoardComponent): string[] {
  if (component.type === "servo") return ["vcc"];
  if (component.type === "potentiometer") return ["vcc"];
  if (component.type === "temperature_sensor") return ["power"];
  if (component.type === "buzzer") return ["positive"];
  if (component.type === "relay") return ["vcc", "signal"];
  if (component.type === "dc_motor") return ["vcc", "signal"];
  if (component.type === "neopixel") return ["vcc"];
  if (component.type === "lcd_16x2") return ["vcc"];
  if (component.type === "oled_display") return ["vcc"];
  if (component.type === "seven_segment") return ["common"];
  if (component.type === "led" || component.type === "rgb_led") return ["anode", "common"];
  return ["power", "vcc", "positive"];
}

function parseConnectedArduinoPins(net: string, arduinoNetMap: Map<string, Set<number>>): Set<number> {
  return arduinoNetMap.get(net) ?? new Set<number>();
}

function addRailLoad(
  loads: Map<string, { currentMa: number; componentIds: Set<string> }>,
  rail: RailLoad["rail"],
  currentMa: number,
  componentId: string,
) {
  const key = rail;
  if (!loads.has(key)) {
    loads.set(key, { currentMa: 0, componentIds: new Set() });
  }
  const bucket = loads.get(key)!;
  bucket.currentMa += currentMa;
  bucket.componentIds.add(componentId);
}

function addPinLoad(
  loads: Map<number, { currentMa: number; componentIds: Set<string> }>,
  pin: number,
  currentMa: number,
  componentId: string,
) {
  if (!loads.has(pin)) {
    loads.set(pin, { currentMa: 0, componentIds: new Set() });
  }
  const bucket = loads.get(pin)!;
  bucket.currentMa += currentMa;
  bucket.componentIds.add(componentId);
}

function connectBreadboardBuses(ds: DisjointSet, usedGridPoints: Set<string>) {
  for (let row = 0; row < 30; row++) {
    const left = [0, 1, 2, 3, 4].map((col) => keyForGrid({ row, col }));
    const right = [5, 6, 7, 8, 9].map((col) => keyForGrid({ row, col }));

    for (const point of left) ds.make(point);
    for (const point of right) ds.make(point);

    for (let i = 1; i < left.length; i++) ds.union(left[0]!, left[i]!);
    for (let i = 1; i < right.length; i++) ds.union(right[0]!, right[i]!);

    for (const point of left) usedGridPoints.add(point);
    for (const point of right) usedGridPoints.add(point);
  }

  // Power rails run the full board length.
  for (let row = 1; row < 30; row++) {
    ds.union(keyForGrid({ row: 0, col: -2 }), keyForGrid({ row, col: -2 }));
    ds.union(keyForGrid({ row: 0, col: -1 }), keyForGrid({ row, col: -1 }));
    ds.union(keyForGrid({ row: 0, col: 10 }), keyForGrid({ row, col: 10 }));
    ds.union(keyForGrid({ row: 0, col: 11 }), keyForGrid({ row, col: 11 }));
    usedGridPoints.add(keyForGrid({ row, col: -2 }));
    usedGridPoints.add(keyForGrid({ row, col: -1 }));
    usedGridPoints.add(keyForGrid({ row, col: 10 }));
    usedGridPoints.add(keyForGrid({ row, col: 11 }));
  }
}

export function analyzePowerBudget(board: BoardState): PowerBudgetReport {
  const issues: PowerIssue[] = [];
  const recommendations = new Map<string, string>();
  const ds = new DisjointSet();
  const arduinoNetMap = new Map<string, Set<number>>();
  const usedGridPoints = new Set<string>();

  connectBreadboardBuses(ds, usedGridPoints);

  for (const wire of Object.values(board.wires)) {
    const fromKey = wire.fromRow === -999
      ? keyForArduinoPin(wire.fromCol)
      : keyForGrid({ row: wire.fromRow, col: wire.fromCol });
    const toKey = keyForGrid({ row: wire.toRow, col: wire.toCol });
    ds.union(fromKey, toKey);
    usedGridPoints.add(toKey);
    if (wire.fromRow !== -999) usedGridPoints.add(fromKey);
  }

  // Build root->arduino pins map once after unions.
  for (const wire of Object.values(board.wires)) {
    if (wire.fromRow !== -999) continue;
    const net = ds.find(keyForArduinoPin(wire.fromCol));
    if (!arduinoNetMap.has(net)) arduinoNetMap.set(net, new Set());
    arduinoNetMap.get(net)!.add(wire.fromCol);
  }

  const pinLoads = new Map<number, { currentMa: number; componentIds: Set<string> }>();
  const railLoads = new Map<string, { currentMa: number; componentIds: Set<string> }>();

  const components = Object.values(board.components).filter((c) => c.type !== "arduino_uno");
  const hasExternalSupply = components.some((c) => c.type === "power_supply");

  for (const component of components) {
    const profile = getComponentElectricalProfile(component.type as ComponentType);
    const pins = componentPinPoints(component);
    const signalPinNames = chooseSignalPins(component);
    const powerPinNames = choosePowerPins(component);

    // Signal load contribution per connected output pin.
    for (const signalPinName of signalPinNames) {
      const point = pins[signalPinName];
      if (!point) continue;
      const net = ds.find(keyForGrid(point));
      const connectedPins = parseConnectedArduinoPins(net, arduinoNetMap);
      for (const pin of connectedPins) {
        if (pin >= 0 && pin <= 19) {
          addPinLoad(pinLoads, pin, profile.signalPinCurrentMa, component.id);
        }
      }
    }

    // Rail load source inference.
    let poweredFromArduino5V = false;
    let poweredFromArduino3V3 = false;
    let poweredFromExternal = false;

    for (const powerPinName of powerPinNames) {
      const point = pins[powerPinName];
      if (!point) continue;
      const net = ds.find(keyForGrid(point));
      const connectedPins = parseConnectedArduinoPins(net, arduinoNetMap);
      if (connectedPins.has(-1)) poweredFromArduino5V = true;
      if (connectedPins.has(-2)) poweredFromArduino3V3 = true;

      // External supply heuristic: same net touches a power_supply positive pin.
      if (!poweredFromExternal) {
        for (const other of components) {
          if (other.type !== "power_supply") continue;
          const positivePoints = powerSupplyPositivePoints(other);
          if (positivePoints.some((pos) => ds.find(keyForGrid(pos)) === net)) {
            poweredFromExternal = true;
            break;
          }
        }
      }
    }

    const railCurrent = Math.max(profile.typicalCurrentMa, profile.startupCurrentMa || 0);
    if (railCurrent > 0) {
      if (poweredFromArduino5V) addRailLoad(railLoads, "5V", railCurrent, component.id);
      if (poweredFromArduino3V3) addRailLoad(railLoads, "3V3", railCurrent, component.id);
      if (poweredFromExternal) addRailLoad(railLoads, "external", railCurrent, component.id);
    }

    if (profile.mustUseExternalPower && !poweredFromExternal) {
      issues.push({
        severity: "error",
        code: "EXTERNAL_POWER_REQUIRED",
        message: `${component.name} (${component.type}) should use external power with common ground, not only Arduino rail.`,
        componentId: component.id,
      });
      recommendations.set(
        "add_external_supply",
        "Add a power_supply component, power high-current loads from it, and tie grounds together."
      );
    }

    if (profile.mustUseExternalPower && poweredFromArduino5V) {
      issues.push({
        severity: "error",
        code: "HIGH_CURRENT_ON_ARDUINO_5V",
        message: `${component.name} (${component.type}) appears powered from Arduino 5V. Move load power to external supply.`,
        componentId: component.id,
      });
    }
  }

  // Per-pin limits.
  for (const [pin, load] of pinLoads.entries()) {
    if (load.currentMa > ARDUINO_UNO_ELECTRICAL_PROFILE.pinCurrentLimitMa) {
      issues.push({
        severity: "error",
        code: "PIN_OVERCURRENT",
        message: `${arduinoPinLabel(pin)} estimated at ${load.currentMa.toFixed(1)}mA (limit ${ARDUINO_UNO_ELECTRICAL_PROFILE.pinCurrentLimitMa}mA).`,
        pin,
      });
      recommendations.set(
        "use_driver",
        "Use a transistor/MOSFET/driver and external rail for high-current loads."
      );
    } else if (load.currentMa > ARDUINO_UNO_ELECTRICAL_PROFILE.pinCurrentLimitMa * 0.75) {
      issues.push({
        severity: "warning",
        code: "PIN_NEAR_LIMIT",
        message: `${arduinoPinLabel(pin)} is near limit at ${load.currentMa.toFixed(1)}mA.`,
        pin,
      });
    }
  }

  // Rail limits.
  const v5Load = railLoads.get("5V")?.currentMa ?? 0;
  if (v5Load > ARDUINO_UNO_ELECTRICAL_PROFILE.railCurrentLimitsMa.v5) {
    issues.push({
      severity: "error",
      code: "RAIL_OVERCURRENT_5V",
      message: `Arduino 5V rail estimated at ${v5Load.toFixed(1)}mA (limit ${ARDUINO_UNO_ELECTRICAL_PROFILE.railCurrentLimitsMa.v5}mA).`,
    });
  }

  const v3Load = railLoads.get("3V3")?.currentMa ?? 0;
  if (v3Load > ARDUINO_UNO_ELECTRICAL_PROFILE.railCurrentLimitsMa.v3v3) {
    issues.push({
      severity: "error",
      code: "RAIL_OVERCURRENT_3V3",
      message: `Arduino 3V3 rail estimated at ${v3Load.toFixed(1)}mA (limit ${ARDUINO_UNO_ELECTRICAL_PROFILE.railCurrentLimitsMa.v3v3}mA).`,
    });
  }

  const estimatedTotalCurrentMa = v5Load + v3Load;
  if (estimatedTotalCurrentMa > ARDUINO_UNO_ELECTRICAL_PROFILE.totalCurrentLimitMa) {
    issues.push({
      severity: "error",
      code: "BOARD_TOTAL_OVERCURRENT",
      message: `Total board draw estimated at ${estimatedTotalCurrentMa.toFixed(1)}mA (limit ${ARDUINO_UNO_ELECTRICAL_PROFILE.totalCurrentLimitMa}mA).`,
    });
  }

  if (!hasExternalSupply && components.some((c) => getComponentElectricalProfile(c.type as ComponentType).mustUseExternalPower)) {
    recommendations.set(
      "missing_supply_component",
      "Add a `power_supply` component to represent an external rail for motors/servos/relays/LED arrays."
    );
  }

  const sortedPinLoads: PinLoad[] = [...pinLoads.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pin, value]) => ({
      pin,
      currentMa: Number(value.currentMa.toFixed(2)),
      connectedComponentIds: [...value.componentIds.values()],
    }));

  const sortedRailLoads: RailLoad[] = [...railLoads.entries()]
    .map(([rail, value]) => ({
      rail: rail as RailLoad["rail"],
      currentMa: Number(value.currentMa.toFixed(2)),
      connectedComponentIds: [...value.componentIds.values()],
    }))
    .sort((a, b) => a.rail.localeCompare(b.rail));

  return {
    board: ARDUINO_UNO_ELECTRICAL_PROFILE,
    pinLoads: sortedPinLoads,
    railLoads: sortedRailLoads,
    issues,
    recommendations: [...recommendations.entries()].map(([code, message]) => ({ code, message })),
    estimatedTotalCurrentMa: Number(estimatedTotalCurrentMa.toFixed(2)),
  };
}
