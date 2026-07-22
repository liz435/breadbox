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
  type CustomFootprintLookup,
  type PinPoint,
} from "./component-pins";
import {
  diagramSchema,
  DIAGRAM_SCHEMA_V1,
  DIAGRAM_SCHEMA_V1_LEGACY,
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
  customFootprints?: CustomFootprintLookup,
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
  const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties, customFootprints);
  const pinPoint = pins[pinRef];
  if (!pinPoint) {
    const validNames =
      comp.type === "power_supply"
        ? ["+", "-"]
        : getComponentPinNames(comp.type, customFootprints);
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

export function diagramToBoardState(
  input: unknown,
  customFootprints?: CustomFootprintLookup,
): DiagramParseResult {
  const errors: DiagramError[] = [];

  // Back-compat: normalize the pre-rebrand `dreamer-diagram-v1` literal to the
  // current one so old exports / shared links still load. This is the single
  // read chokepoint, so every caller (CLI, diagram panel, share links, agent
  // tools) inherits the alias and the zod `z.literal` check downstream passes.
  if (
    typeof input === "object" &&
    input !== null &&
    "$schema" in input &&
    (input as { $schema: unknown }).$schema === DIAGRAM_SCHEMA_V1_LEGACY
  ) {
    input = { ...(input as Record<string, unknown>), $schema: DIAGRAM_SCHEMA_V1 };
  }

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

    // The DSL is documented and prompted as `at: [row, col]` (row first
    // — the natural reading order on a vertical breadboard). BoardState's
    // convention is the opposite: `BoardComponent.x` holds the column and
    // `.y` holds the row. Every downstream consumer (analyzer, policy
    // engine, renderer, pin resolver) reads BC as (x=col, y=row), e.g.
    // `resolveComponentPins(type, component.y, component.x)`. So we
    // translate here. Without this swap, an asymmetric placement like
    // `at: [20, 5]` lands as bc.x=20 (off-grid horizontally) and the
    // analyzer reads the row as 5 — every component placed via DSL
    // collapses to whatever row its DSL col accidentally is, and pins
    // collide across components on shared breadboard rows.
    const [row, col] = c.at;
    const bc: BoardComponent = {
      id: c.id,
      type: c.type,
      name: c.name ?? defaultComponentName(c),
      x: col,
      y: row,
      rotation: c.rotation,
      pins: c.pins ?? {},
      properties: c.properties,
      // Multi-board fields. Optional in the DSL — when present, preserve so
      // a saved diagram with placed boards round-trips. When absent for a
      // surface-board component, the post-processing below back-fills sane
      // defaults (parentId: null, worldX/worldY: 0) so the renderer treats
      // it as the default position.
      ...(c.parentId !== undefined ? { parentId: c.parentId } : {}),
      ...(c.worldX !== undefined ? { worldX: c.worldX } : {}),
      ...(c.worldY !== undefined ? { worldY: c.worldY } : {}),
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
    const fromRes = resolveEndpoint(w.from, components, boardTarget, customFootprints);
    const toRes = resolveEndpoint(w.to, components, boardTarget, customFootprints);
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

    // Invariant downstream consumers depend on: Arduino-pin endpoints
    // (sentinel row === -999) always live on the `from` side of a wire.
    // propose_circuit's wire generator enforces this via its
    // {arduinoPin, toComponent, toPin} shape, so power-budget-analyzer,
    // board-state-tracker, breadboard-grid, etc. only ever check
    // fromRow === -999. The DSL lets a user write either direction
    // (`arduino.GND -> btn.b` or `btn.b -> arduino.GND`); normalize here
    // so analyzers don't see a phantom grid cell at row -999.
    const fromIsArduino = fromRes.row === -999;
    const toIsArduino = toRes.row === -999;
    const [from, to] =
      !fromIsArduino && toIsArduino ? [toRes, fromRes] : [fromRes, toRes];

    wires[id] = {
      id,
      fromRow: from.row,
      fromCol: from.col,
      toRow: to.row,
      toCol: to.col,
      color: w.color,
      ...(w.fromBoardId !== undefined ? { fromBoardId: w.fromBoardId } : {}),
      ...(w.fromStrip !== undefined ? { fromStrip: w.fromStrip } : {}),
      ...(w.toBoardId !== undefined ? { toBoardId: w.toBoardId } : {}),
      ...(w.toStrip !== undefined ? { toStrip: w.toStrip } : {}),
    };
  }

  if (errors.length > 0) return { ok: false, errors };

  // Normalise the multi-board fields. If the DSL omitted parentId on a
  // non-board component, default it to a surface board if exactly one
  // exists — same intent as the migration script. This keeps hand-written
  // single-board diagrams working with the new schema even when the author
  // doesn't think about parentage.
  const surfaceBoardIds = Object.values(components)
    .filter((c) => c.type === "breadboard_full" || c.type === "perfboard_generic")
    .map((c) => c.id);
  const defaultParent = surfaceBoardIds.length === 1 ? surfaceBoardIds[0] : null;
  for (const c of Object.values(components)) {
    const isBoard = c.type === "breadboard_full" || c.type === "perfboard_generic"
      || c.type === "arduino_uno" || c.type === "arduino_nano" || c.type === "arduino_mega_2560";
    if (isBoard) {
      if (c.parentId === undefined) c.parentId = null;
      if (c.worldX === undefined) c.worldX = c.type === "breadboard_full" || c.type === "perfboard_generic" ? 0 : -300;
      if (c.worldY === undefined) c.worldY = 0;
    } else if (c.parentId === undefined && defaultParent) {
      c.parentId = defaultParent;
    }
  }

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
    libraryState: { servos: {}, steppers: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {}, custom: {} },
    serialOutput: [],
    sketchCode: diagram.sketch || DEFAULT_SKETCH_CODE,
    customLibraries,
    boardTarget,
    environment,
    realismProfile: "learn",
    // Diagrams don't describe the 3D assembly layer — leave it absent so the
    // apply paths (load_board op, LOAD_BOARD event, diagram CLI) carry the
    // previous board's assembly forward via repairAssemblyForComponents.
  };

  return { ok: true, boardState };
}

