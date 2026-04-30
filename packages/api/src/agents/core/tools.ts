import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { BoardOp, BoardState, DreamerDiagramInput } from "@dreamer/schemas";
import {
  boardStateToDiagram,
  circuitProgramSchema,
  circuitProgramTemplateSchema,
  compileCircuitProgram,
  createDefaultBoardState,
  diagramToolInputSchema,
  diagramToBoardState,
  generateCircuitProgram,
  isBoardComponentType,
  resolveComponentPins,
  resolveComponentPin,
  validateCircuitProgram,
  validateDiagram,
  withDiagramSchemaVersion,
  getComponentPinNames as getSharedPinNames,
} from "@dreamer/schemas";
import { boardTracker } from "../../db/board-state-tracker";
import { makeBoardOp } from "../make-op";
import { analyzePowerBudget } from "../../electrical/power-budget-analyzer";
import { analyzeRoutingPolicy } from "../../electrical/routing-policy";
import { validateSketch } from "../../utils/sketch-validator";
import { WIRING_GUIDE_TEXT } from "./wiring-guide-text";

// ── All component types (kept in sync with schema) ──────────────────────

const ALL_COMPONENT_TYPES = [
  "led", "rgb_led", "button", "resistor", "capacitor", "ic",
  "potentiometer", "buzzer", "servo", "lcd_16x2", "seven_segment",
  "photoresistor", "temperature_sensor", "ultrasonic_sensor",
  "neopixel", "pir_sensor", "relay", "dc_motor", "dht_sensor",
  "ir_receiver", "shift_register", "oled_display",
] as const;

const PIN_ROLE_VALUES = [
  "signal",
  "signal_input",
  "signal_output",
  "reference_ground",
  "reference_power",
  "ground_or_supply",
  "passive_series",
] as const;
type PinRole = (typeof PIN_ROLE_VALUES)[number];

function isSignalRole(role: PinRole): boolean {
  return role === "signal" || role === "signal_input" || role === "signal_output";
}
function isGroundPin(pin: number): boolean {
  return pin === -3 || pin === -4 || pin === -6;
}
function isPowerPin(pin: number): boolean {
  return pin === -1 || pin === -2;
}
function isSignalPin(pin: number): boolean {
  return pin >= 0;
}

// Pin names and pin-to-grid resolution now come from the shared canonical
// resolver in @dreamer/schemas/component-pins.ts. This ensures agreement
// between propose_circuit wire generation, power-budget-analyzer validation,
// and frontend breadboard-grid connectivity.

function getComponentPinNames(type: string): string[] {
  return getSharedPinNames(type);
}

function resolveComponentPinTarget(
  component: { type: string; x: number; y: number },
  pinName: string,
): { row: number; col: number } | null {
  return resolveComponentPin(component.type, component.y, component.x, pinName);
}

// ── Board state summary for system prompt injection ─────────────────────

function formatArduinoPin(pin: number): string {
  if (pin === -1) return "5V";
  if (pin === -2) return "3V3";
  if (pin === -3 || pin === -4 || pin === -6) return "GND";
  if (pin >= 14 && pin <= 19) return `A${pin - 14}`;
  return `D${pin}`;
}

