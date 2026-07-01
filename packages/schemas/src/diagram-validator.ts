// ── Diagram Validator ─────────────────────────────────────────────────────
//
// Two-pass validation of a DreamerDiagram:
//
//   1. Structural — delegates to `diagramToBoardState`. Returns `error`
//      issues for schema violations, unknown pin names, etc. On failure
//      the validator stops here because later checks need a real BoardState.
//
//   2. Semantic — runs only when structural passes. Catches common "looks
//      valid but won't work" mistakes:
//        - DANGLING_COMPONENT    component has zero wires touching its footprint
//        - PIN_NOT_WIRED          sketch mentions pin N but no wire connects it
//        - MISSING_GROUND         component has a `gnd` pin but no wire from
//                                that pin reaches any Arduino GND or PSU (-)
//        - MISSING_I2C_WIRING    component exposes sda/scl but neither is
//                                wired to the board's SDA/SCL pins
//        - EMPTY_SKETCH           components placed but sketch is empty
//
// Power-budget / current-limit / SPICE checks live in
// packages/app/src/electrical/power-budget.ts and
// packages/api/src/electrical/power-budget-analyzer.ts — callers that want
// electrical analysis run those on the returned BoardState.

import type {
  BoardComponent,
  BoardState,
  Wire,
} from "./arduino";
import { isBoardComponentType } from "./arduino";
import { DEFAULT_BOARD_TARGET, type BoardTarget } from "./board-targets";
import {
  getBoardAnalogPins,
  isArduinoSignalPin,
} from "./board-pins";
import { resolveComponentPins, type CustomFootprintLookup } from "./component-pins";
import { diagramToBoardState, type DiagramError } from "./diagram-adapter";

// ── Result types ──────────────────────────────────────────────────────────

export type DiagramIssueSeverity = "error" | "warning";
export type DiagramIssueCategory = "structural" | "semantic";

export type DiagramIssueCode =
  | "STRUCTURAL_ERROR"
  | "DANGLING_COMPONENT"
  | "PIN_NOT_WIRED"
  | "MISSING_GROUND"
  | "MISSING_I2C_WIRING"
  | "EMPTY_SKETCH";

export type DiagramIssue = {
  severity: DiagramIssueSeverity;
  category: DiagramIssueCategory;
  code: DiagramIssueCode;
  /** JSON-path-style location when meaningful; `""` for board-wide issues. */
  path: string;
  message: string;
  suggestion?: string;
};

export type DiagramValidation = {
  /** True iff structural validation passed. Semantic issues don't flip this. */
  ok: boolean;
  /** Set only when `ok === true`. */
  boardState?: BoardState;
  issues: DiagramIssue[];
};

// ── Public API ────────────────────────────────────────────────────────────

export function validateDiagram(
  input: unknown,
  customFootprints?: CustomFootprintLookup,
): DiagramValidation {
  const structural = diagramToBoardState(input, customFootprints);
  if (!structural.ok) {
    return {
      ok: false,
      issues: structural.errors.map(structuralIssueFromError),
    };
  }

  const semantic = semanticIssues(structural.boardState, customFootprints);
  return {
    ok: true,
    boardState: structural.boardState,
    issues: semantic,
  };
}

// ── Structural error → issue ──────────────────────────────────────────────

function structuralIssueFromError(e: DiagramError): DiagramIssue {
  return {
    severity: "error",
    category: "structural",
    code: "STRUCTURAL_ERROR",
    path: e.path,
    message: e.message,
    suggestion: e.suggestion,
  };
}

// ── Semantic checks ───────────────────────────────────────────────────────

