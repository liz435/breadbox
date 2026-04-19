// ── DreamerDiagram ↔ BoardState adapter ─────────────────────────────────────
//
// Pure functions. No I/O, no mutation of inputs, safe to import anywhere.
// Resolves the wire-endpoint grammar (see table below) against the named-pin
// footprints in component-pins.ts and the Arduino pin conventions in
// board-pins.ts.
//
// Wire endpoint grammar:
//
//   arduino.<num>      → { row: -999, col: <num> }
//   arduino.A<n>       → { row: -999, col: getArduinoPinFromAnalogIndex(n) }
//   arduino.D<n>       → alias of arduino.<num>
//   arduino.GND|5V|3V3 → { row: -999, col: -3 | -1 | -2 }
//   arduino.VIN        → { row: -999, col: -5 }
//   arduino.AREF       → { row: -999, col: -7 }
//   <compId>.<pinName> → componentPinPoints[compId][pinName]
//   <psuId>.+          → PSU positive rail anchor
//   <psuId>.-          → PSU negative rail anchor
//   grid.<row>,<col>   → literal fallback
//
// Any unresolved endpoint fails the entire parse (atomic).

import { z } from "zod";
import {
  boardComponentSchema,
  componentTypeSchema,
  environmentSchema,
  isBoardComponentType,
  DEFAULT_SKETCH_CODE,
  type BoardComponent,
  type BoardState,
  type Environment,
  type Wire,
} from "./arduino";
import {
  DEFAULT_BOARD_TARGET,
  type BoardTarget,
} from "./board-targets";
import {
  getArduinoPinFromAnalogIndex,
  getBoardAnalogPins,
  isArduinoSignalPin,
} from "./board-pins";
import {
  getComponentPinNames,
  resolveComponentPin,
  resolveComponentPins,
  type PinPoint,
} from "./component-pins";
import {
  diagramSchema,
  DIAGRAM_SCHEMA_V1,
  type DiagramComponent,
  type DiagramWire,
  type DreamerDiagram,
} from "./design";

// ── Result types ──────────────────────────────────────────────────────────

export type DiagramError = {
  /** JSON-path-style location, e.g. "wires[3].from". */
  path: string;
  message: string;
  /** Optional fuzzy suggestion (e.g. "did you mean 'anode'?"). */
  suggestion?: string;
};

export type DiagramParseResult =
  | { ok: true; boardState: BoardState }
  | { ok: false; errors: DiagramError[] };

// ── Arduino-pin name table ───────────────────────────────────────────────

const ARDUINO_POWER_PINS: Record<string, number> = {
  "5V": -1,
  "3V3": -2,
  GND: -3,
  VIN: -5,
  AREF: -7,
  IOREF: -8,
  RESET: -9,
};

function parseArduinoEndpoint(
  pinRef: string,
  boardTarget: BoardTarget,
): number | null {
  const upper = pinRef.toUpperCase();
  const power = ARDUINO_POWER_PINS[upper];
  if (power !== undefined) return power;

  const analogMatch = upper.match(/^A(\d{1,2})$/);
  if (analogMatch) {
    return getArduinoPinFromAnalogIndex(parseInt(analogMatch[1], 10), boardTarget);
  }

  const digitalMatch = upper.match(/^D(\d{1,2})$/);
  if (digitalMatch) {
    const n = parseInt(digitalMatch[1], 10);
    return isArduinoSignalPin(n) ? n : null;
  }

  const raw = Number(pinRef);
  if (!Number.isFinite(raw)) return null;
  const n = Math.trunc(raw);
  return isArduinoSignalPin(n) || n < 0 ? n : null;
}

// ── PSU rail anchors ─────────────────────────────────────────────────────

/**
 * Positive rail anchor for a power_supply component. Mirrors the semantics
 * the electrical analyzer uses — the PSU's left column (x) is the positive
 * anchor, spanning y and y+1.
 */
function psuPositiveAnchor(psu: BoardComponent): PinPoint {
  return { row: psu.y, col: psu.x };
}

function psuNegativeAnchor(psu: BoardComponent): PinPoint {
  return { row: psu.y + 1, col: psu.x };
}

// ── Endpoint resolution ──────────────────────────────────────────────────

function fuzzyPinSuggestion(pinName: string, validNames: string[]): string | undefined {
  const lower = pinName.toLowerCase();
  const exact = validNames.find((n) => n.toLowerCase() === lower);
  if (exact) return exact;
  // Single-letter edit distance (transposition / small typo).
  const candidate = validNames.find((n) => {
    if (Math.abs(n.length - pinName.length) > 1) return false;
    let diffs = 0;
    const longer = n.length >= pinName.length ? n : pinName;
    const shorter = n.length >= pinName.length ? pinName : n;
    for (let i = 0, j = 0; i < longer.length; i++) {
      if (longer[i] === shorter[j]) j++;
      else diffs++;
      if (diffs > 2) return false;
    }
    return true;
  });
  return candidate;
}

