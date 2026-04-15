import {
  DEFAULT_BOARD_TARGET,
  formatArduinoPin,
  isArduinoSignalPin,
  isBoardComponentType,
  resolveComponentPins,
} from "@dreamer/schemas";
import type {
  BoardComponent,
  BoardState,
  ComponentType,
  PinLoad,
  PinPoint,
  PowerBudgetReport,
  PowerIssue,
  RailLoad,
} from "@dreamer/schemas";
import { ARDUINO_UNO_ELECTRICAL_PROFILE } from "./profiles/arduino-uno";
import { getComponentElectricalProfile } from "./profiles/components";
import { analyzeRoutingPolicy } from "./routing-policy";

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

/**
 * Resolve component pin positions using the shared canonical resolver.
 * This ensures agreement with propose_circuit's wire generation and the
 * frontend's breadboard-grid connectivity checks.
 */
function componentPinPoints(component: BoardComponent): Record<string, PinPoint> {
  const pins = resolveComponentPins(component.type, component.y, component.x, component.properties);

  // Power supply has a special layout not covered by the shared resolver
  if (component.type === "power_supply") {
    return { positive: { row: component.y, col: component.x }, negative: { row: component.y + 1, col: component.x } };
  }

  // If the shared resolver returned nothing, fall back to a single signal point
  if (Object.keys(pins).length === 0) {
    return { signal: { row: component.y, col: component.x } };
  }

  return pins;
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

function powerSupplyNegativePoints(component: BoardComponent): Point[] {
  // Legacy model: treat (x, y+1) as negative anchor.
  // MB102 model: negative rails at cols -1 and 10 on rows y/y+1.
  return [
    { row: component.y + 1, col: component.x },
    { row: component.y, col: -1 },
    { row: component.y + 1, col: -1 },
    { row: component.y, col: 10 },
    { row: component.y + 1, col: 10 },
  ];
}

function chooseSignalPins(component: BoardComponent): string[] {
  if (component.type === "seven_segment") return ["a", "b", "c", "d", "e", "f", "g", "dp"];
  if (component.type === "led") return ["anode"];
  if (component.type === "rgb_led") return ["red", "green", "blue"];
  if (component.type === "servo") return ["signal"];
  if (component.type === "buzzer") return ["positive"];
  if (component.type === "relay") return ["signal"];
  if (component.type === "dc_motor") return ["signal"];
  if (component.type === "neopixel") return ["signal", "din"];
  if (component.type === "lcd_16x2") return ["rs", "e", "d4", "d5", "d6", "d7"];
  return ["signal", "data", "din"];
}

function choosePowerPins(component: BoardComponent): string[] {
  if (component.type === "servo") return ["vcc"];
  if (component.type === "potentiometer") return ["vcc"];
  if (component.type === "temperature_sensor") return ["vcc"];
  if (component.type === "buzzer") return ["positive"];
  if (component.type === "relay") return ["vcc", "signal"];
  if (component.type === "dc_motor") return ["vcc", "signal"];
  if (component.type === "neopixel") return ["vcc"];
  if (component.type === "lcd_16x2") return ["vdd", "a"];
  if (component.type === "oled_display") return ["vcc"];
  if (component.type === "led" || component.type === "rgb_led") return ["anode", "common"];
  return ["vcc", "positive"];
}

function chooseGroundPins(component: BoardComponent): string[] {
  if (component.type === "seven_segment") return ["gnd"];
  if (component.type === "servo") return ["gnd"];
  if (component.type === "potentiometer") return ["gnd"];
  if (component.type === "temperature_sensor") return ["gnd"];
  if (component.type === "buzzer") return ["negative"];
  if (component.type === "lcd_16x2") return ["vss", "k"];
  if (component.type === "led") return ["cathode"];
  if (component.type === "rgb_led") return ["common"];
  return ["gnd", "negative"];
}

function parseConnectedArduinoPins(net: string, arduinoNetMap: Map<string, Set<number>>): Set<number> {
  return arduinoNetMap.get(net) ?? new Set<number>();
}

function netHasGroundRail(ds: DisjointSet, net: string): boolean {
  for (let row = 0; row < 30; row++) {
    if (ds.find(keyForGrid({ row, col: -1 })) === net) return true;
    if (ds.find(keyForGrid({ row, col: 10 })) === net) return true;
  }
  return false;
}

function netHasPowerRail(ds: DisjointSet, net: string): boolean {
  for (let row = 0; row < 30; row++) {
    if (ds.find(keyForGrid({ row, col: -2 })) === net) return true;
    if (ds.find(keyForGrid({ row, col: 11 })) === net) return true;
  }
  return false;
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
  const boardTarget = board.boardTarget ?? DEFAULT_BOARD_TARGET;
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

  const components = Object.values(board.components).filter((c) => !isBoardComponentType(c.type));
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
        if (isArduinoSignalPin(pin)) {
          addPinLoad(pinLoads, pin, profile.signalPinCurrentMa, component.id);
        }
      }
    }

    // Rail load source inference.
    let poweredFromArduino5V = false;
    let poweredFromArduino3V3 = false;
    let poweredFromExternal = false;
    let hasPotentialPowerFeed = false;
    let hasGroundConnection = false;

    for (const powerPinName of powerPinNames) {
      const point = pins[powerPinName];
      if (!point) continue;
      const net = ds.find(keyForGrid(point));
      const connectedPins = parseConnectedArduinoPins(net, arduinoNetMap);
      if (connectedPins.has(-1)) poweredFromArduino5V = true;
      if (connectedPins.has(-2)) poweredFromArduino3V3 = true;
      // Treat any non-ground Arduino pin touching a power pin net as a
      // potential feed source (5V/3V3/digital/analog), so we can validate
      // only when the component is actually being powered.
      if ([...connectedPins].some((pin) => pin !== -3 && pin !== -4 && pin !== -6)) {
        hasPotentialPowerFeed = true;
      }

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

    for (const groundPinName of chooseGroundPins(component)) {
      const point = pins[groundPinName];
      if (!point) continue;
      const net = ds.find(keyForGrid(point));
      const connectedPins = parseConnectedArduinoPins(net, arduinoNetMap);
      if (connectedPins.has(-3) || connectedPins.has(-4) || connectedPins.has(-6)) {
        hasGroundConnection = true;
      }
      if (!hasGroundConnection) {
        for (const other of components) {
          if (other.type !== "power_supply") continue;
          const negativePoints = powerSupplyNegativePoints(other);
          if (negativePoints.some((pos) => ds.find(keyForGrid(pos)) === net)) {
            hasGroundConnection = true;
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

    if (profile.mustUseExternalPower && hasPotentialPowerFeed && !poweredFromExternal) {
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

    if (component.type === "lcd_16x2") {
      const signalPinNames = chooseSignalPins(component);
      const hasAnySignalConnection = signalPinNames.some((signalPinName) => {
        const point = pins[signalPinName];
        if (!point) return false;
        const net = ds.find(keyForGrid(point));
        const connectedPins = parseConnectedArduinoPins(net, arduinoNetMap);
        return [...connectedPins].some((pin) => isArduinoSignalPin(pin));
      });

      const isEffectivelyUsed = hasAnySignalConnection || hasPotentialPowerFeed || hasGroundConnection;
      if (isEffectivelyUsed) {
        if (!(poweredFromArduino5V || poweredFromArduino3V3 || poweredFromExternal)) {
          issues.push({
            severity: "error",
            code: "LCD_POWER_MISSING",
            message: `${component.name} (lcd_16x2) is wired for control but has no VDD power connection.`,
            componentId: component.id,
          });
        }
        if (!hasGroundConnection) {
          issues.push({
            severity: "error",
            code: "LCD_GROUND_MISSING",
            message: `${component.name} (lcd_16x2) is wired for control but has no ground (VSS/K) connection.`,
            componentId: component.id,
          });
        }
      }
    }

    if (component.type === "button") {
      const sideA = pins.a;
      const sideB = pins.b;
      if (sideA && sideB) {
        const netA = ds.find(keyForGrid(sideA));
        const netB = ds.find(keyForGrid(sideB));
        const pinsA = parseConnectedArduinoPins(netA, arduinoNetMap);
        const pinsB = parseConnectedArduinoPins(netB, arduinoNetMap);
        const sideAHasSignal = [...pinsA].some((pin) => isArduinoSignalPin(pin));
        const sideBHasSignal = [...pinsB].some((pin) => isArduinoSignalPin(pin));

        if (sideAHasSignal && sideBHasSignal) {
          issues.push({
            severity: "error",
            code: "BUTTON_SIGNAL_BOTH_SIDES",
            message: `${component.name} (button) has Arduino signal wires on both sides. Use one side for input and the opposite side for power/ground reference.`,
            componentId: component.id,
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
              message: `${component.name} (button) input has no opposite-side reference. Wire the other side to GND (for INPUT_PULLUP) or 5V/3V3 (for INPUT).`,
              componentId: component.id,
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
          message: `${resistor.name} (resistor) looks LCD-related but neither lead is wired.`,
          componentId: resistor.id,
        });
      }
    }
  }

  // Per-pin limits.
  for (const [pin, load] of pinLoads.entries()) {
    if (load.currentMa > ARDUINO_UNO_ELECTRICAL_PROFILE.pinCurrentLimitMa) {
      issues.push({
        severity: "error",
        code: "PIN_OVERCURRENT",
        message: `${formatArduinoPin(pin, boardTarget)} estimated at ${load.currentMa.toFixed(1)}mA (limit ${ARDUINO_UNO_ELECTRICAL_PROFILE.pinCurrentLimitMa}mA).`,
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
        message: `${formatArduinoPin(pin, boardTarget)} is near limit at ${load.currentMa.toFixed(1)}mA.`,
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

  const routing = analyzeRoutingPolicy(board);
  for (const violation of routing.violations) {
    issues.push({
      severity: "error",
      code: violation.code,
      message: violation.message,
      pin: violation.pin,
    });
  }
  if (routing.violations.length > 0) {
    recommendations.set(
      "distribute_pin_fanout",
      "Use one wire from each Arduino pin to a breadboard bus/rail, then branch from the bus/rail to loads."
    );
  }

  return {
    board: ARDUINO_UNO_ELECTRICAL_PROFILE,
    pinLoads: sortedPinLoads,
    railLoads: sortedRailLoads,
    issues,
    recommendations: [...recommendations.entries()].map(([code, message]) => ({ code, message })),
    estimatedTotalCurrentMa: Number(estimatedTotalCurrentMa.toFixed(2)),
  };
}