function summarizeSketchCode(sketch: string): string {
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

  if (comps.length > 0) {
    lines.push("Components:");
    for (const c of comps.slice(0, 8)) {
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
    if (comps.length > 8) {
      lines.push(`  - ... ${comps.length - 8} more component(s)`);
    }
  }

  if (wires.length > 0) {
    lines.push("Wires:");
    for (const w of wires.slice(0, 6)) {
      lines.push(`  - ${w.from} → ${w.to} (${w.color})`);
    }
    if (wires.length > 6) {
      lines.push(`  - ... ${wires.length - 6} more wire(s)`);
    }
  }

  lines.push(`Sketch summary: ${summarizeSketchCode(diagram.sketch)}`);

  return lines.join("\n");
}

// ── Core tools ──────────────────────────────────────────────────────────

export type ToolMode = "build" | "edit" | "all"

/**
 * Build mode: only propose_circuit + read tools.
 *   For new circuits — agent describes the whole thing in one call.
 *
 * Edit mode: granular tools for modifying existing circuits.
 *   No propose_circuit (would replace work), no place_component
 *   (use update_component for existing items).
 *
 * All: every tool. Used as fallback when mode is unclear.
 */
const BUILD_MODE_TOOLS = new Set([
  "get_board_overview",
  "list_components",
  "list_wires",
  "get_component_details",
  "get_sketch_code",
  "get_board_state",
  "analyze_power_budget",
  "get_wiring_guide",
  "generate_circuit_program",
  "validate_circuit_program",
  "compile_circuit_program",
  "apply_circuit_program",
  "propose_circuit",
  // validate_design is the prompt-documented dry-run gate for apply_design
  // ("validate-first workflow"). Must be in both mode sets so the agent
  // doesn't hallucinate an unknown-tool error when the prompt tells it to
  // validate before committing.
  "validate_design",
  "apply_design",
  "update_sketch",
  "patch_sketch",
])

const EDIT_MODE_TOOLS = new Set([
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
])

export function createCoreTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: BoardOp[];
  mode?: ToolMode;
  /**
   * Pre-existing mutable working board. If omitted, a fresh clone is made
   * from the project + tracker.
   */
  workingBoard?: BoardState;
}) {
  const { project, sceneId, ops, mode = "all" } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  // Working copy: prefer the one passed in (shared with delegation), else the
  // live tracker, else fall back to the project file.
  const trackedBoard = boardTracker.get(projectId);
  const workingBoard: BoardState = params.workingBoard ?? structuredClone(
    trackedBoard ?? project.boardState ?? createDefaultBoardState()
  );
  const MAX_SKETCH_FIX_FAILURES = 2;
  const MAX_CONSECUTIVE_SAME_LIMITATION_FAILURES = 2;
  const MAX_PROPOSE_FIX_ATTEMPTS = 5;
  let proposeFixAttempts = 0;
  let sketchFixValidationFailures = 0;
  let sketchRecoveryRequiredInBuild = false;
  /** Set to true when sketch recovery is exhausted — signals the agent to abandon and explain. */
  let sketchRecoveryAbandoned = false;
  let lastSketchFailureClass: "pointer_reference" | "array_initializer" | "unsupported_feature" | "other" | null = null;
  let consecutiveSameSketchFailureClass = 0;

  function formatSketchError(check: { error?: string; line?: number }): string {
    return `${check.error}${check.line ? ` (line ${check.line})` : ""}`;
  }

  function classifySketchFailure(check: { error?: string }): "pointer_reference" | "array_initializer" | "unsupported_feature" | "other" {
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

  function noteSketchFailureClass(check: { error?: string }): "pointer_reference" | "array_initializer" | "unsupported_feature" | "other" {
    const failureClass = classifySketchFailure(check);
    if (failureClass === lastSketchFailureClass) {
      consecutiveSameSketchFailureClass += 1;
    } else {
      lastSketchFailureClass = failureClass;
      consecutiveSameSketchFailureClass = 1;
    }
    return failureClass;
  }

  function clearSketchFailureTracking(): void {
    sketchFixValidationFailures = 0;
    lastSketchFailureClass = null;
    consecutiveSameSketchFailureClass = 0;
  }

  function syncWorkingBoard(target: BoardState): void {
    workingBoard.components = structuredClone(target.components);
    workingBoard.wires = structuredClone(target.wires);
    workingBoard.libraryState = structuredClone(target.libraryState);
    workingBoard.serialOutput = structuredClone(target.serialOutput);
    workingBoard.sketchCode = target.sketchCode;
    workingBoard.customLibraries = structuredClone(target.customLibraries);
    workingBoard.boardTarget = target.boardTarget;
    workingBoard.environment = structuredClone(target.environment);
  }

  function commitBoardState(target: BoardState): Record<string, unknown> {
    ops.push(
      makeBoardOp(opCtx, {
        kind: "load_board",
        payload: { state: target },
      }),
    );
    syncWorkingBoard(target);
    return {
      ok: true,
      componentCount: Object.keys(target.components).length,
      wireCount: Object.keys(target.wires).length,
      sketchBytes: target.sketchCode.length,
      boardTarget: target.boardTarget,
      customLibraries: Object.keys(target.customLibraries).length,
      obstacleCount: Object.keys(target.environment.obstacles).length,
      boundaryEnabled: target.environment.boundaryEnabled,
    };
  }

  function buildBoardStateFromDiagram(input: DreamerDiagramInput | Omit<DreamerDiagramInput, "$schema">):
    | { ok: true; boardState: BoardState }
    | { ok: false; error: Record<string, unknown> } {
    const result = diagramToBoardState(withDiagramSchemaVersion(input));
    if (!result.ok) {
      return {
        ok: false,
        error: {
          error: "Diagram validation failed",
          issues: result.errors.map((entry) => ({
            path: entry.path,
            message: entry.message,
            suggestion: entry.suggestion,
          })),
        },
      };
    }

    if (result.boardState.sketchCode) {
      const check = validateSketch(result.boardState.sketchCode);
      if (!check.valid) {
        return {
          ok: false,
          error: {
            error: `Sketch validation failed: ${check.error}${check.line ? ` (line ${check.line})` : ""}`,
          },
        };
      }
    }

    return { ok: true, boardState: result.boardState };
  }

  const allTools = {
    // ── Read ────────────────────────────────────────────────────────

    get_board_overview: tool({
      description: "Cheap summary of the board: component count, key IDs, representative wires, and a short sketch summary. Prefer this before get_board_state.",
      inputSchema: z.object({}),
      execute: async () => ({
        summary: summarizeBoardState({ ...project, boardState: workingBoard }),
      }),
    }),

    list_components: tool({
      description: "List components as DiagramComponent[] (DSL shape): { id, type, at: [x,y], rotation, name?, pins?, properties }. Arduino board itself is filtered out. Much cheaper than get_board_state.",
      inputSchema: z.object({}),
      execute: async () => ({
        components: boardStateToDiagram(workingBoard).components.filter(
          (c) => !isBoardComponentType(c.type),
        ),
      }),
    }),

    list_wires: tool({
      description: "List wires as DiagramWire[] (DSL shape) with readable endpoint strings: `arduino.<pin>`, `<componentId>.<pinName>`, `<psuId>.+/-`, or `grid.<row>,<col>`. Use when you need wiring detail without the full board payload.",
      inputSchema: z.object({}),
      execute: async () => ({
        wires: boardStateToDiagram(workingBoard).wires,
      }),
    }),

    get_component_details: tool({
      description: "Fetch one component by id, including its pins and properties.",
      inputSchema: z.object({
        componentId: z.string(),
      }),
      execute: async (input) => {
        const component = workingBoard.components[input.componentId];
        if (!component) {
          return { error: `Component ${input.componentId} not found.` };
        }
        return { component };
      },
    }),

    get_sketch_code: tool({
      description: "Read the full sketch code. Use only when you need the exact code, not just a summary.",
      inputSchema: z.object({}),
      execute: async () => ({
        sketchCode: workingBoard.sketchCode ?? "",
      }),
    }),

    get_board_state: tool({
      description: "Full board as a DreamerDiagram (DSL v1) — same shape apply_design accepts. Returns { $schema, board, sketch, components[], wires[], environment?, customLibraries? }. Expensive. Prefer get_board_overview, list_components, list_wires, get_component_details, or get_sketch_code first.",
      inputSchema: z.object({}),
      execute: async () => {
        return boardStateToDiagram(workingBoard);
      },
    }),

    analyze_power_budget: tool({
      description: "Analyze electrical safety and power budget: per-pin load, rail load, and whether external supply is required.",
      inputSchema: z.object({}),
      execute: async () => {
        const report = analyzePowerBudget(workingBoard);
        return {
          safe: report.issues.every((issue) => issue.severity !== "error"),
          report,
        };
      },
    }),

    get_wiring_guide: tool({
      description: "Reference: wiring rules, component footprints, pin names. Call once before placing/wiring if unsure.",
      inputSchema: z.object({}),
      execute: async () => ({ guide: WIRING_GUIDE_TEXT }),
    }),

    generate_circuit_program: tool({
      description: `Generate a canonical CircuitProgram v1 from a higher-level circuit plan. Use this when you know the modules, pin roles, and sketch intent, but want the tool to fill in nets, semantic labels, edit handles, default component profiles, example references, and runtime behavior contracts.

Pass the plan body directly. If program.nets is omitted, the tool derives nets by grouping module pins that share the same pinIntent.net string.

This does NOT mutate the board. It returns { program } for the next validate/compile/apply step.`,
      inputSchema: circuitProgramTemplateSchema,
      execute: async (input) => {
        const program = generateCircuitProgram(input);
        return {
          ok: true,
          program,
          moduleCount: program.program.modules.length,
          netCount: program.program.nets.length,
          behaviorCount: program.profiles.behaviors.length,
        };
      },
    }),

    validate_circuit_program: tool({
      description: `Validate a CircuitProgram v1 without mutating the board. Checks module references, pin names, Arduino pin tokens, net membership, and behavior/runtime constraints such as analog-capable pins, PWM-capable pins, Servo.h guidance, and WS2812 library guidance.

Pass the full CircuitProgram body directly. Returns { ok, errors[], warnings[], normalizedProgram }.`,
      inputSchema: circuitProgramSchema,
      execute: async (input) => {
        const result = validateCircuitProgram(input);
        return {
          ok: result.ok,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
          errors: result.errors,
          warnings: result.warnings,
          normalizedProgram: result.program,
        };
      },
    }),

    compile_circuit_program: tool({
      description: `Compile a CircuitProgram v1 into a DreamerDiagram plus runtime behavior contracts, without mutating the board. Use this to inspect the exact compiled board layout and wiring before applying.

Returns { ok, diagram, runtimeContracts, errors[], warnings[] }.`,
      inputSchema: circuitProgramSchema,
      execute: async (input) => {
        const result = compileCircuitProgram(input);
        return {
          ok: result.ok,
          diagram: result.diagram,
          runtimeContracts: result.runtimeContracts ?? [],
          errors: result.errors,
          warnings: result.warnings,
        };
      },
    }),

    apply_circuit_program: tool({
      description: `Build a circuit from a CircuitProgram v1. This is the CircuitProgram-first whole-board path.

Workflow inside the tool:
1. validate the CircuitProgram
2. compile it to a DreamerDiagram
3. run the same diagram import + sketch validation gate used by apply_design
4. replace the board atomically with one load_board op

Use this for new builds or full rebuilds. For explicit pasted DreamerDiagram payloads, use apply_design instead. For small edits on an existing board, prefer propose_fix or the granular CRUD tools.`,
      inputSchema: circuitProgramSchema,
      execute: async (input) => {
        const compiled = compileCircuitProgram(input);
        if (!compiled.ok || !compiled.diagram) {
          return {
            ok: false,
            error: "CircuitProgram compilation failed",
            errors: compiled.errors,
            warnings: compiled.warnings,
          };
        }

        const prepared = buildBoardStateFromDiagram(compiled.diagram);
        if (!prepared.ok) return prepared.error;

        return {
          ...commitBoardState(prepared.boardState),
          runtimeContracts: compiled.runtimeContracts ?? [],
          compileWarnings: compiled.warnings,
        };
      },
    }),

    // ── Component CRUD ──────────────────────────────────────────────

    place_component: tool({
      description: "Place a component on the breadboard. Set all pins to null — wiring determines connections.",
      inputSchema: z.object({
        type: z.enum(ALL_COMPONENT_TYPES),
        name: z.string().describe("Display name"),
        x: z.number().int().min(0).max(9).describe("Column (0-9)"),
        y: z.number().int().min(0).max(29).describe("Row (0-29)"),
        rotation: z.number().int().min(0).max(3).optional(),
        pins: z.record(z.string(), z.number().nullable()).describe("Pin map — set all to null"),
        properties: z.record(z.string(), z.unknown()).optional().describe("E.g. {resistance: 220, color: '#ef4444'}"),
      }),
      execute: async (input) => {
        // Check for overlap against working state (includes this turn's placements)
        const existing = Object.values(workingBoard.components);
        const overlap = existing.find(
          (c) => c.type !== "arduino_uno" && c.x === input.x && c.y === input.y,
        );
        if (overlap) {
          return {
            error: `Position (row=${input.y}, col=${input.x}) is already occupied by ${overlap.name} (${overlap.id.slice(0, 8)}). Choose a different position.`,
          };
        }

        const componentId = crypto.randomUUID();
        const component = {
          id: componentId,
          type: input.type,
          name: input.name,
          x: input.x,
          y: input.y,
          rotation: input.rotation ?? 0,
          pins: input.pins,
          properties: input.properties ?? {},
        };

        ops.push(
          makeBoardOp(opCtx, {
            kind: "place_component",
            payload: { component },
          })
        );

        // Update working state so subsequent reads see this component
        workingBoard.components[componentId] = component as typeof workingBoard.components[string];

        return { componentId, name: input.name, type: input.type };
      },
    }),

    update_component: tool({
      description: "Update a component's name, pins, or properties.",
      inputSchema: z.object({
        componentId: z.string(),
        changes: z.object({
          name: z.string().optional(),
          pins: z.record(z.string(), z.number().nullable()).optional(),
          properties: z.record(z.string(), z.unknown()).optional(),
        }),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        ops.push(
          makeBoardOp(opCtx, {
            kind: "update_component",
            payload: {
              componentId: input.componentId,
              changes: input.changes,
            },
          })
        );

        // Update working state
        if (input.changes.name) comp.name = input.changes.name;
        if (input.changes.pins) Object.assign(comp.pins, input.changes.pins);
        if (input.changes.properties) Object.assign(comp.properties, input.changes.properties);

        return { updated: input.componentId, changes: input.changes };
      },
    }),

    move_component: tool({
      description: "Move a component to a new position.",
      inputSchema: z.object({
        componentId: z.string(),
        x: z.number().int().min(0).max(9).describe("Column"),
        y: z.number().int().min(0).max(29).describe("Row"),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        // Check overlap at target position
        const overlap = Object.values(workingBoard.components).find(
          (c) => c.type !== "arduino_uno" && c.id !== input.componentId && c.x === input.x && c.y === input.y,
        );
        if (overlap) {
          return { error: `Position (row=${input.y}, col=${input.x}) is occupied by ${overlap.name}.` };
        }

        ops.push(
          makeBoardOp(opCtx, {
            kind: "move_component",
            payload: { componentId: input.componentId, x: input.x, y: input.y },
          })
        );

        comp.x = input.x;
        comp.y = input.y;

        return { moved: input.componentId, x: input.x, y: input.y };
      },
    }),

    remove_component: tool({
      description: "Remove a component. Returns any orphaned wires to clean up.",
      inputSchema: z.object({
        componentId: z.string(),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        ops.push(
          makeBoardOp(opCtx, {
            kind: "remove_component",
            payload: { componentId: input.componentId },
          })
        );

        // Find orphaned wires
        const wires = Object.values(workingBoard.wires);
        const orphanedWires = wires.filter(
          (w) =>
            (w.toRow === comp.y && w.toCol === comp.x) ||
            (w.fromRow === comp.y && w.fromCol === comp.x),
        );

        delete workingBoard.components[input.componentId];

        return {
          removed: input.componentId,
          orphanedWires: orphanedWires.map((w) => ({ id: w.id, color: w.color })),
          hint: orphanedWires.length > 0
            ? `${orphanedWires.length} wire(s) may be orphaned. Consider removing them with remove_wire.`
            : undefined,
        };
      },
    }),

    // ── Wire CRUD ───────────────────────────────────────────────────

    connect_wire: tool({
      description: "Add a wire. Arduino pin: fromRow=-999, fromCol=pin# (D13=13, A0=14, 5V=-1, GND=-3).",
      inputSchema: z.object({
        fromRow: z.number().describe("-999 for Arduino pin"),
        fromCol: z.number().describe("Pin# if fromRow=-999"),
        toRow: z.number(),
        toCol: z.number(),
        color: z.string().optional().describe("Hex color"),
      }),
      execute: async (input) => {
        const wireId = crypto.randomUUID();
        const wire = {
          id: wireId,
          fromRow: input.fromRow,
          fromCol: input.fromCol,
          toRow: input.toRow,
          toCol: input.toCol,
          color: input.color ?? "#22c55e",
        };
        ops.push(makeBoardOp(opCtx, { kind: "connect_wire", payload: { wire } }));
        workingBoard.wires[wireId] = wire;
        return { wireId };
      },
    }),

    wire_component_to_pin: tool({
      description: "Wire a specific logical component pin to an Arduino pin by component ID.",
      inputSchema: z.object({
        componentId: z.string(),
        arduinoPin: z.number().describe("Pin# (-1=5V, -3=GND, 0-19=digital/analog)"),
        componentPin: z.string().describe("Logical pin name on the component, e.g. anode/cathode, a/b, signal/vcc/gnd."),
        color: z.string().optional(),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        const allowedPins = getComponentPinNames(comp.type);
        if (allowedPins.length === 0) {
          return { error: `Component type "${comp.type}" does not expose logical pins for wire_component_to_pin.` };
        }
        if (!allowedPins.includes(input.componentPin)) {
          return {
            error: `Invalid pin "${input.componentPin}" for ${comp.type}. Allowed: ${allowedPins.join(", ")}`,
          };
        }
        const target = resolveComponentPinTarget(comp, input.componentPin);
        if (!target) {
          return { error: `Unable to resolve pin target for ${comp.type}.${input.componentPin}` };
        }

        const wireId = crypto.randomUUID();
        const wire = {
          id: wireId,
          fromRow: -999,
          fromCol: input.arduinoPin,
          toRow: target.row,
          toCol: target.col,
          color: input.color ?? "#22c55e",
        };
        ops.push(makeBoardOp(opCtx, { kind: "connect_wire", payload: { wire } }));
        workingBoard.wires[wireId] = wire;
        return {
          wireId,
          from: `Arduino pin ${input.arduinoPin}`,
          to: `${comp.name}.${input.componentPin} at row=${target.row} col=${target.col}`,
        };
      },
    }),

    remove_wire: tool({
      description: "Remove a wire by ID.",
      inputSchema: z.object({
        wireId: z.string(),
      }),
      execute: async (input) => {
        if (!workingBoard.wires[input.wireId]) {
          return { error: `Wire ${input.wireId} not found.` };
        }
        ops.push(makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId: input.wireId } }));
        delete workingBoard.wires[input.wireId];
        return { removed: input.wireId };
      },
    }),

    update_wire: tool({
      description: "Move a wire endpoint.",
      inputSchema: z.object({
        wireId: z.string(),
        endpoint: z.enum(["from", "to"]),
        row: z.number(),
        col: z.number(),
      }),
      execute: async (input) => {
        const wire = workingBoard.wires[input.wireId];
        if (!wire) {
          return { error: `Wire ${input.wireId} not found.` };
        }

        const changes = input.endpoint === "from"
          ? { fromRow: input.row, fromCol: input.col }
          : { toRow: input.row, toCol: input.col };

        // We don't have an update_wire op kind, so remove + re-add
        ops.push(
          makeBoardOp(opCtx, {
            kind: "remove_wire",
            payload: { wireId: input.wireId },
          })
        );
        const newWireId = crypto.randomUUID();
        ops.push(
          makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: newWireId,
                fromRow: changes.fromRow ?? wire.fromRow,
                fromCol: changes.fromCol ?? wire.fromCol,
                toRow: changes.toRow ?? wire.toRow,
                toCol: changes.toCol ?? wire.toCol,
                color: wire.color,
              },
            },
          })
        );

        // Update working state
        delete workingBoard.wires[input.wireId];
        workingBoard.wires[newWireId] = {
          id: newWireId,
          fromRow: changes.fromRow ?? wire.fromRow,
          fromCol: changes.fromCol ?? wire.fromCol,
          toRow: changes.toRow ?? wire.toRow,
          toCol: changes.toCol ?? wire.toCol,
          color: wire.color,
        };

        return { oldWireId: input.wireId, newWireId, endpoint: input.endpoint };
      },
    }),

    // ── Sketch ──────────────────────────────────────────────────────

    update_sketch: tool({
      description: "Replace the full Arduino sketch. For small edits, use patch_sketch. Code is validated before accepting.",
      inputSchema: z.object({
        code: z.string(),
      }),
      execute: async (input) => {
        if (sketchRecoveryAbandoned) {
          return {
            error: "Sketch recovery is already abandoned for this run. Do not retry update_sketch.",
            blocked: true,
            abandoned: true,
            failureKind: "sketch_fix_attempt_limit",
            nextStep: "STOP retrying sketch fixes in this run. Explain the transpiler limitation and ask for a simpler/manual sketch.",
          };
        }
        const check = validateSketch(input.code);
        if (!check.valid) {
          const failureClass = noteSketchFailureClass(check);
          sketchFixValidationFailures += 1;
          if (
            sketchFixValidationFailures >= MAX_SKETCH_FIX_FAILURES ||
            consecutiveSameSketchFailureClass >= MAX_CONSECUTIVE_SAME_LIMITATION_FAILURES
          ) {
            sketchRecoveryAbandoned = true;
            sketchRecoveryRequiredInBuild = mode === "build";
            return {
              error: `Sketch fix attempt budget exceeded (${MAX_SKETCH_FIX_FAILURES}). Last error: ${formatSketchError(check)}.`,
              blocked: true,
              abandoned: true,
              failureKind: "sketch_fix_attempt_limit",
              limiter: `repeated_${failureClass}`,
              nextStep: "STOP trying to fix the sketch. Explain to the user what went wrong and what they can try manually.",
            };
          }
          return {
            error: `Sketch has errors: ${formatSketchError(check)}. Fix the code and retry.`,
            failureKind: "sketch_validation",
            attemptsRemaining: MAX_SKETCH_FIX_FAILURES - sketchFixValidationFailures,
          };
        }
        clearSketchFailureTracking();
        sketchRecoveryRequiredInBuild = false;
        sketchRecoveryAbandoned = false;
        ops.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: input.code } }));
        workingBoard.sketchCode = input.code;
        return { updated: true, codeLength: input.code.length };
      },
    }),

    patch_sketch: tool({
      description: "Edit a line range of the sketch.",
      inputSchema: z.object({
        startLine: z.number().int().min(1).describe("First line (1-based)"),
        endLine: z.number().int().min(1).describe("Last line (inclusive)"),
        newCode: z.string(),
      }),
      execute: async (input) => {
        if (sketchRecoveryAbandoned) {
          return {
            error: "Sketch recovery is already abandoned for this run. Do not retry patch_sketch.",
            blocked: true,
            abandoned: true,
            failureKind: "sketch_fix_attempt_limit",
            nextStep: "STOP retrying sketch fixes in this run. Explain the transpiler limitation and ask for a simpler/manual sketch.",
          };
        }
        const currentCode = workingBoard.sketchCode ?? "";
        const lines = currentCode.split("\n");

        if (input.startLine > lines.length + 1) {
          return { error: `Start line ${input.startLine} is beyond end of file (${lines.length} lines).` };
        }

        const before = lines.slice(0, input.startLine - 1);
        const after = lines.slice(input.endLine);
        const patched = [...before, input.newCode, ...after].join("\n");

        const check = validateSketch(patched);
        if (!check.valid) {
          const failureClass = noteSketchFailureClass(check);
          sketchFixValidationFailures += 1;
          if (
            sketchFixValidationFailures >= MAX_SKETCH_FIX_FAILURES ||
            consecutiveSameSketchFailureClass >= MAX_CONSECUTIVE_SAME_LIMITATION_FAILURES
          ) {
            sketchRecoveryAbandoned = true;
            sketchRecoveryRequiredInBuild = mode === "build";
            return {
              error: `Sketch fix attempt budget exceeded (${MAX_SKETCH_FIX_FAILURES}). Last error: ${formatSketchError(check)}.`,
              blocked: true,
              abandoned: true,
              failureKind: "sketch_fix_attempt_limit",
              limiter: `repeated_${failureClass}`,
              nextStep: "STOP trying to fix the sketch. Explain to the user what went wrong and what they can try manually.",
            };
          }
          return {
            error: `Patched sketch has errors: ${formatSketchError(check)}. Fix and retry.`,
            failureKind: "sketch_validation",
            attemptsRemaining: MAX_SKETCH_FIX_FAILURES - sketchFixValidationFailures,
          };
        }

        clearSketchFailureTracking();
        sketchRecoveryRequiredInBuild = false;
        sketchRecoveryAbandoned = false;
        ops.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: patched } }));
        workingBoard.sketchCode = patched;

        return {
          updated: true,
          linesReplaced: input.endLine - input.startLine + 1,
          newCodeLength: patched.length,
        };
      },
    }),

    // ── validate_design ─────────────────────────────────────────
    //
    // Dry-run checker — runs the same structural + semantic validator
    // `apply_design` does, but commits no ops. Returns the full issue
    // list so the LLM can correct a diagram before actually applying.
    validate_design: tool({
      description: `Validate a DreamerDiagram (DSL v1) WITHOUT applying it. Runs structural checks (pin names, component types, wire endpoints) AND semantic checks (dangling components, sketch pins not wired, missing GND, empty sketch). Returns an ok flag + issues[] with severity/category/code/path/message.

Call this BEFORE apply_design when generating a new diagram — it tells you exactly what to fix without touching the board.

Note: pass the diagram body directly ({ board, sketch, components, wires, ... }). Do NOT include a "$schema" field in the tool args — it's injected automatically.`,
      inputSchema: diagramToolInputSchema,
      execute: async (input) => {
        const result = validateDiagram(withDiagramSchemaVersion(input));
        return {
          ok: result.ok,
          errorCount: result.issues.filter((i) => i.severity === "error").length,
          warningCount: result.issues.filter((i) => i.severity === "warning").length,
          issues: result.issues.map((i) => ({
            severity: i.severity,
            category: i.category,
            code: i.code,
            path: i.path,
            message: i.message,
            suggestion: i.suggestion,
          })),
        };
      },
    }),

    // ── apply_design ─────────────────────────────────────────────
    //
    // Accepts a full DreamerDiagram (DSL v1) and REPLACES the board with
    // it in one call. Use for scratch generation or wholesale restructure.
    // For small edits, use the granular tools (place_component, connect_wire,
    // update_sketch). On validation failure returns structured errors so
    // the agent can self-correct in a follow-up tool call.
    apply_design: tool({
      description: `Replace the entire board with a DreamerDiagram (DSL v1). Use for scratch generation or whole-project restructure.

Tool-arg shape: { board?, sketch, components[], wires[], environment?, customLibraries? }
  Do NOT include a "$schema" field in the tool args — it's injected automatically. (The canonical DSL seen in chat-displayed \`dreamer-diagram\` blocks and pasted payloads still carries "$schema": "dreamer-diagram-v1"; only the tool-input layer omits it.)

Wire endpoints are strings — readable instead of grid coordinates:
  - "arduino.13", "arduino.A0", "arduino.GND", "arduino.5V", "arduino.3V3"
  - "<componentId>.<pinName>" — e.g. "led1.anode", "servo1.signal", "lcd1.rs"
  - "<psuId>.+" / "<psuId>.-" for power-supply rails
  - "grid.<row>,<col>" as escape hatch

Components use { id, type, at: [x, y], rotation?, properties? }. Pin assignments are optional — wire topology resolves them.

This REMOVES every existing component + wire and installs the new design. For incremental edits, prefer place_component / connect_wire / update_sketch.`,
      inputSchema: diagramToolInputSchema,
      execute: async (input) => {
        const prepared = buildBoardStateFromDiagram(input);
        if (!prepared.ok) return prepared.error;
        return commitBoardState(prepared.boardState);
      },
    }),

    // ── Plan-then-execute: propose_circuit ────────────────────────
    //
    // The model describes WHAT it wants (component types + wire connections).
    // The tool handles HOW (positioning, ID generation, validation, wiring).
    // No UUIDs, no grid coordinates — eliminates hallucination.

    propose_circuit: tool({
      description: `Build an entire circuit in one call. Describe components and wires — the tool handles positioning, IDs, and validation automatically.

Components: list type + name + properties. They'll be auto-positioned on the breadboard.
  - Each component MUST include pinRoles for every logical pin it exposes.
Wires: reference components by their INDEX in the components array (0, 1, 2...).
  - Every wire MUST specify a logical target pin via "toPin" (e.g. anode/cathode, a/b, signal/vcc/gnd).
  - For LED circuits: pair each LED with a resistor — the tool wires LED→resistor→GND correctly.
Sketch: provide full Arduino sketch code.

Example — LED blink:
  components: [{type:"led", name:"LED"}, {type:"resistor", name:"R1", properties:{resistance:220}}]
  wires: [{arduinoPin:13, toComponent:0, toPin:"anode"}]
  ledResistorPairs: [{ledIndex:0, resistorIndex:1}]
  sketch: "void setup(){...}"`,

      inputSchema: z.object({
        components: z.array(z.object({
          type: z.enum(ALL_COMPONENT_TYPES),
          name: z.string(),
          properties: z.record(z.string(), z.unknown()).optional(),
          pinRoles: z.record(z.string(), z.enum(PIN_ROLE_VALUES))
            .describe("Required: role for every logical pin on this component. Roles: signal/signal_input/signal_output/reference_ground/reference_power/ground_or_supply/passive_series."),
        })).describe("Components to place. Referenced by array index in wires."),

        wires: z.array(z.object({
          arduinoPin: z.number().describe("Arduino pin number (D0-D13=0-13, A0-A5=14-19, 5V=-1, GND=-3)"),
          toComponent: z.number().int().min(0).describe("Index into components array"),
          toPin: z.string().describe("Logical target pin on that component (required)."),
          color: z.string().optional(),
          pinOffset: z.number().int().optional().describe("Deprecated fallback offset. Prefer toPin."),
          // Series routing: route signal through an intermediate component (e.g., resistor)
          throughComponent: z.number().int().min(0).optional()
            .describe("Index of intermediate component to route through (e.g., a series resistor between Arduino pin and target)"),
          throughEntryPin: z.string().optional()
            .describe("Pin on the intermediate component where signal enters (e.g., 'b' for resistor right side)"),
          throughExitPin: z.string().optional()
            .describe("Pin on the intermediate component where signal exits toward the target (e.g., 'a' for resistor left side)"),
        })).describe("Wires from Arduino pins to components. Use throughComponent for series routing (e.g., resistor in series with a display segment)."),

        ledResistorPairs: z.array(z.object({
          ledIndex: z.number().int().min(0).describe("Index of LED in components array"),
          resistorIndex: z.number().int().min(0).describe("Index of its series resistor"),
        })).optional().describe("LED+resistor pairs — tool auto-wires cathode→resistor→GND"),

        sketch: z.string().optional().describe("Complete Arduino sketch code"),
      }),

      execute: async (input) => {
        const workingBoardSnapshot = structuredClone(workingBoard);
        function restoreWorkingBoardSnapshot() {
          workingBoard.components = structuredClone(workingBoardSnapshot.components);
          workingBoard.wires = structuredClone(workingBoardSnapshot.wires);
          workingBoard.libraryState = structuredClone(workingBoardSnapshot.libraryState);
          workingBoard.serialOutput = structuredClone(workingBoardSnapshot.serialOutput);
          workingBoard.sketchCode = workingBoardSnapshot.sketchCode;
          workingBoard.customLibraries = structuredClone(workingBoardSnapshot.customLibraries);
          workingBoard.boardTarget = workingBoardSnapshot.boardTarget;
        }

        if (mode === "build" && sketchRecoveryAbandoned) {
          return {
            success: false,
            blocked: true,
            abandoned: true,
            failureKind: "sketch_fix_attempt_limit",
            errors: [
              "Sketch recovery is exhausted for this run. Do not retry propose_circuit with new sketch variants in this turn.",
            ],
            nextStep: "Stop retrying. Ask user to simplify the sketch or provide a transpiler-safe version.",
          };
        }
        if (mode === "build" && sketchRecoveryRequiredInBuild) {
          return {
            success: false,
            blocked: true,
            failureKind: "sketch_recovery_required",
            errors: [
              "Build is paused on sketch recovery. Use update_sketch or patch_sketch to submit a valid sketch before calling propose_circuit again.",
            ],
          };
        }

        const errors: string[] = [];

        // Validate component pinRoles coverage and basic role semantics.
        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i]!;
          const allowedPins = getComponentPinNames(comp.type);
          const roleKeys = Object.keys(comp.pinRoles ?? {});
          const missing = allowedPins.filter((p) => !(p in comp.pinRoles));
          const extras = roleKeys.filter((k) => !allowedPins.includes(k));
          if (missing.length > 0) {
            errors.push(
              `Component ${i} (${comp.type}) is missing pinRoles for: ${missing.join(", ")}.`,
            );
          }
          if (extras.length > 0) {
            errors.push(
              `Component ${i} (${comp.type}) has invalid pinRoles keys: ${extras.join(", ")}.`,
            );
          }

          if (comp.type === "button") {
            const aRole = comp.pinRoles.a as PinRole | undefined;
            const bRole = comp.pinRoles.b as PinRole | undefined;
            const aSignal = !!aRole && isSignalRole(aRole);
            const bSignal = !!bRole && isSignalRole(bRole);
            const aRef = aRole === "reference_ground" || aRole === "reference_power";
            const bRef = bRole === "reference_ground" || bRole === "reference_power";
            if (!((aSignal && bRef) || (bSignal && aRef))) {
              errors.push(
                `Component ${i} (button) pinRoles invalid: one side must be signal and the opposite side must be reference_ground/reference_power.`,
              );
            }
          }

        }

        // Validate indices
        const usedTargetPins = new Set<string>();
        for (const wire of input.wires) {
          if (wire.toComponent >= input.components.length) {
            errors.push(`Wire references component index ${wire.toComponent} but only ${input.components.length} components defined.`);
            continue;
          }
          const compType = input.components[wire.toComponent]?.type;
          const allowedPins = getComponentPinNames(compType);
          if (allowedPins.length === 0) {
            errors.push(`Component ${wire.toComponent} (${compType}) does not expose logical pins for toPin wiring.`);
            continue;
          }
          if (!wire.toPin) {
            errors.push(`Wire to component ${wire.toComponent} is missing toPin. Use explicit logical pins.`);
            continue;
          }
          if (!allowedPins.includes(wire.toPin)) {
            errors.push(`Invalid toPin "${wire.toPin}" for component ${wire.toComponent} (${compType}). Allowed: ${allowedPins.join(", ")}`);
            continue;
          }
          const targetRole = input.components[wire.toComponent]?.pinRoles?.[wire.toPin] as PinRole | undefined;
          if (!targetRole) {
            errors.push(`Wire target ${wire.toComponent}.${wire.toPin} is missing pinRoles metadata.`);
            continue;
          }
          if (targetRole === "reference_ground" && !isGroundPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects ground reference but got pin ${wire.arduinoPin}.`);
          }
          if (targetRole === "reference_power" && !isPowerPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects power reference but got pin ${wire.arduinoPin}.`);
          }
          if (targetRole === "ground_or_supply" && !isGroundPin(wire.arduinoPin) && !isPowerPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects ground/power reference but got signal pin ${wire.arduinoPin}.`);
          }
          if (isSignalRole(targetRole) && !isSignalPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects signal pin but got reference pin ${wire.arduinoPin}.`);
          }
          const pinKey = `${wire.toComponent}:${wire.toPin}`;
          if (usedTargetPins.has(pinKey)) {
            errors.push(`Duplicate pin target ${pinKey}. Each logical component pin can only be connected once in propose_circuit.`);
          } else {
            usedTargetPins.add(pinKey);
          }

          // Validate throughComponent (series routing)
          if (wire.throughComponent !== undefined) {
            if (wire.throughComponent >= input.components.length) {
              errors.push(`Wire throughComponent index ${wire.throughComponent} out of range.`);
            } else {
              const throughType = input.components[wire.throughComponent]?.type;
              const throughPins = getComponentPinNames(throughType);
              if (!wire.throughEntryPin || !wire.throughExitPin) {
                errors.push(`Wire with throughComponent ${wire.throughComponent} must specify both throughEntryPin and throughExitPin.`);
              } else {
                if (!throughPins.includes(wire.throughEntryPin)) {
                  errors.push(`Invalid throughEntryPin "${wire.throughEntryPin}" for component ${wire.throughComponent} (${throughType}). Allowed: ${throughPins.join(", ")}`);
                }
                if (!throughPins.includes(wire.throughExitPin)) {
                  errors.push(`Invalid throughExitPin "${wire.throughExitPin}" for component ${wire.throughComponent} (${throughType}). Allowed: ${throughPins.join(", ")}`);
                }
              }
            }
          }
        }
        for (const pair of input.ledResistorPairs ?? []) {
          if (pair.ledIndex >= input.components.length) errors.push(`ledResistorPair references LED index ${pair.ledIndex} — out of range.`);
          if (pair.resistorIndex >= input.components.length) errors.push(`ledResistorPair references resistor index ${pair.resistorIndex} — out of range.`);
          if (input.components[pair.ledIndex]?.type !== "led" && input.components[pair.ledIndex]?.type !== "rgb_led") {
            errors.push(`Component ${pair.ledIndex} is ${input.components[pair.ledIndex]?.type}, not an LED.`);
          }
          if (input.components[pair.resistorIndex]?.type !== "resistor") {
            errors.push(`Component ${pair.resistorIndex} is ${input.components[pair.resistorIndex]?.type}, not a resistor.`);
          }
        }
        if (errors.length > 0) return { success: false, failureKind: "validation", errors };

        // ── Layout feasibility pre-check ────────────────────────
        // Estimate total rows needed before doing expensive sketch
        // validation. This avoids burning tokens on a valid sketch
        // for a circuit that won't fit on the board.
        {
          const MAX_BOARD_ROW = 27;
          const ROW_GAP = 2;
          let estimatedNextRow = 0;
          for (const c of Object.values(workingBoard.components)) {
            if (c.type !== "arduino_uno") estimatedNextRow = Math.max(estimatedNextRow, c.y + 4);
          }
          // Series intermediates (throughComponent) share a row with their target —
          // exclude them from the row estimate to avoid false overflow rejections.
          const seriesIntermediateIndices = new Set(
            input.wires
              .filter(w => w.throughComponent !== undefined)
              .map(w => w.throughComponent as number)
          );
          for (let i = 0; i < input.components.length; i++) {
            if (seriesIntermediateIndices.has(i)) continue;
            const comp = input.components[i];
            estimatedNextRow += componentHeight(comp.type) + ROW_GAP;
          }
          if (estimatedNextRow > MAX_BOARD_ROW + 5) {
            return {
              success: false,
              failureKind: "layout_overflow",
              errors: [
                `Too many components (${input.components.length}) — estimated ${estimatedNextRow} rows needed, but the board only has 30 rows.`,
              ],
              hint: "Reduce the component count. For 7-segment displays, skip individual series resistors — the display's built-in forward voltage drop is usually safe at 5V with the simulator's virtual LEDs.",
            };
          }
        }

        if (input.sketch) {
          const check = validateSketch(input.sketch);
          if (!check.valid) {
            noteSketchFailureClass(check);
            if (mode === "build") {
              sketchRecoveryRequiredInBuild = true;
            }
            return {
              success: false,
              failureKind: "sketch_validation",
              errors: [`Sketch has errors: ${formatSketchError(check)}`],
              nextStep:
                mode === "build"
                  ? "Recover sketch first with update_sketch/patch_sketch, then retry propose_circuit."
                  : "Fix sketch and retry.",
            };
          }
        }

        // ── Auto-position components ──
        // Build a working copy for position checks
        const tempBoard = structuredClone(workingBoard);
        const placedComponents: Array<{ id: string; type: string; name: string; row: number; col: number }> = [];
        const pairedResistors = new Set((input.ledResistorPairs ?? []).map(p => p.resistorIndex));
        const pairedLeds = new Set((input.ledResistorPairs ?? []).map(p => p.ledIndex));

        // Build throughComponent mapping: which components are series intermediates,
        // and which target component + pin they connect to.
        // seriesMap: intermediateIndex → { targetIndex, targetPin, entryPin, exitPin }
        const seriesMap = new Map<number, { targetIndex: number; targetPin: string; entryPin: string; exitPin: string }>();
        for (const wire of input.wires) {
          if (wire.throughComponent !== undefined && wire.throughEntryPin && wire.throughExitPin) {
            seriesMap.set(wire.throughComponent, {
              targetIndex: wire.toComponent,
              targetPin: wire.toPin,
              entryPin: wire.throughEntryPin,
              exitPin: wire.throughExitPin,
            });
          }
        }
        // Components that are series intermediates get placed alongside their target, not sequentially
        const seriesIntermediates = new Set(seriesMap.keys());

        let nextRow = 0;
        // Find first open row
        for (const c of Object.values(tempBoard.components)) {
          if (c.type !== "arduino_uno") nextRow = Math.max(nextRow, c.y + 4);
        }

        // Component height in rows
        const ROW_GAP = 2;

        function componentHeight(type: string): number {
          if (type === "led" || type === "rgb_led") return 2;
          if (type === "servo" || type === "potentiometer" || type === "temperature_sensor" || type === "capacitor") return 3;
          if (type === "button") return 2;
          if (type === "resistor") return 1;
          if (type === "seven_segment") return 9;
          if (type === "lcd_16x2") return 12;
          return 1;
        }

        // Default column for component types.
        // Resistors and buttons use fixed columns matching the registry footprint.
        // Wide components (seven_segment, lcd) go on the right strip so series
        // resistors (always cols 3/6) don't visually overlap the component body.
        function componentCol(type: string): number {
          if (type === "button") return 3; // straddles gap at cols 3/6
          if (type === "resistor") return 3; // straddles gap at cols 3/6
          if (type === "seven_segment" || type === "lcd_16x2") return 5; // right strip — avoids overlap with resistors
          return 2; // left strip
        }

        // Default pin map (all null)
        function defaultPins(type: string): Record<string, null> {
          const names = getComponentPinNames(type);
          const result: Record<string, null> = {};
          for (const n of names) result[n] = null;
          return result;
        }

        function isSameBreadboardBus(
          a: { row: number; col: number },
          b: { row: number; col: number },
        ): boolean {
          if (a.row !== b.row) return false;
          const aLeft = a.col >= 0 && a.col <= 4;
          const aRight = a.col >= 5 && a.col <= 9;
          const bLeft = b.col >= 0 && b.col <= 4;
          const bRight = b.col >= 5 && b.col <= 9;
          return (aLeft && bLeft) || (aRight && bRight);
        }

        function rowConflictsWithExistingPins(params: {
          candidateType: string;
          candidateX: number;
          candidateY: number;
          candidatePins: string[];
          allowedTargetIndex: number;
        }): boolean {
          const candidatePoints = params.candidatePins
            .map((pin) => resolveComponentPinTarget(
              { type: params.candidateType, x: params.candidateX, y: params.candidateY },
              pin,
            ))
            .filter((p): p is { row: number; col: number } => !!p);

          for (let idx = 0; idx < placedComponents.length; idx++) {
            if (idx === params.allowedTargetIndex) continue;
            const existing = placedComponents[idx];
            if (!existing) continue;

            const pinNames = getComponentPinNames(existing.type);
            for (const pinName of pinNames) {
              const pos = resolveComponentPinTarget(
                { type: existing.type, x: existing.col, y: existing.row },
                pinName,
              );
              if (!pos) continue;
              for (const cp of candidatePoints) {
                if (isSameBreadboardBus(cp, pos)) return true;
              }
            }
          }
          return false;
        }

        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i];

          // Skip components that will be positioned alongside their target
          if (pairedResistors.has(i) || seriesIntermediates.has(i)) continue;

          const col = componentCol(comp.type);
          const row = nextRow;
          const id = crypto.randomUUID();

          placedComponents[i] = { id, type: comp.type, name: comp.name, row, col };

          // If this is an LED with a paired resistor, place resistor in cathode row
          if (pairedLeds.has(i)) {
            const pair = (input.ledResistorPairs ?? []).find(p => p.ledIndex === i);
            if (pair) {
              const resComp = input.components[pair.resistorIndex];
              const cathodeRow = row + 1;
              const resId = crypto.randomUUID();
              placedComponents[pair.resistorIndex] = {
                id: resId, type: "resistor", name: resComp.name, row: cathodeRow, col: 3,
              };
              nextRow = cathodeRow + 2;
            }
          } else {
            nextRow = row + componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Place series intermediates alongside their target components.
        // For each intermediate (e.g., resistor), place it on the same row as the
        // target pin it connects to, so the exit pin shares a breadboard bus with
        // the target and no extra jumper wire is needed.
        for (const [intermediateIdx, seriesInfo] of seriesMap.entries()) {
          if (placedComponents[intermediateIdx]) continue; // already placed
          const target = placedComponents[seriesInfo.targetIndex];
          if (!target) continue;

          const comp = input.components[intermediateIdx];
          const targetPinPos = resolveComponentPinTarget(
            { type: target.type, x: target.col, y: target.row },
            seriesInfo.targetPin,
          );

          if (targetPinPos) {
            // Place the intermediate (resistor) on the target pin's row.
            // Resistors always use cols 3/6 regardless of placement col.
            const col = componentCol(comp.type);
            const preferredRow = targetPinPos.row;
            const conflict = rowConflictsWithExistingPins({
              candidateType: comp.type,
              candidateX: col,
              candidateY: preferredRow,
              candidatePins: [seriesInfo.entryPin, seriesInfo.exitPin],
              allowedTargetIndex: seriesInfo.targetIndex,
            });

            if (!conflict) {
              placedComponents[intermediateIdx] = {
                id: crypto.randomUUID(),
                type: comp.type,
                name: comp.name,
                row: preferredRow,
                col,
              };
            } else {
              // Fallback: keep isolation over adjacency to avoid accidental bus shorts
              // (e.g. button side and segment series lead sharing the same strip row).
              placedComponents[intermediateIdx] = {
                id: crypto.randomUUID(),
                type: comp.type,
                name: comp.name,
                row: nextRow,
                col,
              };
              nextRow += componentHeight(comp.type) + ROW_GAP;
            }
          } else {
            // Fallback: place sequentially
            const col = componentCol(comp.type);
            placedComponents[intermediateIdx] = {
              id: crypto.randomUUID(),
              type: comp.type,
              name: comp.name,
              row: nextRow,
              col,
            };
            nextRow += componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Fill in any remaining components that weren't positioned
        for (let i = 0; i < input.components.length; i++) {
          if (placedComponents[i]) continue;
          const comp = input.components[i];
          const col = componentCol(comp.type);
          const id = crypto.randomUUID();
          placedComponents[i] = { id, type: comp.type, name: comp.name, row: nextRow, col };
          nextRow += componentHeight(comp.type) + ROW_GAP;
        }

        // Validate all positions are on board
        for (const pc of placedComponents) {
          if (pc.row > 27) {
            errors.push(`Component "${pc.name}" would be placed at row ${pc.row}, which is near the board edge. Board has 30 rows.`);
          }
        }
        if (errors.length > 0) return { success: false, errors, hint: "Too many components for the board. Try reducing the circuit." };

        // ── Generate ops ──
        const generatedOps: BoardOp[] = [];

        // Place components
        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i];
          const pos = placedComponents[i];
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "place_component",
            payload: {
              component: {
                id: pos.id,
                type: comp.type,
                name: comp.name,
                x: pos.col,
                y: pos.row,
                rotation: 0,
                pins: defaultPins(comp.type),
                properties: comp.properties ?? {},
              },
            },
          }));
          // Update working state
          workingBoard.components[pos.id] = {
            id: pos.id, type: comp.type, name: comp.name,
            x: pos.col, y: pos.row, rotation: 0,
            pins: defaultPins(comp.type), properties: comp.properties ?? {},
          } as typeof workingBoard.components[string];
        }

        // Wire Arduino pins to components.
        // For wires with throughComponent (series routing), we generate:
        //   1. Arduino pin → throughComponent.throughEntryPin
        //   2. throughComponent.throughExitPin → toComponent.toPin (if not same bus)
        // For direct wires, we generate: Arduino pin → toComponent.toPin (as before)
        const wiresByPin = new Map<number, Array<{
          target: { row: number; col: number };
          color: string;
        }>>();
        // Extra wires generated by series routing (component-to-component jumpers)
        const seriesJumperOps: BoardOp[] = [];

        for (const wire of input.wires) {
          const color = wire.color ?? "#22c55e";

          if (wire.throughComponent !== undefined && wire.throughEntryPin && wire.throughExitPin) {
            // Series routing: Arduino → throughComponent.entryPin
            const through = placedComponents[wire.throughComponent];

            const resolveBoth = (entryPin: string, exitPin: string) => {
              const ep = resolveComponentPinTarget(
                { type: through.type, x: through.col, y: through.row },
                entryPin,
              );
              const xp = resolveComponentPinTarget(
                { type: through.type, x: through.col, y: through.row },
                exitPin,
              );
              return { ep, xp };
            };

            let { ep: entryPoint, xp: exitPoint } = resolveBoth(
              wire.throughEntryPin,
              wire.throughExitPin,
            );
            if (!entryPoint || !exitPoint) {
              errors.push(`Unable to resolve throughComponent ${wire.throughComponent}.${wire.throughEntryPin}`);
              continue;
            }

            const finalTarget = placedComponents[wire.toComponent];
            const finalPoint = resolveComponentPinTarget(
              { type: finalTarget.type, x: finalTarget.col, y: finalTarget.row },
              wire.toPin,
            );
            if (!finalPoint) {
              errors.push(`Unable to resolve series endpoints for through=${wire.throughComponent}.${wire.throughExitPin} → ${wire.toComponent}.${wire.toPin}`);
              continue;
            }

            // Strip-membership helpers — used twice below.
            const onSameBus = (
              a: { row: number; col: number },
              b: { row: number; col: number },
            ) => {
              if (a.row !== b.row) return false;
              const aLeft = a.col >= 0 && a.col <= 4;
              const aRight = a.col >= 5 && a.col <= 9;
              const bLeft = b.col >= 0 && b.col <= 4;
              const bRight = b.col >= 5 && b.col <= 9;
              return (aLeft && bLeft) || (aRight && bRight);
            };

            // **Resistor-short guard.** If the entry pin's bus already
            // includes the final target (e.g. resistor at row 0 with pin
            // b at col 6 RIGHT strip, target seg.a at col 5 RIGHT strip),
            // wiring Arduino → entry would put the supply on the same
            // net as the load, with the resistor body in parallel to a
            // zero-resistance bus path. The model picked the wrong pin
            // as "entry"; the resistor body is supposed to be the only
            // crossing between the two strips. Swap entry and exit so
            // Arduino enters via the gap-opposite pin and the body
            // becomes the only conductive path. Symptom we're fixing:
            // current bypasses the resistor entirely on 7-seg + per-
            // segment-resistor circuits with throughComponent.
            if (onSameBus(entryPoint, finalPoint)) {
              const swapped = resolveBoth(wire.throughExitPin, wire.throughEntryPin);
              if (swapped.ep && swapped.xp) {
                entryPoint = swapped.ep;
                exitPoint = swapped.xp;
              }
            }

            // Wire Arduino pin to the intermediate's entry pin (post-swap).
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: entryPoint, color });

            // If exit and target share a bus, the breadboard does the
            // jumper for us. Otherwise emit an explicit wire.
            if (!onSameBus(exitPoint, finalPoint)) {
              seriesJumperOps.push(makeBoardOp(opCtx, {
                kind: "connect_wire",
                payload: {
                  wire: {
                    id: crypto.randomUUID(),
                    fromRow: exitPoint.row,
                    fromCol: exitPoint.col,
                    toRow: finalPoint.row,
                    toCol: finalPoint.col,
                    color,
                  },
                },
              }));
            }
          } else {
            // Direct wire (no series routing)
            const target = placedComponents[wire.toComponent];
            const to = resolveComponentPinTarget(
              { type: target.type, x: target.col, y: target.row },
              wire.toPin,
            );
            if (!to) {
              errors.push(`Unable to resolve target for component ${wire.toComponent}.${wire.toPin}`);
              continue;
            }
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: to, color });
          }
        }

        // Auto-wire LED+resistor pairs: GND → resistor pin B.
        // Feed these through the same per-pin fanout path so ground/power
        // distribution stays normalized (single Arduino lead + rail branches).
        for (const pair of input.ledResistorPairs ?? []) {
          const res = placedComponents[pair.resistorIndex];
          const resistorPinB = resolveComponentPinTarget(
            { type: res.type, x: res.col, y: res.row },
            "b",
          );
          if (!resistorPinB) {
            errors.push(`Unable to resolve resistor pin B for component ${pair.resistorIndex}.`);
            continue;
          }
          if (!wiresByPin.has(-3)) wiresByPin.set(-3, []);
          wiresByPin.get(-3)!.push({ target: resistorPinB, color: "#42a5f5" });
        }

        if (errors.length > 0) return { success: false, failureKind: "validation", errors };

        function railColForPin(pin: number): number {
          if (pin === -3 || pin === -4 || pin === -6) return -1;
          if (pin === -1) return -2;
          if (pin === -2) return 11;
          return -1;
        }

        function sameStrip(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
          if (a.row !== b.row) return false;
          const aLeft = a.col >= 0 && a.col <= 4;
          const aRight = a.col >= 5 && a.col <= 9;
          const bLeft = b.col >= 0 && b.col <= 4;
          const bRight = b.col >= 5 && b.col <= 9;
          return (aLeft && bLeft) || (aRight && bRight);
        }

        function hasEquivalentWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
        ): boolean {
          for (const existing of Object.values(workingBoard.wires)) {
            if (
              existing.fromRow === fromRow &&
              existing.fromCol === fromCol &&
              existing.toRow === toRow &&
              existing.toCol === toCol
            ) return true;
          }
          for (const op of generatedOps) {
            if (op.kind !== "connect_wire") continue;
            const w = op.payload.wire;
            if (
              w.fromRow === fromRow &&
              w.fromCol === fromCol &&
              w.toRow === toRow &&
              w.toCol === toCol
            ) return true;
          }
          return false;
        }

        function pushConnectWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
          color: string,
        ) {
          if (fromRow === toRow && fromCol === toCol) return;
          if (hasEquivalentWire(fromRow, fromCol, toRow, toCol)) return;
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: crypto.randomUUID(),
                fromRow,
                fromCol,
                toRow,
                toCol,
                color,
              },
            },
          }));
        }

        function findExistingDirectSource(pin: number): { row: number; col: number } | null {
          const existing = Object.values(workingBoard.wires).find(
            (w) => w.fromRow === -999 && w.fromCol === pin,
          );
          if (!existing) return null;
          return { row: existing.toRow, col: existing.toCol };
        }

        for (const [pin, fanout] of wiresByPin.entries()) {
          if (fanout.length === 0) continue;
          const isPowerOrGround = pin < 0;
          const existingSource = findExistingDirectSource(pin);

          if (existingSource) {
            const anchor = existingSource;
            if (isPowerOrGround && anchor.col === railColForPin(pin)) {
              const railCol = anchor.col;
              for (const branch of fanout) {
                if (branch.target.col === railCol) continue;
                pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
              }
              continue;
            }
            for (const branch of fanout) {
              if (sameStrip(anchor, branch.target)) continue;
              pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
            }
            continue;
          }

          if (isPowerOrGround) {
            const railCol = railColForPin(pin);
            pushConnectWire(-999, pin, 0, railCol, fanout[0]!.color);

            for (const branch of fanout) {
              if (branch.target.col === railCol) continue;
              pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
            }
            continue;
          }

          if (fanout.length === 1) {
            const only = fanout[0]!;
            pushConnectWire(-999, pin, only.target.row, only.target.col, only.color);
            continue;
          }

          const anchor = {
            row: fanout[0]!.target.row,
            col: fanout[0]!.target.col <= 4 ? 0 : 5,
          };
          pushConnectWire(-999, pin, anchor.row, anchor.col, fanout[0]!.color);

          for (const branch of fanout) {
            if (sameStrip(anchor, branch.target)) continue;
            pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
          }
        }

        // Append series jumper wires (throughComponent exit → target)
        for (const op of seriesJumperOps) {
          generatedOps.push(op);
        }

        if (errors.length > 0) return { success: false, failureKind: "validation", errors };

        // Write sketch (already validated before placement)
        if (input.sketch) {
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "update_sketch",
            payload: { code: input.sketch },
          }));
          workingBoard.sketchCode = input.sketch;
        }

        // Final safety gate on the fully assembled tentative board.
        // This prevents propose_circuit from "succeeding" with known electrical
        // errors and forces the model to repair before completion.
        {
          const power = analyzePowerBudget(workingBoard);
          const routing = analyzeRoutingPolicy(workingBoard);
          const powerErrors = power.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message);
          const routingWarnings = routing.violations.map((v) => v.message);

          if (powerErrors.length > 0) {
            restoreWorkingBoardSnapshot();
            return {
              success: false,
              failureKind: "electrical_validation",
              errors: powerErrors.slice(0, 8),
              warnings: routingWarnings.slice(0, 4),
              nextStep:
                "Repair wiring/power topology (single signal side on buttons, rail distribution, and external supply for high-current loads), then retry propose_circuit.",
            };
          }
        }

        // Push all ops
        for (const op of generatedOps) ops.push(op);

        // Build summary
        const summary = placedComponents.map((pc, i) =>
          `  [${i}] ${pc.name} (${pc.type}) → row=${pc.row} col=${pc.col} id=${pc.id}`
        ).join("\n");

        return {
          success: true,
          componentsPlaced: placedComponents.length,
          wiresCreated: generatedOps.filter((op) => op.kind === "connect_wire").length,
          sketchUpdated: !!input.sketch,
          layout: summary,
        };
      },
    }),

    // ── Plan-then-execute: propose_fix ──────────────────────────────
    //
    // The edit-mode counterpart to propose_circuit. Batches multiple
    // modifications (add/remove/move components, add/remove wires,
    // update sketch) into a single atomic tool call with auto-positioning,
    // validation, and rollback. Max 3 attempts per run.

    propose_fix: tool({
      description: `Modify an existing circuit in one atomic call. Describe ALL changes — the tool handles positioning, IDs, wire resolution, and validation automatically. Rolls back on failure.

Operations:
  - removeWires: wire IDs to delete (runs first to clean up before changes)
  - removeComponents: component IDs to delete (also removes connected wires)
  - addComponents: new components to place (auto-positioned, referenced by index in addWires)
  - moveComponents: relocate existing components by ID
  - addWires: new wires — can target existing components (by ID) or new ones (by addComponents index)
  - sketch: full replacement Arduino sketch code (optional)

Max ${MAX_PROPOSE_FIX_ATTEMPTS} attempts per run. Each failed call counts toward the limit.

Example — add a button + wire to an existing circuit:
  addComponents: [{type:"button", name:"BTN", pinRoles:{a:"signal_input", b:"reference_ground"}}]
  addWires: [{arduinoPin:2, toNewComponent:0, toPin:"a"}, {arduinoPin:-3, toNewComponent:0, toPin:"b"}]

Example — rewire an existing component:
  removeWires: ["old-wire-id"]
  addWires: [{arduinoPin:9, toExistingComponent:"component-uuid", toPin:"signal"}]`,

      // Loose schema — we re-parse strictly inside execute() so Zod failures
      // count toward the attempt budget AND surface detailed error messages
      // to the agent (otherwise the AI SDK rejects silently before execute).
      inputSchema: z.object({
        removeWires: z.array(z.string()).optional()
          .describe("Wire IDs to remove"),
        removeComponents: z.array(z.string()).optional()
          .describe("Component IDs to remove (also removes connected wires)"),
        addComponents: z.array(z.object({
          type: z.string(),
          name: z.string(),
          properties: z.record(z.string(), z.unknown()).optional(),
          pinRoles: z.record(z.string(), z.string())
            .describe(`Required: role per logical pin. Allowed values (EXACT strings): ${PIN_ROLE_VALUES.join(", ")}.`),
        })).optional()
          .describe("New components to place. Referenced by array index in addWires.toNewComponent."),
        moveComponents: z.array(z.object({
          componentId: z.string(),
          x: z.number().int().min(0).max(9).describe("Target column"),
          y: z.number().int().min(0).max(29).describe("Target row"),
        })).optional()
          .describe("Move existing components to new positions"),
        addWires: z.array(z.object({
          arduinoPin: z.number().describe("Arduino pin (D0-D13=0-13, A0-A5=14-19, 5V=-1, GND=-3)"),
          toExistingComponent: z.string().optional()
            .describe("ID of an existing component on the board"),
          toNewComponent: z.number().int().min(0).optional()
            .describe("Index into addComponents array"),
          toPin: z.string().describe("Logical pin on the target component"),
          color: z.string().optional(),
          throughExistingComponent: z.string().optional()
            .describe("ID of existing intermediate component for series routing"),
          throughNewComponent: z.number().int().min(0).optional()
            .describe("Index into addComponents for intermediate component"),
          throughEntryPin: z.string().optional(),
          throughExitPin: z.string().optional(),
        })).optional()
          .describe("New wires. Each must specify either toExistingComponent or toNewComponent."),
        ledResistorPairs: z.array(z.object({
          ledIndex: z.number().int().min(0).describe("Index of LED in addComponents"),
          resistorIndex: z.number().int().min(0).describe("Index of resistor in addComponents"),
        })).optional()
          .describe("LED+resistor pairs among addComponents — auto-wires cathode→resistor→GND"),
        sketch: z.string().optional().describe("Full replacement Arduino sketch code"),
      }),

      execute: async (inputRaw) => {
        // ── Attempt budget (counts EVERY call, including schema failures) ──
        proposeFixAttempts += 1;
        if (proposeFixAttempts > MAX_PROPOSE_FIX_ATTEMPTS) {
          return {
            success: false,
            blocked: true,
            abandoned: true,
            failureKind: "attempt_limit",
            errors: [
              `propose_fix attempt budget exhausted (${MAX_PROPOSE_FIX_ATTEMPTS}). Use granular tools or explain to the user what went wrong.`,
            ],
          };
        }

        // ── Strict schema re-parse ──
        // Catch invalid enums (e.g. pinRoles: "analog_input") here so the
        // agent sees the exact field + allowed values on the next turn.
        const strictSchema = z.object({
          removeWires: z.array(z.string()).optional(),
          removeComponents: z.array(z.string()).optional(),
          addComponents: z.array(z.object({
            type: z.enum(ALL_COMPONENT_TYPES),
            name: z.string(),
            properties: z.record(z.string(), z.unknown()).optional(),
            pinRoles: z.record(z.string(), z.enum(PIN_ROLE_VALUES)),
          })).optional(),
          moveComponents: z.array(z.object({
            componentId: z.string(),
            x: z.number().int().min(0).max(9),
            y: z.number().int().min(0).max(29),
          })).optional(),
          addWires: z.array(z.object({
            arduinoPin: z.number(),
            toExistingComponent: z.string().optional(),
            toNewComponent: z.number().int().min(0).optional(),
            toPin: z.string(),
            color: z.string().optional(),
            throughExistingComponent: z.string().optional(),
            throughNewComponent: z.number().int().min(0).optional(),
            throughEntryPin: z.string().optional(),
            throughExitPin: z.string().optional(),
          })).optional(),
          ledResistorPairs: z.array(z.object({
            ledIndex: z.number().int().min(0),
            resistorIndex: z.number().int().min(0),
          })).optional(),
          sketch: z.string().optional(),
        });
        const parsed = strictSchema.safeParse(inputRaw);
        if (!parsed.success) {
          const zodErrors = parsed.error.issues.slice(0, 5).map((issue) => {
            const path = issue.path.join(".") || "(root)";
            const gotValue = issue.path.reduce<unknown>((acc, seg) => {
              if (acc && typeof acc === "object" && (typeof seg === "string" || typeof seg === "number")) {
                return (acc as Record<string | number, unknown>)[seg];
              }
              return undefined;
            }, inputRaw);
            const got = gotValue === undefined ? "" : ` (got ${JSON.stringify(gotValue)})`;
            return `${path}: ${issue.message}${got}`;
          });
          return {
            success: false,
            failureKind: "schema_validation",
            errors: zodErrors,
            hint:
              `pinRoles must use one of: ${PIN_ROLE_VALUES.join(", ")}. ` +
              `addWires wire shape: { arduinoPin, toExistingComponent or toNewComponent, toPin }.`,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }
        const input = parsed.data;

        // ── Snapshot for rollback ──
        const snapshot = {
          components: structuredClone(workingBoard.components),
          wires: structuredClone(workingBoard.wires),
          sketchCode: workingBoard.sketchCode,
          libraryState: structuredClone(workingBoard.libraryState),
          serialOutput: structuredClone(workingBoard.serialOutput),
          customLibraries: structuredClone(workingBoard.customLibraries),
          boardTarget: workingBoard.boardTarget,
        };
        const opsStartIndex = ops.length;

        function rollback() {
          workingBoard.components = snapshot.components;
          workingBoard.wires = snapshot.wires;
          workingBoard.sketchCode = snapshot.sketchCode;
          workingBoard.libraryState = snapshot.libraryState;
          workingBoard.serialOutput = snapshot.serialOutput;
          workingBoard.customLibraries = snapshot.customLibraries;
          workingBoard.boardTarget = snapshot.boardTarget;
          ops.length = opsStartIndex;
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const generatedOps: BoardOp[] = [];

        // ── 1. Remove wires ──
        for (const wireId of input.removeWires ?? []) {
          if (!workingBoard.wires[wireId]) {
            warnings.push(`Wire ${wireId} not found (skipped).`);
            continue;
          }
          generatedOps.push(makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId } }));
          delete workingBoard.wires[wireId];
        }

        // ── 2. Remove components (+ their connected wires) ──
        for (const componentId of input.removeComponents ?? []) {
          const comp = workingBoard.components[componentId];
          if (!comp) {
            warnings.push(`Component ${componentId} not found (skipped).`);
            continue;
          }
          // Find and remove connected wires
          for (const [wId, w] of Object.entries(workingBoard.wires)) {
            const connectedToComp =
              (w.toRow === comp.y && w.toCol === comp.x) ||
              (w.fromRow === comp.y && w.fromCol === comp.x);
            if (connectedToComp) {
              generatedOps.push(makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId: wId } }));
              delete workingBoard.wires[wId];
            }
          }
          generatedOps.push(makeBoardOp(opCtx, { kind: "remove_component", payload: { componentId } }));
          delete workingBoard.components[componentId];
        }

        // ── 3. Move components ──
        for (const move of input.moveComponents ?? []) {
          const comp = workingBoard.components[move.componentId];
          if (!comp) {
            errors.push(`Component ${move.componentId} not found for move.`);
            continue;
          }
          const overlap = Object.values(workingBoard.components).find(
            (c) => c.type !== "arduino_uno" && c.id !== move.componentId && c.x === move.x && c.y === move.y,
          );
          if (overlap) {
            errors.push(`Move target (row=${move.y}, col=${move.x}) occupied by ${overlap.name}.`);
            continue;
          }
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "move_component",
            payload: { componentId: move.componentId, x: move.x, y: move.y },
          }));
          comp.x = move.x;
          comp.y = move.y;
        }

        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // ── 4. Add components (auto-position) ──
        const addedComponents = input.addComponents ?? [];
        const placedNew: Array<{ id: string; type: string; name: string; row: number; col: number }> = [];

        // Validate pinRoles coverage
        for (let i = 0; i < addedComponents.length; i++) {
          const comp = addedComponents[i]!;
          const allowedPins = getComponentPinNames(comp.type);
          const roleKeys = Object.keys(comp.pinRoles ?? {});
          const missing = allowedPins.filter((p) => !(p in comp.pinRoles));
          const extras = roleKeys.filter((k) => !allowedPins.includes(k));
          if (missing.length > 0) {
            errors.push(`addComponents[${i}] (${comp.type}) missing pinRoles for: ${missing.join(", ")}.`);
          }
          if (extras.length > 0) {
            errors.push(`addComponents[${i}] (${comp.type}) invalid pinRoles keys: ${extras.join(", ")}.`);
          }
        }
        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // Find next available row
        let nextRow = 0;
        for (const c of Object.values(workingBoard.components)) {
          if (c.type !== "arduino_uno") nextRow = Math.max(nextRow, c.y + 4);
        }

        const ROW_GAP = 2;
        function componentHeight(type: string): number {
          if (type === "led" || type === "rgb_led") return 2;
          if (type === "servo" || type === "potentiometer" || type === "temperature_sensor" || type === "capacitor") return 3;
          if (type === "button") return 2;
          if (type === "resistor") return 1;
          if (type === "seven_segment") return 9;
          if (type === "lcd_16x2") return 12;
          return 1;
        }
        function componentCol(type: string): number {
          if (type === "button") return 3;
          if (type === "resistor") return 3;
          if (type === "seven_segment" || type === "lcd_16x2") return 5;
          return 2;
        }
        function defaultPins(type: string): Record<string, null> {
          const names = getComponentPinNames(type);
          const result: Record<string, null> = {};
          for (const n of names) result[n] = null;
          return result;
        }

        // Identify LED+resistor pairs and series intermediates
        const pairedResistors = new Set((input.ledResistorPairs ?? []).map(p => p.resistorIndex));
        const pairedLeds = new Set((input.ledResistorPairs ?? []).map(p => p.ledIndex));

        // Series map for throughNewComponent wires
        const seriesMap = new Map<number, { targetIndex: number; targetPin: string; entryPin: string; exitPin: string }>();
        for (const wire of input.addWires ?? []) {
          if (wire.throughNewComponent !== undefined && wire.throughEntryPin && wire.throughExitPin && wire.toNewComponent !== undefined) {
            seriesMap.set(wire.throughNewComponent, {
              targetIndex: wire.toNewComponent,
              targetPin: wire.toPin,
              entryPin: wire.throughEntryPin,
              exitPin: wire.throughExitPin,
            });
          }
        }
        const seriesIntermediates = new Set(seriesMap.keys());

        // Place non-series, non-paired components
        for (let i = 0; i < addedComponents.length; i++) {
          if (pairedResistors.has(i) || seriesIntermediates.has(i)) continue;
          const comp = addedComponents[i]!;
          const col = componentCol(comp.type);
          const row = nextRow;
          const id = crypto.randomUUID();
          placedNew[i] = { id, type: comp.type, name: comp.name, row, col };

          if (pairedLeds.has(i)) {
            const pair = (input.ledResistorPairs ?? []).find(p => p.ledIndex === i);
            if (pair) {
              const resComp = addedComponents[pair.resistorIndex]!;
              const cathodeRow = row + 1;
              const resId = crypto.randomUUID();
              placedNew[pair.resistorIndex] = { id: resId, type: "resistor", name: resComp.name, row: cathodeRow, col: 3 };
              nextRow = cathodeRow + 2;
            }
          } else {
            nextRow = row + componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Place series intermediates alongside their target
        for (const [intermediateIdx, seriesInfo] of seriesMap.entries()) {
          if (placedNew[intermediateIdx]) continue;
          const target = placedNew[seriesInfo.targetIndex];
          if (!target) continue;
          const comp = addedComponents[intermediateIdx]!;
          const targetPinPos = resolveComponentPinTarget(
            { type: target.type, x: target.col, y: target.row },
            seriesInfo.targetPin,
          );
          if (targetPinPos) {
            const col = componentCol(comp.type);
            placedNew[intermediateIdx] = { id: crypto.randomUUID(), type: comp.type, name: comp.name, row: targetPinPos.row, col };
          } else {
            const col = componentCol(comp.type);
            placedNew[intermediateIdx] = { id: crypto.randomUUID(), type: comp.type, name: comp.name, row: nextRow, col };
            nextRow += componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Fill in any remaining
        for (let i = 0; i < addedComponents.length; i++) {
          if (placedNew[i]) continue;
          const comp = addedComponents[i]!;
          const col = componentCol(comp.type);
          placedNew[i] = { id: crypto.randomUUID(), type: comp.type, name: comp.name, row: nextRow, col };
          nextRow += componentHeight(comp.type) + ROW_GAP;
        }

        // Validate positions
        for (const pc of placedNew) {
          if (pc && pc.row > 27) {
            errors.push(`Component "${pc.name}" would be at row ${pc.row}, near board edge.`);
          }
        }
        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "layout_overflow",
            errors,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // Generate place ops
        for (let i = 0; i < addedComponents.length; i++) {
          const comp = addedComponents[i]!;
          const pos = placedNew[i]!;
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "place_component",
            payload: {
              component: {
                id: pos.id,
                type: comp.type,
                name: comp.name,
                x: pos.col,
                y: pos.row,
                rotation: 0,
                pins: defaultPins(comp.type),
                properties: comp.properties ?? {},
              },
            },
          }));
          workingBoard.components[pos.id] = {
            id: pos.id, type: comp.type, name: comp.name,
            x: pos.col, y: pos.row, rotation: 0,
            pins: defaultPins(comp.type), properties: comp.properties ?? {},
          } as typeof workingBoard.components[string];
        }

        // ── 5. Add wires ──
        const wiresByPin = new Map<number, Array<{ target: { row: number; col: number }; color: string }>>();
        const seriesJumperOps: BoardOp[] = [];

        for (const wire of input.addWires ?? []) {
          const color = wire.color ?? "#22c55e";

          // Resolve target component (existing or new)
          let targetComp: { type: string; x: number; y: number } | undefined;
          if (wire.toExistingComponent) {
            const existing = workingBoard.components[wire.toExistingComponent];
            if (!existing) {
              errors.push(`Wire target component ${wire.toExistingComponent} not found.`);
              continue;
            }
            targetComp = existing;
          } else if (wire.toNewComponent !== undefined) {
            const placed = placedNew[wire.toNewComponent];
            if (!placed) {
              errors.push(`Wire references addComponents[${wire.toNewComponent}] which doesn't exist.`);
              continue;
            }
            targetComp = { type: placed.type, x: placed.col, y: placed.row };
          } else {
            errors.push("Wire must specify either toExistingComponent or toNewComponent.");
            continue;
          }

          // Validate toPin
          const allowedPins = getComponentPinNames(targetComp.type);
          if (!allowedPins.includes(wire.toPin)) {
            errors.push(`Invalid toPin "${wire.toPin}" for ${targetComp.type}. Allowed: ${allowedPins.join(", ")}`);
            continue;
          }

          // Resolve through-component for series routing
          let throughComp: { type: string; x: number; y: number } | undefined;
          if (wire.throughExistingComponent) {
            const existing = workingBoard.components[wire.throughExistingComponent];
            if (!existing) {
              errors.push(`Through-component ${wire.throughExistingComponent} not found.`);
              continue;
            }
            throughComp = existing;
          } else if (wire.throughNewComponent !== undefined) {
            const placed = placedNew[wire.throughNewComponent];
            if (!placed) {
              errors.push(`Through-component references addComponents[${wire.throughNewComponent}] which doesn't exist.`);
              continue;
            }
            throughComp = { type: placed.type, x: placed.col, y: placed.row };
          }

          if (throughComp && wire.throughEntryPin && wire.throughExitPin) {
            // Series routing: Arduino → through.entryPin, then through.exitPin → target.toPin
            const entryPoint = resolveComponentPinTarget(throughComp, wire.throughEntryPin);
            if (!entryPoint) {
              errors.push(`Cannot resolve through-component pin ${wire.throughEntryPin}.`);
              continue;
            }
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: entryPoint, color });

            const exitPoint = resolveComponentPinTarget(throughComp, wire.throughExitPin);
            const finalPoint = resolveComponentPinTarget(targetComp, wire.toPin);
            if (!exitPoint || !finalPoint) {
              errors.push(`Cannot resolve series endpoints for through.${wire.throughExitPin} → target.${wire.toPin}.`);
              continue;
            }

            // Check if same bus — no jumper needed
            const sameBus =
              exitPoint.row === finalPoint.row &&
              ((exitPoint.col <= 4 && finalPoint.col <= 4) || (exitPoint.col >= 5 && finalPoint.col >= 5));
            if (!sameBus) {
              seriesJumperOps.push(makeBoardOp(opCtx, {
                kind: "connect_wire",
                payload: {
                  wire: {
                    id: crypto.randomUUID(),
                    fromRow: exitPoint.row, fromCol: exitPoint.col,
                    toRow: finalPoint.row, toCol: finalPoint.col,
                    color,
                  },
                },
              }));
            }
          } else {
            // Direct wire
            const to = resolveComponentPinTarget(targetComp, wire.toPin);
            if (!to) {
              errors.push(`Cannot resolve target pin ${targetComp.type}.${wire.toPin}.`);
              continue;
            }
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: to, color });
          }
        }

        // Auto-wire LED+resistor pairs through the same fanout path, so GND
        // distribution is always normalized (single Arduino lead + branches).
        for (const pair of input.ledResistorPairs ?? []) {
          const res = placedNew[pair.resistorIndex];
          if (!res) continue;
          const resistorPinB = resolveComponentPinTarget({ type: res.type, x: res.col, y: res.row }, "b");
          if (!resistorPinB) {
            errors.push(`Cannot resolve resistor pin B for addComponents[${pair.resistorIndex}].`);
            continue;
          }
          if (!wiresByPin.has(-3)) wiresByPin.set(-3, []);
          wiresByPin.get(-3)!.push({ target: resistorPinB, color: "#42a5f5" });
        }

        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // Generate wire ops (with fanout distribution)
        function railColForPin(pin: number): number {
          if (pin === -3 || pin === -4 || pin === -6) return -1;
          if (pin === -1) return -2;
          if (pin === -2) return 11;
          return -1;
        }
        function sameStrip(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
          if (a.row !== b.row) return false;
          return (a.col <= 4 && b.col <= 4) || (a.col >= 5 && b.col >= 5);
        }

        function hasEquivalentWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
        ): boolean {
          for (const existing of Object.values(workingBoard.wires)) {
            if (
              existing.fromRow === fromRow &&
              existing.fromCol === fromCol &&
              existing.toRow === toRow &&
              existing.toCol === toCol
            ) return true;
          }
          for (const op of generatedOps) {
            if (op.kind !== "connect_wire") continue;
            const w = op.payload.wire;
            if (
              w.fromRow === fromRow &&
              w.fromCol === fromCol &&
              w.toRow === toRow &&
              w.toCol === toCol
            ) return true;
          }
          return false;
        }

        function pushConnectWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
          color: string,
        ) {
          if (fromRow === toRow && fromCol === toCol) return;
          if (hasEquivalentWire(fromRow, fromCol, toRow, toCol)) return;
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: crypto.randomUUID(),
                fromRow,
                fromCol,
                toRow,
                toCol,
                color,
              },
            },
          }));
        }

        function findExistingDirectSource(pin: number): { row: number; col: number } | null {
          const existing = Object.values(workingBoard.wires).find(
            (w) => w.fromRow === -999 && w.fromCol === pin,
          );
          if (!existing) return null;
          return { row: existing.toRow, col: existing.toCol };
        }

        for (const [pin, fanout] of wiresByPin.entries()) {
          if (fanout.length === 0) continue;
          const isPowerOrGround = pin < 0;
          const existingSource = findExistingDirectSource(pin);

          if (existingSource) {
            const anchor = existingSource;
            if (isPowerOrGround && anchor.col === railColForPin(pin)) {
              const railCol = anchor.col;
              for (const branch of fanout) {
                if (branch.target.col === railCol) continue;
                pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
              }
              continue;
            }
            for (const branch of fanout) {
              if (sameStrip(anchor, branch.target)) continue;
              pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
            }
            continue;
          }

          if (isPowerOrGround) {
            const railCol = railColForPin(pin);
            pushConnectWire(-999, pin, 0, railCol, fanout[0]!.color);
            for (const branch of fanout) {
              if (branch.target.col === railCol) continue;
              pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
            }
          } else {
            if (fanout.length === 1) {
              const only = fanout[0]!;
              pushConnectWire(-999, pin, only.target.row, only.target.col, only.color);
              continue;
            }
            const anchor = { row: fanout[0]!.target.row, col: fanout[0]!.target.col <= 4 ? 0 : 5 };
            pushConnectWire(-999, pin, anchor.row, anchor.col, fanout[0]!.color);
            for (const branch of fanout) {
              if (sameStrip(anchor, branch.target)) continue;
              pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
            }
          }
        }

        // Append series jumpers
        for (const op of seriesJumperOps) generatedOps.push(op);

        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // ── 6. Sketch ──
        if (input.sketch) {
          const check = validateSketch(input.sketch);
          if (!check.valid) {
            const failureClass = noteSketchFailureClass(check);
            sketchFixValidationFailures += 1;
            if (
              sketchFixValidationFailures >= MAX_SKETCH_FIX_FAILURES ||
              consecutiveSameSketchFailureClass >= MAX_CONSECUTIVE_SAME_LIMITATION_FAILURES
            ) {
              sketchRecoveryAbandoned = true;
              rollback();
              return {
                success: false,
                blocked: true,
                abandoned: true,
                failureKind: "sketch_fix_attempt_limit",
                errors: [`Sketch validation failed: ${formatSketchError(check)}`],
                limiter: `repeated_${failureClass}`,
              };
            }
            rollback();
            return {
              success: false,
              failureKind: "sketch_validation",
              errors: [`Sketch has errors: ${formatSketchError(check)}`],
              attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
            };
          }
          clearSketchFailureTracking();
          generatedOps.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: input.sketch } }));
          workingBoard.sketchCode = input.sketch;
        }

        // ── 7. Update working wires ──
        for (const op of generatedOps) {
          if (op.kind === "connect_wire") {
            const w = op.payload.wire;
            workingBoard.wires[w.id] = w;
          }
        }

        // ── 8. Electrical validation ──
        {
          const power = analyzePowerBudget(workingBoard);
          const routing = analyzeRoutingPolicy(workingBoard);
          const powerErrors = power.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message);
          const routingWarnings = routing.violations.map((v) => v.message);

          if (powerErrors.length > 0) {
            rollback();
            return {
              success: false,
              failureKind: "electrical_validation",
              errors: powerErrors.slice(0, 8),
              warnings: routingWarnings.slice(0, 4),
              nonBlockingWarnings: warnings.length > 0 ? warnings : undefined,
              attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
            };
          }
        }

        // ── 9. Commit all ops ──
        for (const op of generatedOps) ops.push(op);

        const summary = [
          ...(input.removeWires?.length ? [`Removed ${input.removeWires.length} wire(s)`] : []),
          ...(input.removeComponents?.length ? [`Removed ${input.removeComponents.length} component(s)`] : []),
          ...(input.moveComponents?.length ? [`Moved ${input.moveComponents.length} component(s)`] : []),
          ...(placedNew.length > 0 ? [`Added ${placedNew.length} component(s)`] : []),
          ...([`Created ${generatedOps.filter(op => op.kind === "connect_wire").length} wire(s)`]),
          ...(input.sketch ? ["Updated sketch"] : []),
        ].join(", ");

        const layout = placedNew.length > 0
          ? placedNew.map((pc, i) => `  [${i}] ${pc.name} (${pc.type}) → row=${pc.row} col=${pc.col} id=${pc.id}`).join("\n")
          : undefined;

        return {
          success: true,
          summary,
          componentsAdded: placedNew.length,
          componentsRemoved: input.removeComponents?.length ?? 0,
          wiresCreated: generatedOps.filter(op => op.kind === "connect_wire").length,
          wiresRemoved: input.removeWires?.length ?? 0,
          sketchUpdated: !!input.sketch,
          layout,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      },
    }),

  } as const;

  let filteredTools: typeof allTools;
  if (mode === "build") {
    filteredTools = Object.fromEntries(
      Object.entries(allTools).filter(([name]) => BUILD_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  } else if (mode === "edit") {
    filteredTools = Object.fromEntries(
      Object.entries(allTools).filter(([name]) => EDIT_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  } else {
    filteredTools = allTools;
  }

  return {
    tools: filteredTools,
    /** Check after tool loop: true if sketch recovery was exhausted and the agent should abandon. */
    isSketchRecoveryAbandoned: () => sketchRecoveryAbandoned,
  };
}