type EndpointOk = { ok: true; row: number; col: number };
type EndpointErr = { ok: false; message: string; suggestion?: string };

function resolveEndpoint(
  ref: string,
  components: Record<string, BoardComponent>,
  boardTarget: BoardTarget,
): EndpointOk | EndpointErr {
  // grid.r,c
  if (ref.startsWith("grid.")) {
    const tail = ref.slice(5);
    const parts = tail.split(",").map((s) => s.trim());
    if (parts.length !== 2) {
      return { ok: false, message: `"${ref}" — grid refs must be 'grid.<row>,<col>'` };
    }
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return { ok: false, message: `"${ref}" — row and col must be numbers` };
    }
    return { ok: true, row: Math.trunc(row), col: Math.trunc(col) };
  }

  // arduino.<pin>
  if (ref.toLowerCase().startsWith("arduino.")) {
    const tail = ref.slice(8);
    const pin = parseArduinoEndpoint(tail, boardTarget);
    if (pin === null) {
      const analogPins = getBoardAnalogPins(boardTarget);
      return {
        ok: false,
        message: `"${ref}" — unrecognized Arduino pin (try 0-${analogPins[analogPins.length - 1] ?? 19}, A0-A${analogPins.length - 1}, GND, 5V, 3V3)`,
      };
    }
    return { ok: true, row: -999, col: pin };
  }

  // <compId>.<pinName> or <psuId>.+/-
  const dotIdx = ref.indexOf(".");
  if (dotIdx <= 0 || dotIdx === ref.length - 1) {
    return { ok: false, message: `"${ref}" — wire endpoints must be 'arduino.<pin>' | '<id>.<pinName>' | 'grid.<row>,<col>'` };
  }
  const compId = ref.slice(0, dotIdx);
  const pinRef = ref.slice(dotIdx + 1);
  const comp = components[compId];
  if (!comp) {
    const knownIds = Object.keys(components).filter((id) => !isBoardComponentType(components[id].type));
    return {
      ok: false,
      message: `"${ref}" — component id "${compId}" not found`,
      suggestion: knownIds.find((id) => id.toLowerCase() === compId.toLowerCase()),
    };
  }

  // PSU shortcut
  if (comp.type === "power_supply") {
    if (pinRef === "+") {
      const p = psuPositiveAnchor(comp);
      return { ok: true, row: p.row, col: p.col };
    }
    if (pinRef === "-") {
      const p = psuNegativeAnchor(comp);
      return { ok: true, row: p.row, col: p.col };
    }
  }

  // Named pin lookup via schema's canonical footprint resolver.
  const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties);
  const pinPoint = pins[pinRef];
  if (!pinPoint) {
    const validNames =
      comp.type === "power_supply"
        ? ["+", "-"]
        : getComponentPinNames(comp.type);
    const suggestion = fuzzyPinSuggestion(pinRef, validNames);
    return {
      ok: false,
      message: `"${ref}" — component "${compId}" (type ${comp.type}) has pins [${validNames.join(", ")}]`,
      suggestion,
    };
  }
  return { ok: true, row: pinPoint.row, col: pinPoint.col };
}

// ── diagramToBoardState ──────────────────────────────────────────────────