// ── boardStateToDiagram ──────────────────────────────────────────────────

export function boardStateToDiagram(
  state: BoardState,
  customFootprints?: CustomFootprintLookup,
): DreamerDiagram {
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
        // DSL convention is `at: [row, col]`, BoardState is (x=col, y=row).
        // Mirror the swap done in diagramToBoardState so a round-trip
        // (read board → diagram → re-apply) lands the component back in
        // the same physical spot.
        at: [c.y, c.x],
        rotation: c.rotation,
        properties: c.properties,
      };
      if (c.name && c.name !== defaultComponentName({ type: c.type })) out.name = c.name;
      if (hasExplicit) out.pins = explicitPins;
      // Multi-board fields. Only emit when non-default so the DSL stays
      // terse for the common single-board case.
      if (c.parentId !== undefined && c.parentId !== null) out.parentId = c.parentId;
      else if (c.parentId === null) out.parentId = null;
      if (c.worldX !== undefined && c.worldX !== 0) out.worldX = c.worldX;
      if (c.worldY !== undefined && c.worldY !== 0) out.worldY = c.worldY;
      return out;
    });

  // Index named-pin points per component so humanization is O(1) per wire.
  const pinIndex = buildPinIndex(state.components, customFootprints);

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
      // Preserve board-scoped endpoints so the DSL survives multi-board
      // scenes. Optional: omit when both endpoints reference the default
      // single board, keeping the round-tripped DSL terse.
      ...(w.fromBoardId ? { fromBoardId: w.fromBoardId } : {}),
      ...(w.fromStrip ? { fromStrip: w.fromStrip } : {}),
      ...(w.toBoardId ? { toBoardId: w.toBoardId } : {}),
      ...(w.toStrip ? { toStrip: w.toStrip } : {}),
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

function buildPinIndex(
  components: Record<string, BoardComponent>,
  customFootprints?: CustomFootprintLookup,
): PinIndex {
  const index: PinIndex = new Map();
  // Walk in insertion order. For collisions (two components at the same
  // grid point — a board bug) first write wins.
  for (const c of Object.values(components)) {
    if (isBoardComponentType(c.type)) continue;
    if (c.type === "power_supply") continue; // PSU uses +/- shortcut
    const pins = resolveComponentPins(c.type, c.y, c.x, c.properties, customFootprints);
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
    ir_remote: "IR Remote",
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