function semanticIssues(
  state: BoardState,
  customFootprints?: CustomFootprintLookup,
): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const boardTarget = state.boardTarget ?? DEFAULT_BOARD_TARGET;
  const simComponents = Object.values(state.components).filter(
    (c) => !isBoardComponentType(c.type),
  );
  const wires = Object.values(state.wires);

  // Empty-sketch warning: components placed but nothing for the MCU to run.
  if (simComponents.length > 0 && isSketchEffectivelyEmpty(state.sketchCode)) {
    issues.push({
      severity: "warning",
      category: "semantic",
      code: "EMPTY_SKETCH",
      path: "sketch",
      message: `Board has ${simComponents.length} component${simComponents.length === 1 ? "" : "s"} but the sketch is empty — the MCU won't drive anything.`,
    });
  }

  // Collect wire endpoints as grid points (skip -999 Arduino sentinel rows).
  const wireEndpoints: Array<{ row: number; col: number }> = [];
  for (const w of wires) {
    if (w.fromRow !== -999) wireEndpoints.push({ row: w.fromRow, col: w.fromCol });
    wireEndpoints.push({ row: w.toRow, col: w.toCol });
  }

  // Two breadboard points are "in the same bus" when they share a row and both
  // fall on the same terminal strip (left: cols 0–4, right: cols 5–9). Wires
  // that land anywhere on a row's bus reach every hole in that bus, so an LED
  // whose pin is at col 7 IS touched by a GND wire landing at col 9 on the
  // same row.
  function sameBus(
    ep: { row: number; col: number },
    pin: { row: number; col: number },
  ): boolean {
    if (ep.row !== pin.row) return false;
    if (ep.col === pin.col) return true;
    if (ep.col >= 0 && ep.col <= 4 && pin.col >= 0 && pin.col <= 4) return true;
    if (ep.col >= 5 && ep.col <= 9 && pin.col >= 5 && pin.col <= 9) return true;
    return false;
  }

  // Dangling component: no wire endpoint lands on the same breadboard bus as
  // any of the component's pins.
  for (const comp of simComponents) {
    const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties, customFootprints);
    const entries = Object.entries(pins);
    if (entries.length === 0) continue; // nothing to check
    const touched = entries.some(([, pt]) =>
      wireEndpoints.some((ep) => sameBus(ep, pt)),
    );
    if (!touched) {
      issues.push({
        severity: "warning",
        category: "semantic",
        code: "DANGLING_COMPONENT",
        path: `components[${comp.id}]`,
        message: `Component "${comp.id}" (${comp.type}) has no wires touching any of its pins — it's disconnected from the circuit.`,
      });
    }
  }

  // Missing ground for components with a `gnd` (or `negative` / `cathode`)
  // pin. We walk wires from that pin's grid point and check if the other
  // endpoint is at an Arduino GND (col -3/-4/-6), a breadboard GND rail, or
  // a PSU negative anchor. Approximate (doesn't chase multi-hop jumper chains),
  // but catches the most common "forgot GND" mistake.
  //
  // Two GND-rail representations to handle:
  //   1. DSL-style: wire to psu.-, resolves to {psu.y+1, psu.x}
  //   2. Raw BoardState: wire to col 10 (right negative rail) or col -1 (left)
  const hasPsu = simComponents.some((c) => c.type === "power_supply");
  // DSL-style PSU negative anchors (psu.-)
  const psuNegPoints = new Set<string>();
  for (const c of simComponents) {
    if (c.type !== "power_supply") continue;
    psuNegPoints.add(`${c.y + 1},${c.x}`);
  }
  // Raw breadboard GND rails: col 10 or col -1, either from PSU or directly wired to Arduino GND
  const gndRailCols = new Set<number>(hasPsu ? [10, -1] : []);
  if (!hasPsu) {
    for (const w of wires) {
      const fromIsArduinoGnd =
        w.fromRow === -999 && (w.fromCol === -3 || w.fromCol === -4 || w.fromCol === -6);
      if (fromIsArduinoGnd && (w.toCol === 10 || w.toCol === -1)) {
        gndRailCols.add(w.toCol);
      }
    }
  }

  // True when `p` is an actual ground sink: an Arduino GND pin, a PSU negative
  // anchor, or a breadboard GND rail.
  function isGroundSink(p: { row: number; col: number }): boolean {
    if (p.row === -999 && (p.col === -3 || p.col === -4 || p.col === -6)) return true;
    if (psuNegPoints.has(`${p.row},${p.col}`)) return true;
    if (gndRailCols.has(p.col)) return true;
    return false;
  }

  // Series-passable two-terminal parts: DC ground flows THROUGH them, so an LED
  // whose cathode reaches GND *through a resistor* is grounded. We deliberately
  // do NOT pass through the LED/diode/capacitor itself — only purely resistive
  // parts. Each link maps one terminal's grid point to the other's.
  const SERIES_PASSABLE = new Set(["resistor", "photoresistor"]);
  const seriesLinks: Array<{
    a: { row: number; col: number };
    b: { row: number; col: number };
  }> = [];
  for (const comp of simComponents) {
    if (!SERIES_PASSABLE.has(comp.type)) continue;
    const [a, b] = Object.values(resolveComponentPins(comp.type, comp.y, comp.x, comp.properties, customFootprints));
    if (a && b) seriesLinks.push({ a, b });
  }

  // Does `start` reach a ground sink by following wires (bus-aware) and passing
  // through series resistors? Bounded BFS; guards against cycles. This is what
  // makes the canonical Arduino-pin → LED → resistor → GND wiring count as
  // grounded instead of falsely flagging MISSING_GROUND.
  function reachesGround(start: { row: number; col: number }): boolean {
    const seen = new Set<string>();
    const queue: Array<{ row: number; col: number }> = [start];
    const key = (p: { row: number; col: number }) => `${p.row},${p.col}`;
    let guard = 0;
    while (queue.length > 0 && guard < 4000) {
      guard++;
      const p = queue.shift();
      if (!p) break;
      if (seen.has(key(p))) continue;
      seen.add(key(p));
      if (isGroundSink(p)) return true;
      // Any wire touching p (on its breadboard side) makes the other end reachable.
      for (const w of wires) {
        if (w.fromRow !== -999 && sameBus({ row: w.fromRow, col: w.fromCol }, p)) {
          queue.push({ row: w.toRow, col: w.toCol });
        }
        if (sameBus({ row: w.toRow, col: w.toCol }, p)) {
          queue.push({ row: w.fromRow, col: w.fromCol });
        }
      }
      // Landing on one terminal of a series resistor reaches the other terminal.
      for (const link of seriesLinks) {
        if (sameBus(p, link.a)) queue.push(link.b);
        if (sameBus(p, link.b)) queue.push(link.a);
      }
    }
    return false;
  }

  for (const comp of simComponents) {
    const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties, customFootprints);
    const groundPinKey = Object.keys(pins).find((k) =>
      /^(gnd|ground|negative|cathode)$/.test(k),
    );
    if (!groundPinKey) continue;
    const gnd = pins[groundPinKey];
    if (!gnd) continue;

    const connectedToGround = reachesGround(gnd);

    if (!connectedToGround) {
      // Only flag if there IS at least one wire touching the gnd pin —
      // otherwise DANGLING_COMPONENT already covers it.
      if (!wireEndpoints.some((ep) => sameBus(ep, gnd))) continue;
      issues.push({
        severity: "warning",
        category: "semantic",
        code: "MISSING_GROUND",
        path: `components[${comp.id}]`,
        message: `Component "${comp.id}" (${comp.type}) has its ${groundPinKey} pin wired, but not to Arduino GND or a power supply negative rail.`,
        suggestion: "Connect the ground pin to arduino.GND or <psuId>.-",
      });
    }
  }

  // Missing I²C wiring for components with `sda` / `scl` pins (currently
  // just `oled_display`). We check each pin independently so a half-wired
  // OLED (e.g. SDA landed but SCL forgotten) reports the precise gap.
  //
  // The board's SDA/SCL pin numbers come from the analog-pin table:
  // on Uno/Nano, A4 = SDA, A5 = SCL. We pick the last two entries (SDA is
  // one-before-last, SCL is last) so Mega + Pico still behave sensibly —
  // the exact pin mapping for those boards lives in the sim, not here,
  // but for Uno the rule is well-defined and that's the only board shipping
  // an OLED today.
  const i2cPinNumbers = getI2cPinNumbers(boardTarget);
  if (i2cPinNumbers) {
    for (const comp of simComponents) {
      const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties, customFootprints);
      const sda = pins.sda;
      const scl = pins.scl;
      if (!sda || !scl) continue; // not an I²C component

      const sdaConnected = isPinWiredToArduinoPin(sda, i2cPinNumbers.sda, wires);
      const sclConnected = isPinWiredToArduinoPin(scl, i2cPinNumbers.scl, wires);

      if (!sdaConnected) {
        issues.push({
          severity: "warning",
          category: "semantic",
          code: "MISSING_I2C_WIRING",
          path: `components[${comp.id}]`,
          message: `Component "${comp.id}" (${comp.type}) has an SDA pin that isn't wired to the board's SDA pin (A${i2cPinNumbers.sdaAnalogIndex}).`,
          suggestion: `Add a wire from "arduino.A${i2cPinNumbers.sdaAnalogIndex}" to "${comp.id}.sda".`,
        });
      }
      if (!sclConnected) {
        issues.push({
          severity: "warning",
          category: "semantic",
          code: "MISSING_I2C_WIRING",
          path: `components[${comp.id}]`,
          message: `Component "${comp.id}" (${comp.type}) has an SCL pin that isn't wired to the board's SCL pin (A${i2cPinNumbers.sclAnalogIndex}).`,
          suggestion: `Add a wire from "arduino.A${i2cPinNumbers.sclAnalogIndex}" to "${comp.id}.scl".`,
        });
      }
    }
  }

  // Sketch references a pin that has no wire. Catches "pinMode(13, OUTPUT)
  // with no LED wired to pin 13" — a classic head-scratcher.
  const pinsUsedBySketch = extractSketchPins(state.sketchCode, boardTarget);
  const pinsWiredToArduino = new Set<number>();
  for (const w of wires) {
    if (w.fromRow === -999 && isArduinoSignalPin(w.fromCol)) {
      pinsWiredToArduino.add(w.fromCol);
    }
    if (w.toRow === -999 && isArduinoSignalPin(w.toCol)) {
      pinsWiredToArduino.add(w.toCol);
    }
  }
  for (const pin of pinsUsedBySketch) {
    if (!pinsWiredToArduino.has(pin)) {
      issues.push({
        severity: "warning",
        category: "semantic",
        code: "PIN_NOT_WIRED",
        path: "sketch",
        message: `Sketch references pin ${pin} but no wire connects it to anything.`,
        suggestion: `Add a wire with \`from: "arduino.${pin}"\` or remove the unused pin reference.`,
      });
    }
  }

  return issues;
}