export function diagramToBoardState(input: unknown): DiagramParseResult {
  const errors: DiagramError[] = [];

  // Explicit version gate — zod's literal check gives a less friendly message.
  if (
    typeof input === "object" &&
    input !== null &&
    "$schema" in input &&
    (input as { $schema: unknown }).$schema !== DIAGRAM_SCHEMA_V1
  ) {
    return {
      ok: false,
      errors: [
        {
          path: "$schema",
          message: `unknown diagram version "${String((input as { $schema: unknown }).$schema)}" — expected "${DIAGRAM_SCHEMA_V1}"`,
        },
      ],
    };
  }

  // Zod validation.
  const parsed = diagramSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        path: issue.path.join("."),
        message: issue.message,
      });
    }
    return { ok: false, errors };
  }

  const diagram = parsed.data;
  const boardTarget = diagram.board ?? DEFAULT_BOARD_TARGET;

  // Components — detect duplicate ids, build record.
  const components: Record<string, BoardComponent> = {};
  const seenIds = new Set<string>();
  for (let i = 0; i < diagram.components.length; i++) {
    const c = diagram.components[i];
    if (seenIds.has(c.id)) {
      errors.push({
        path: `components[${i}].id`,
        message: `duplicate component id "${c.id}"`,
      });
      continue;
    }
    seenIds.add(c.id);

    const [x, y] = c.at;
    const bc: BoardComponent = {
      id: c.id,
      type: c.type,
      name: c.name ?? defaultComponentName(c),
      x,
      y,
      rotation: c.rotation,
      pins: c.pins ?? {},
      properties: c.properties,
    };

    // Validate the assembled component through the canonical schema so any
    // type-specific invariants the arduino schema adds stay enforced.
    const check = boardComponentSchema.safeParse(bc);
    if (!check.success) {
      for (const issue of check.error.issues) {
        errors.push({
          path: `components[${i}].${issue.path.join(".")}`,
          message: issue.message,
        });
      }
      continue;
    }
    components[c.id] = check.data;
  }

  if (errors.length > 0) return { ok: false, errors };

  // Wires — resolve endpoints, auto-id missing entries.
  const wires: Record<string, Wire> = {};
  let autoIdCounter = 1;
  const usedWireIds = new Set<string>();
  for (let i = 0; i < diagram.wires.length; i++) {
    const w = diagram.wires[i];
    const fromRes = resolveEndpoint(w.from, components, boardTarget);
    const toRes = resolveEndpoint(w.to, components, boardTarget);
    if (!fromRes.ok) {
      errors.push({
        path: `wires[${i}].from`,
        message: fromRes.message,
        suggestion: fromRes.suggestion,
      });
    }
    if (!toRes.ok) {
      errors.push({
        path: `wires[${i}].to`,
        message: toRes.message,
        suggestion: toRes.suggestion,
      });
    }
    if (!fromRes.ok || !toRes.ok) continue;

    let id = w.id;
    if (!id || usedWireIds.has(id)) {
      do {
        id = `wire-${String(autoIdCounter).padStart(3, "0")}`;
        autoIdCounter++;
      } while (usedWireIds.has(id));
    }
    usedWireIds.add(id);

    wires[id] = {
      id,
      fromRow: fromRes.row,
      fromCol: fromRes.col,
      toRow: toRes.row,
      toCol: toRes.col,
      color: w.color,
    };
  }

  if (errors.length > 0) return { ok: false, errors };

  const environment: Environment = diagram.environment
    ? environmentSchema.parse({
        obstacles: Object.fromEntries(
          diagram.environment.obstacles.map((o) => [o.id, o]),
        ),
        boundaryEnabled: diagram.environment.boundaryEnabled,
        boundaryMargin: diagram.environment.boundaryMargin,
      })
    : environmentSchema.parse({});

  const customLibraries: Record<string, { name: string; code: string; description: string }> = {};
  for (const lib of diagram.customLibraries) {
    customLibraries[lib.name] = {
      name: lib.name,
      code: lib.code,
      description: lib.description,
    };
  }

  const boardState: BoardState = {
    components,
    wires,
    libraryState: { servos: {}, lcd: null, serialBaud: 0 },
    serialOutput: [],
    sketchCode: diagram.sketch || DEFAULT_SKETCH_CODE,
    customLibraries,
    boardTarget,
    environment,
  };

  return { ok: true, boardState };
}

// ── boardStateToDiagram ──────────────────────────────────────────────────

