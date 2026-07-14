import type { ProjectFile } from "../../../db/schemas";
import type { BoardOp, BoardState, DreamerDiagramInput } from "@dreamer/schemas";
import {
  boardStateToDiagram,
  isBoardComponentType,
  resolveComponentPin,
  getComponentPinNames as getSharedPinNames,
} from "@dreamer/schemas";
import { boardTracker } from "../../../db/board-state-tracker";

// ── All component types (kept in sync with schema) ──────────────────────

export const ALL_COMPONENT_TYPES = [
  "led", "rgb_led", "button", "resistor", "capacitor", "ic",
  "potentiometer", "buzzer", "servo", "lcd_16x2", "seven_segment",
  "photoresistor", "temperature_sensor", "ultrasonic_sensor",
  "neopixel", "pir_sensor", "relay", "dc_motor", "dht_sensor",
  "ir_receiver", "shift_register", "oled_display",
] as const;

export const PIN_ROLE_VALUES = [
  "signal",
  "signal_input",
  "signal_output",
  "reference_ground",
  "reference_power",
  "ground_or_supply",
  "passive_series",
] as const;
export type PinRole = (typeof PIN_ROLE_VALUES)[number];

export function isSignalRole(role: PinRole): boolean {
  return role === "signal" || role === "signal_input" || role === "signal_output";
}
export function isGroundPin(pin: number): boolean {
  return pin === -3 || pin === -4 || pin === -6;
}
export function isPowerPin(pin: number): boolean {
  return pin === -1 || pin === -12 || pin === -2;
}
export function isSignalPin(pin: number): boolean {
  return pin >= 0;
}

// Pin names and pin-to-grid resolution now come from the shared canonical
// resolver in @dreamer/schemas/component-pins.ts. This ensures agreement
// between propose_circuit wire generation, power-budget-analyzer validation,
// and frontend breadboard-grid connectivity.

export function getComponentPinNames(type: string): string[] {
  return getSharedPinNames(type);
}

export function resolveComponentPinTarget(
  component: { type: string; x: number; y: number },
  pinName: string,
): { row: number; col: number } | null {
  return resolveComponentPin(component.type, component.y, component.x, pinName);
}

// ── Board state summary for system prompt injection ─────────────────────

export function formatArduinoPin(pin: number): string {
  if (pin === -1 || pin === -12) return "5V";
  if (pin === -2) return "3V3";
  if (pin === -3 || pin === -4 || pin === -6) return "GND";
  if (pin >= 14 && pin <= 19) return `A${pin - 14}`;
  return `D${pin}`;
}