// ── I²C helpers ──────────────────────────────────────────────────────────
//
// Convention: on classic Arduino boards (Uno/Nano), SDA sits on A4 and SCL
// on A5. Mega routes I²C to dedicated pins (20/21) that aren't in the
// analog-pin table, so we return null and skip the check there until the
// sim teaches us otherwise — false positives are worse than no check at all.
type I2cPinNumbers = {
  sda: number;
  scl: number;
  sdaAnalogIndex: number;
  sclAnalogIndex: number;
};

function getI2cPinNumbers(boardTarget: BoardTarget): I2cPinNumbers | null {
  // Only enforce for boards where the I²C → analog-pin mapping is
  // well-defined in this codebase. Uno + Nano: SDA/SCL = A4/A5.
  if (boardTarget !== "arduino_uno" && boardTarget !== "arduino_nano") {
    return null;
  }
  const analogPins = getBoardAnalogPins(boardTarget);
  const sda = analogPins[4];
  const scl = analogPins[5];
  if (sda === undefined || scl === undefined) return null;
  return { sda, scl, sdaAnalogIndex: 4, sclAnalogIndex: 5 };
}

function isPinWiredToArduinoPin(
  componentPin: { row: number; col: number },
  arduinoPinNumber: number,
  wires: Wire[],
): boolean {
  return wires.some((w) => {
    const fromIsPin = w.fromRow === componentPin.row && w.fromCol === componentPin.col;
    const toIsPin = w.toRow === componentPin.row && w.toCol === componentPin.col;
    if (!fromIsPin && !toIsPin) return false;
    const other = fromIsPin
      ? { row: w.toRow, col: w.toCol }
      : { row: w.fromRow, col: w.fromCol };
    return other.row === -999 && other.col === arduinoPinNumber;
  });
}