export function boardStateToDiagram(state: BoardState): DreamerDiagram {
  const components: DiagramComponent[] = Object.values(state.components)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => {
      // Only keep pins that have an explicit non-null assignment. Most
      // wire-topology-resolved components have `{ anode: null, ... }` in
      // BoardState; omit that noise from the DSL.
      const explicitPins: Record<string, number | null> = {};
      let hasExplicit = false;
      for (const [k, v] of Object.entries(c.pins)) {
        if (v !== null) {
          explicitPins[k] = v;
          hasExplicit = true;
        }
      }
      const out: DiagramComponent = {
        id: c.id,
        type: c.type,
        at: [c.x, c.y],
        rotation: c.rotation,
        properties: c.properties,
      };
      if (c.name && c.name !== defaultComponentName({ type: c.type })) out.name = c.name;
      if (hasExplicit) out.pins = explicitPins;
      return out;
    });

  // Index named-pin points per component so humanization is O(1) per wire.
  const pinIndex = buildPinIndex(state.components);

  const wires: DiagramWire[] = Object.values(state.wires)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((w) => ({
      id: w.id,
      from: humanizeEndpoint(
        { row: w.fromRow, col: w.fromCol },
        pinIndex,
        state.components,
        state.boardTarget ?? DEFAULT_BOARD_TARGET,
      ),
      to: humanizeEndpoint(
        { row: w.toRow, col: w.toCol },
        pinIndex,
        state.components,
        state.boardTarget ?? DEFAULT_BOARD_TARGET,
      ),
      color: w.color,
    }));

  const environment = {
    obstacles: Object.values(state.environment.obstacles).map((o) => ({
      id: o.id,
      shape: o.shape,
      x1: o.x1,
      y1: o.y1,
      x2: o.x2,
      y2: o.y2,
      label: o.label,
    })),
    boundaryEnabled: state.environment.boundaryEnabled,
    boundaryMargin: state.environment.boundaryMargin,
  };

  const customLibraries = Object.values(state.customLibraries).map((lib) => ({
    name: lib.name,
    code: lib.code,
    description: lib.description,
  }));

  return {
    $schema: DIAGRAM_SCHEMA_V1,
    board: state.boardTarget ?? DEFAULT_BOARD_TARGET,
    sketch: state.sketchCode,
    components,
    wires,
    environment,
    customLibraries,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

type PinIndex = Map<string /* "row,col" */, { compId: string; pinName: string }>;

function buildPinIndex(components: Record<string, BoardComponent>): PinIndex {
  const index: PinIndex = new Map();
  // Walk in insertion order. For collisions (two components at the same
  // grid point — a board bug) first write wins.
  for (const c of Object.values(components)) {
    if (isBoardComponentType(c.type)) continue;
    if (c.type === "power_supply") continue; // PSU uses +/- shortcut
    const pins = resolveComponentPins(c.type, c.y, c.x, c.properties);
    for (const [pinName, pt] of Object.entries(pins)) {
      const key = `${pt.row},${pt.col}`;
      if (!index.has(key)) {
        index.set(key, { compId: c.id, pinName });
      }
    }
  }
  return index;
}

function humanizeEndpoint(
  pt: PinPoint,
  pinIndex: PinIndex,
  components: Record<string, BoardComponent>,
  boardTarget: BoardTarget,
): string {
  // 1. Arduino pin (row -999)
  if (pt.row === -999) {
    return "arduino." + arduinoPinLabel(pt.col, boardTarget);
  }

  // 2. Named pin on a component
  const hit = pinIndex.get(`${pt.row},${pt.col}`);
  if (hit) return `${hit.compId}.${hit.pinName}`;

  // 3. PSU rail
  for (const c of Object.values(components)) {
    if (c.type !== "power_supply") continue;
    const pos = psuPositiveAnchor(c);
    if (pos.row === pt.row && pos.col === pt.col) return `${c.id}.+`;
    const neg = psuNegativeAnchor(c);
    if (neg.row === pt.row && neg.col === pt.col) return `${c.id}.-`;
  }

  // 4. Fallback
  return `grid.${pt.row},${pt.col}`;
}

function arduinoPinLabel(col: number, boardTarget: BoardTarget): string {
  for (const [label, pin] of Object.entries(ARDUINO_POWER_PINS)) {
    if (pin === col) return label;
  }
  const analogPins = getBoardAnalogPins(boardTarget);
  const analogIdx = analogPins.indexOf(col);
  if (analogIdx >= 0) return `A${analogIdx}`;
  if (isArduinoSignalPin(col)) return String(col);
  // Unknown negative power pin number — emit as raw number for round-trip.
  return String(col);
}

/** Best-effort display name; same convention as component registry. */
function defaultComponentName(c: { type: string }): string {
  const names: Record<string, string> = {
    led: "LED",
    rgb_led: "RGB LED",
    button: "Button",
    resistor: "Resistor",
    capacitor: "Capacitor",
    potentiometer: "Potentiometer",
    buzzer: "Buzzer",
    servo: "Servo",
    lcd_16x2: "LCD 16x2",
    seven_segment: "7-Segment",
    photoresistor: "Photoresistor",
    temperature_sensor: "Temperature Sensor",
    ultrasonic_sensor: "HC-SR04",
    neopixel: "NeoPixel",
    pir_sensor: "PIR Sensor",
    relay: "Relay",
    dc_motor: "DC Motor",
    dht_sensor: "DHT Sensor",
    ir_receiver: "IR Receiver",
    shift_register: "74HC595",
    oled_display: "OLED",
    power_supply: "External 5V",
    multimeter: "Multimeter",
  };
  return names[c.type] ?? c.type;
}

// Silence unused-import warning: `componentTypeSchema` is re-exported
// elsewhere but imported here only for future schema-extension use.
void componentTypeSchema;
void resolveComponentPin;
void z;
