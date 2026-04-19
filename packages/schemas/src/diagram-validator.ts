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
import { resolveComponentPins } from "./component-pins";
import { diagramToBoardState, type DiagramError } from "./diagram-adapter";

// ── Result types ──────────────────────────────────────────────────────────

export type DiagramIssueSeverity = "error" | "warning";
export type DiagramIssueCategory = "structural" | "semantic";

export type DiagramIssueCode =
  | "STRUCTURAL_ERROR"
  | "DANGLING_COMPONENT"
  | "PIN_NOT_WIRED"
  | "MISSING_GROUND"
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

export function validateDiagram(input: unknown): DiagramValidation {
  const structural = diagramToBoardState(input);
  if (!structural.ok) {
    return {
      ok: false,
      issues: structural.errors.map(structuralIssueFromError),
    };
  }

  const semantic = semanticIssues(structural.boardState);
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

function semanticIssues(state: BoardState): DiagramIssue[] {
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

  // Build a set of every (row, col) touched by any wire endpoint.
  const touchedPoints = new Set<string>();
  for (const w of wires) {
    touchedPoints.add(`${w.fromRow},${w.fromCol}`);
    touchedPoints.add(`${w.toRow},${w.toCol}`);
  }

  // Dangling component: none of the component's footprint points appear
  // in any wire endpoint.
  for (const comp of simComponents) {
    const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties);
    const entries = Object.entries(pins);
    if (entries.length === 0) continue; // nothing to check
    const touched = entries.some(([, pt]) =>
      touchedPoints.has(`${pt.row},${pt.col}`),
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
  // endpoint is at an Arduino GND (col -3/-4/-6) or a power_supply
  // negative anchor. Approximate (doesn't chase multi-hop jumper chains),
  // but catches the most common "forgot GND" mistake.
  const psuNegAnchors = new Set<string>();
  for (const c of simComponents) {
    if (c.type !== "power_supply") continue;
    psuNegAnchors.add(`${c.y + 1},${c.x}`); // canonical PSU negative anchor
  }

  for (const comp of simComponents) {
    const pins = resolveComponentPins(comp.type, comp.y, comp.x, comp.properties);
    const groundPinKey = Object.keys(pins).find((k) =>
      /^(gnd|ground|negative|cathode)$/.test(k),
    );
    if (!groundPinKey) continue;
    const gnd = pins[groundPinKey];
    if (!gnd) continue;

    const gndCoord = `${gnd.row},${gnd.col}`;
    const connectedToGround = wires.some((w) => {
      const fromIsPin = w.fromRow === gnd.row && w.fromCol === gnd.col;
      const toIsPin = w.toRow === gnd.row && w.toCol === gnd.col;
      if (!fromIsPin && !toIsPin) return false;
      const other = fromIsPin
        ? { row: w.toRow, col: w.toCol }
        : { row: w.fromRow, col: w.fromCol };
      // Arduino GND pins: fromRow === -999 AND col in {-3, -4, -6}
      if (other.row === -999 && (other.col === -3 || other.col === -4 || other.col === -6)) {
        return true;
      }
      // PSU negative anchor
      if (psuNegAnchors.has(`${other.row},${other.col}`)) return true;
      return false;
    });

    if (!connectedToGround) {
      // Only flag if there IS at least one wire touching the gnd pin —
      // otherwise DANGLING_COMPONENT already covers it.
      if (!touchedPoints.has(gndCoord)) continue;
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