// ── Sketch pin extraction (shallow regex) ────────────────────────────────
//
// Not a C++ parser — just matches the five pin-accepting functions that
// matter. Comments + string literals are stripped first so `// pinMode(13)`
// doesn't fire a false positive.

const SKETCH_PIN_CALL_REGEX =
  /\b(?:pinMode|digitalWrite|digitalRead|analogWrite|analogRead|attachInterrupt)\s*\(\s*([A-Za-z_]\w*|\d{1,2})\s*[,)]/g;

function extractSketchPins(sketch: string, boardTarget: BoardTarget): Set<number> {
  const stripped = stripCommentsAndStrings(sketch);
  const pins = new Set<number>();
  const analogPins = getBoardAnalogPins(boardTarget);

  let m: RegExpExecArray | null;
  while ((m = SKETCH_PIN_CALL_REGEX.exec(stripped)) !== null) {
    const token = m[1];
    const pin = tokenToPin(token, analogPins);
    if (pin !== null && isArduinoSignalPin(pin)) {
      pins.add(pin);
    }
  }

  // Named pin constants (LED_BUILTIN=13) are worth catching too.
  if (/\bLED_BUILTIN\b/.test(stripped)) pins.add(13);
  return pins;
}

function tokenToPin(token: string, analogPins: readonly number[]): number | null {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  const analog = token.match(/^A(\d+)$/i);
  if (analog) {
    const idx = parseInt(analog[1], 10);
    return analogPins[idx] ?? null;
  }
  // Variable names — can't resolve without semantic analysis. Skip.
  return null;
}

function isSketchEffectivelyEmpty(sketch: string): boolean {
  const stripped = stripCommentsAndStrings(sketch).trim();
  if (stripped.length === 0) return true;
  // Default stub produced by createDefaultBoardState — setup + loop both empty.
  return /void\s+setup\s*\(\s*\)\s*\{\s*\}\s*void\s+loop\s*\(\s*\)\s*\{\s*\}/.test(
    stripped.replace(/\s+/g, " "),
  );
}

function stripCommentsAndStrings(code: string): string {
  let out = "";
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === "/" && next === "/") {
      while (i < len && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < len && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < len && code[i] !== quote) {
        if (code[i] === "\\" && i + 1 < len) {
          i += 2;
          continue;
        }
        if (code[i] === "\n") out += "\n";
        i++;
      }
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