export function summarizeSketchCode(sketch: string): string {
  const trimmed = sketch.trim();
  if (!trimmed) return "No sketch code.";

  const lines = trimmed.split(/\r?\n/).length;
  const includes = [...trimmed.matchAll(/#include\s*<([^>]+)>/g)].map((m) => m[1]);
  const pinModes = [...trimmed.matchAll(/pinMode\s*\(\s*([A-Za-z0-9_]+)\s*,\s*([A-Z_]+)/g)]
    .slice(0, 5)
    .map((m) => `${m[1]}=${m[2]}`);

  const features: string[] = [];
  if (/\banalogRead\s*\(/.test(trimmed)) features.push("analogRead");
  if (/\banalogWrite\s*\(/.test(trimmed)) features.push("analogWrite");
  if (/\bdigitalRead\s*\(/.test(trimmed)) features.push("digitalRead");
  if (/\bdigitalWrite\s*\(/.test(trimmed)) features.push("digitalWrite");
  if (/\bSerial\./.test(trimmed)) features.push("Serial");
  if (/\btone\s*\(/.test(trimmed)) features.push("tone");
  if (/\bdelay\s*\(/.test(trimmed)) features.push("delay");

  const parts = [`${lines} line(s)`];
  if (includes.length > 0) parts.push(`includes: ${includes.slice(0, 3).join(", ")}`);
  if (pinModes.length > 0) parts.push(`pinMode: ${pinModes.join(", ")}`);
  if (features.length > 0) parts.push(`uses: ${features.join(", ")}`);
  return parts.join(" | ");
}

export function summarizeBoardState(project: ProjectFile): string {
  // Prefer the project file's board state when present — it's the freshest
  // view, including any tentative mutations folded in by the delegation
  // tool's getWorkingProject(). Fall back to the tracker only when the
  // project file has no boardState attached.
  const board = project.boardState ?? boardTracker.get(project.project.id);
  if (!board) return "Board is empty — no components or wires.";

  // Derive the summary from the DSL so the shape agrees with the full read
  // tools (get_board_state / list_components / list_wires). Wire endpoints
  // use the same readable notation (`arduino.13`, `led1.anode`, `psu1.+`,
  // `grid.<r>,<c>`) agents see everywhere else.
  const diagram = boardStateToDiagram(board);
  const comps = diagram.components.filter((c) => !isBoardComponentType(c.type));
  const wires = diagram.wires;

  if (comps.length === 0 && wires.length === 0) {
    return "Board is empty — no components or wires.";
  }

  const lines: string[] = [];
  lines.push(`Components: ${comps.length}. Wires: ${wires.length}.`);

  // Display limits raised in v1.6.0: edit-mode runs that hit propose_fix
  // need to *see* the IDs they reference. Previously most boards exceeded
  // the cap and the agent hallucinated UUIDs because the real ones were
  // truncated out. ~24/32 covers >95% of stored runs with ~600 extra
  // tokens at the top end. The summary block is uncached anyway (split
  // from the cached system prompt in v1.5.0), so growing it does not
  // bust the prefix cache.
  const COMP_LIMIT = 24;
  const WIRE_LIMIT = 32;

  if (comps.length > 0) {
    lines.push("Components (use these exact IDs in propose_fix / wire references):");
    for (const c of comps.slice(0, COMP_LIMIT)) {
      const assignedPins = c.pins
        ? Object.entries(c.pins).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          )
        : [];
      const pinStr =
        assignedPins.length > 0
          ? ` pins: ${assignedPins.map(([k, v]) => `${k}=${formatArduinoPin(v)}`).join(", ")}`
          : "";
      const label = c.name ?? c.type;
      lines.push(
        `  - ${label} (${c.type}, id=${c.id}) at [${c.at[0]}, ${c.at[1]}]${pinStr}`,
      );
    }
    if (comps.length > COMP_LIMIT) {
      lines.push(`  - ... ${comps.length - COMP_LIMIT} more component(s)`);
    }
  }

  if (wires.length > 0) {
    // v1.6.0: include wire IDs inline so removeWires can reference them
    // without an extra list_wires roundtrip. id may be absent on wires
    // created before the schema gained the field — fall back to just
    // showing the endpoints in that case.
    lines.push("Wires (use these exact IDs in propose_fix.removeWires):");
    for (const w of wires.slice(0, WIRE_LIMIT)) {
      const idPart = w.id ? `${w.id}: ` : "";
      lines.push(`  - ${idPart}${w.from} → ${w.to} (${w.color})`);
    }
    if (wires.length > WIRE_LIMIT) {
      lines.push(`  - ... ${wires.length - WIRE_LIMIT} more wire(s)`);
    }
  }

  lines.push(`Sketch summary: ${summarizeSketchCode(diagram.sketch)}`);

  return lines.join("\n");
}

// ── ToolMode ────────────────────────────────────────────────────────────

export type ToolMode = "build" | "edit" | "all"

/**
 * Build mode (v1.5.0): propose_circuit + verify_circuit + the handful of
 * reads/writes the model actually picks. The trimmed surface dropped:
 *   - DSL tools (apply_design, validate_design) — kept as HTTP routes for
 *     paste-import/export round-tripping, but hidden from the agent.
 *   - CircuitProgram tools (generate/validate/compile/apply_circuit_program)
 *     — zero adoption across stored runs; competed with propose_circuit.
 *   - Redundant reads (get_board_overview/state/details/sketch_code) — the
 *     per-turn system block already inlines the board summary.
 *   - patch_sketch — never called; update_sketch covers the same job.
 *
 * Edit mode: granular tools for modifying existing circuits.
 *   No propose_circuit (would replace work), no place_component
 *   (use update_component for existing items).
 *
 * All: every tool. Used as fallback when mode is unclear.
 */
export const BUILD_MODE_TOOLS = new Set([
  "propose_circuit",
  // v1.5.1: propose_fix is now in the build surface too. propose_circuit's
  // attempt budget + board_not_empty guard force the agent to switch tools
  // for any follow-up work after the initial build; propose_fix is the
  // right destination (its remove/move ops are no-ops on an empty board,
  // its add/wire/sketch ops handle the touch-up case).
  "propose_fix",
  "verify_circuit",
  "update_sketch",
  "list_components",
  "list_wires",
  "analyze_power_budget",
])

export const EDIT_MODE_TOOLS = new Set([
  "get_board_overview",
  "list_components",
  "list_wires",
  "get_component_details",
  "get_sketch_code",
  "get_board_state",
  "analyze_power_budget",
  "get_wiring_guide",
  "validate_design",
  "apply_design",
  "place_component",
  "update_component",
  "move_component",
  "remove_component",
  "connect_wire",
  "wire_component_to_pin",
  "remove_wire",
  "update_wire",
  "update_sketch",
  "patch_sketch",
  "propose_fix",
  // v1.6.0: also available in edit mode so the agent can cross-check
  // sketch ↔ wired pins after propose_fix mutates the board.
  "verify_circuit",
  // Debug aid — lets the agent read Serial.println output when diagnosing
  // "why doesn't my sketch work" without rerunning the loop.
  "read_serial_monitor",
])

// ── Shared tool context ─────────────────────────────────────────────────

export type OpCtx = {
  projectId: string;
  sceneId: string;
  expectedVersion: number;
};

/**
 * Shared mutable state and helpers passed to each tool group factory.
 * `workingBoard` and `ops` are mutated in place by tool executors;
 * the same reference is shared across every group so reads see writes.
 */
export type ToolContext = {
  project: ProjectFile;
  workingBoard: BoardState;
  ops: BoardOp[];
  opCtx: OpCtx;
  /** Replace board state, push a load_board op, sync workingBoard. */
  commitBoardState(target: BoardState): Record<string, unknown>;
  /** Compile a diagram into a BoardState with sketch + structural validation. */
  buildBoardStateFromDiagram(
    input: DreamerDiagramInput | Omit<DreamerDiagramInput, "$schema">,
  ): { ok: true; boardState: BoardState } | { ok: false; error: Record<string, unknown> };
};

// ── Sketch failure tracking ─────────────────────────────────────────────

export type SketchFailureClass =
  | "pointer_reference"
  | "array_initializer"
  | "unsupported_feature"
  | "other";

/**
 * Cross-tool sketch recovery state. update_sketch / patch_sketch / propose_*
 * all share the same attempt budget so the agent can't escape the limiter
 * by switching tools. `formatError` / `noteFailureClass` / `clearTracking`
 * are the only mutators tools should reach for.
 */
export type SketchState = {
  readonly maxFixFailures: number;
  readonly maxConsecutiveSameFailures: number;
  fixValidationFailures: number;
  recoveryRequiredInBuild: boolean;
  recoveryAbandoned: boolean;
  lastFailureClass: SketchFailureClass | null;
  consecutiveSameFailureClass: number;
  formatError(check: { error?: string; line?: number }): string;
  noteFailureClass(check: { error?: string }): SketchFailureClass;
  clearTracking(): void;
};

export function createSketchState(): SketchState {
  const state: SketchState = {
    maxFixFailures: 2,
    maxConsecutiveSameFailures: 2,
    fixValidationFailures: 0,
    recoveryRequiredInBuild: false,
    recoveryAbandoned: false,
    lastFailureClass: null,
    consecutiveSameFailureClass: 0,
    formatError(check) {
      return `${check.error}${check.line ? ` (line ${check.line})` : ""}`;
    },
    noteFailureClass(check) {
      const failureClass = classifySketchFailure(check);
      if (failureClass === state.lastFailureClass) {
        state.consecutiveSameFailureClass += 1;
      } else {
        state.lastFailureClass = failureClass;
        state.consecutiveSameFailureClass = 1;
      }
      return failureClass;
    },
    clearTracking() {
      state.fixValidationFailures = 0;
      state.lastFailureClass = null;
      state.consecutiveSameFailureClass = 0;
    },
  };
  return state;
}

function classifySketchFailure(check: { error?: string }): SketchFailureClass {
  const msg = (check.error ?? "").toLowerCase();
  if (
    msg.includes("pass-by-reference") ||
    /\bpointer\b/.test(msg) ||
    msg.includes("->")
  ) {
    return "pointer_reference";
  }
  if (
    msg.includes("unexpected identifier") ||
    msg.includes("must have an initializer")
  ) {
    return "array_initializer";
  }
  if (msg.includes("not supported") || msg.includes("unsupported")) {
    return "unsupported_feature";
  }
  return "other";
}

// ── Working board sync helper ───────────────────────────────────────────

export function syncWorkingBoard(workingBoard: BoardState, target: BoardState): void {
  workingBoard.components = structuredClone(target.components);
  workingBoard.wires = structuredClone(target.wires);
  workingBoard.libraryState = structuredClone(target.libraryState);
  workingBoard.serialOutput = structuredClone(target.serialOutput);
  workingBoard.sketchCode = target.sketchCode;
  workingBoard.customLibraries = structuredClone(target.customLibraries);
  workingBoard.boardTarget = target.boardTarget;
  workingBoard.environment = structuredClone(target.environment);
}
