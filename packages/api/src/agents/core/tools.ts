import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { AgentKind } from "../../db/schemas";
import type { BoardOp, BoardState } from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";
import { agentRunRepo } from "../../db/agent-run-repo";
import { boardTracker } from "../../db/board-state-tracker";
import { makeBoardOp } from "../make-op";
import type { AgentRunner, DelegationContext } from "../types";
import { runGraphAgent } from "../graph/agent";
import { runCircuitAgent } from "../circuit/agent";
import { analyzePowerBudget } from "../../electrical/power-budget-analyzer";
// Cross-package import — transpiler is pure functions, no React deps
import { transpile } from "../../../../app/src/simulator/arduino-transpiler";

/** Validate sketch code through the transpiler. Returns errors or null if valid. */
function validateSketch(code: string): { valid: boolean; error?: string; line?: number } {
  if (!code.trim()) return { valid: true }
  const result = transpile(code)
  if (!result.success && result.error) {
    return { valid: false, error: result.error.message, line: result.error.line }
  }
  // Also try JS compilation
  try {
    new Function(result.code)
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "JS compilation failed" }
  }
  return { valid: true }
}

// ── All component types (kept in sync with schema) ──────────────────────

const ALL_COMPONENT_TYPES = [
  "led", "rgb_led", "button", "resistor", "capacitor", "ic",
  "potentiometer", "buzzer", "servo", "lcd_16x2", "seven_segment",
  "photoresistor", "temperature_sensor", "ultrasonic_sensor",
  "neopixel", "pir_sensor", "relay", "dc_motor", "dht_sensor",
  "ir_receiver", "shift_register", "oled_display",
] as const;

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

  const comps = Object.values(board.components);
  const wires = Object.values(board.wires);

  if (comps.length === 0 && wires.length === 0) {
    return "Board is empty — no components or wires.";
  }

  const lines: string[] = [];
  const nonArduino = comps.filter((c) => c.type !== "arduino_uno");
  lines.push(`Components: ${nonArduino.length}. Wires: ${wires.length}.`);
  if (nonArduino.length > 0) lines.push("Components:");
  for (const c of nonArduino.slice(0, 8)) {
    if (c.type === "arduino_uno") continue;
    const pins = Object.entries(c.pins)
      .filter((entry): entry is [string, number] => entry[1] != null)
      .map(([k, v]) => `${k}=${formatArduinoPin(v)}`)
      .join(", ");
    lines.push(`  - ${c.name} (${c.type}, id=${c.id}) at row=${c.y} col=${c.x}${pins ? ` pins: ${pins}` : ""}`);
  }
  if (nonArduino.length > 8) {
    lines.push(`  - ... ${nonArduino.length - 8} more component(s)`);
  }

  if (wires.length > 0) {
    lines.push("Wires:");
    for (const w of wires.slice(0, 6)) {
      const from = w.fromRow === -999 ? formatArduinoPin(w.fromCol) : `row=${w.fromRow} col=${w.fromCol}`;
      lines.push(`  - ${from} → row=${w.toRow} col=${w.toCol} (${w.color})`);
    }
    if (wires.length > 6) {
      lines.push(`  - ... ${wires.length - 6} more wire(s)`);
    }
  }

  const sketch = board.sketchCode ?? "";
  lines.push(`Sketch summary: ${summarizeSketchCode(sketch)}`);

  return lines.join("\n");
}

// ── Delegation tool factory ─────────────────────────────────────────────

function makeDelegationTool(
  agentName: AgentKind,
  runner: AgentRunner,
  description: string,
  delegation: DelegationContext,
  ops: BoardOp[],
  /**
   * Parent's shared working board. When passed, the specialist mutates this
   * directly via the unified `createCoreTools({ mode: "circuit" })` layer,
   * so both parent and child see the same tentative state and there's only
   * one ops array to coordinate.
   */
  sharedWorkingBoard?: BoardState,
) {
  return tool({
    description,
    inputSchema: z.object({
      task: z.string().describe("Task description with relevant component IDs and pins"),
    }),
    execute: async (input) => {
      const log = delegation.parentLog.child(`delegate:${agentName}`);
      const task = input.task.trim();

      // Cost guardrail: circuit specialist is wiring-only. Reject sketch/code
      // handoffs early to avoid expensive dead-end child runs.
      if (
        agentName === "circuit" &&
        /\b(sketch|code|compile|transpil|update_sketch|patch_sketch|void\s+setup\s*\(|#include)\b/i.test(task)
      ) {
        log.warn("skipping circuit delegation: task is sketch/code oriented");
        return {
          error: "Circuit specialist handles wiring only. Use update_sketch/patch_sketch directly in the parent agent.",
          opsCount: 0,
          skipped: true,
        };
      }

      // Cost guardrail: cap repeated delegations to the same specialist in a
      // single parent turn. This prevents recursion-like token burn loops.
      const priorDelegationsToSameAgent = delegation.childUsage.filter((c) => c.agent === agentName).length;
      if (priorDelegationsToSameAgent >= 1) {
        log.warn(`skipping ${agentName} delegation: per-turn limit reached`);
        return {
          error: `Skipped ${agentName} delegation to avoid token loops (limit reached this turn).`,
          opsCount: 0,
          skipped: true,
        };
      }

      log.info(`delegating: ${input.task.slice(0, 100)}`);

      const childRun = await agentRunRepo.createRun({
        threadId: delegation.threadId,
        projectId: delegation.projectId,
        sceneId: delegation.sceneId,
        sessionId: delegation.sessionId,
        prompt: input.task,
        agent: agentName,
        parentRunId: delegation.parentRunId,
      });
      await agentRunRepo.attachRunToThread(delegation.threadId, childRun.run.id);

      try {
        // Pass the parent's current working project so the specialist sees
        // any tentative mutations the parent has already made this turn.
        const workingProject = delegation.getWorkingProject();
        const result = await runner({
          prompt: input.task,
          project: workingProject,
          sceneId: delegation.sceneId,
          runId: childRun.run.id,
          threadId: delegation.threadId,
          projectId: delegation.projectId,
          sessionId: delegation.sessionId,
          parentLog: log,
          // Share the parent's workingBoard + ops with the circuit specialist
          // so mutations flow through one tool layer, one contract.
          sharedWorkingBoard,
          sharedOps: sharedWorkingBoard ? ops : undefined,
        });

        // When not sharing state, the specialist returns its own ops; append
        // them. When sharing, ops are already in the parent's array.
        if (!sharedWorkingBoard) {
          for (const op of result.proposedOps) {
            ops.push(op);
          }
        }

        // Record this child's cost for roll-up into the parent's tokenUsage
        delegation.childUsage.push({
          agent: agentName,
          runId: childRun.run.id,
          inputTokens: result.tokenUsage.inputTokens,
          outputTokens: result.tokenUsage.outputTokens,
          totalTokens: result.tokenUsage.totalTokens,
          model: result.tokenUsage.model,
        });

        await agentRunRepo.completeRun({
          runId: childRun.run.id,
          assistantText: result.assistantText,
          messages: result.messages,
          proposedOps: result.proposedOps,
          appliedOps: [],
          tokenUsage: result.tokenUsage,
        });

        log.info(
          `${agentName} agent returned — ${result.proposedOps.length} ops, text: ${result.assistantText.slice(0, 80)}`
        );

        return {
          assistantText: result.assistantText,
          opsCount: result.proposedOps.length,
          tokenUsage: result.tokenUsage,
        };
      } catch (err) {
        log.error(`${agentName} agent failed`, err);
        // Record the failure so the parent's roll-up still surfaces it
        delegation.childUsage.push({
          agent: agentName,
          runId: childRun.run.id,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          model: "unknown",
          error: err instanceof Error ? err.message : String(err),
        });
        await agentRunRepo.completeRun({
          runId: childRun.run.id,
          proposedOps: [],
          appliedOps: [],
          error: String(err),
        }).catch((e) => log.warn(`failed to mark ${agentName} run as errored: ${e}`));
        return {
          error: `${agentName} agent failed: ${err instanceof Error ? err.message : String(err)}`,
          opsCount: 0,
        };
      }
    },
  });
}

// ── Core tools ──────────────────────────────────────────────────────────

export type ToolMode = "build" | "edit" | "circuit" | "all"

/**
 * Build mode: only propose_circuit + read tools.
 *   For new circuits — agent describes the whole thing in one call.
 *
 * Edit mode: granular tools for modifying existing circuits.
 *   No propose_circuit (would replace work), no place_component
 *   (use update_component for existing items).
 *
 * Circuit mode: the circuit specialist's view. Same granular CRUD as edit
 *   plus place_component, but NO delegation (no recursion) and NO sketch
 *   tools (the specialist validates/repairs wiring, not code).
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
  "propose_circuit",
  "delegate_to_graph_agent",
  "delegate_to_circuit_agent",
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
  "delegate_to_graph_agent",
  "delegate_to_circuit_agent",
])

const CIRCUIT_MODE_TOOLS = new Set([
  "get_board_overview",
  "list_components",
  "list_wires",
  "get_component_details",
  "get_board_state",
  "analyze_power_budget",
  "get_wiring_guide",
  "place_component",
  "update_component",
  "move_component",
  "remove_component",
  "connect_wire",
  "wire_component_to_pin",
  "remove_wire",
  "update_wire",
])

export function createCoreTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: BoardOp[];
  delegation: DelegationContext;
  mode?: ToolMode;
  /**
   * Pre-existing mutable working board. The core agent creates this once and
   * passes it here so the delegation context can also expose it to specialist
   * children. If omitted, a fresh clone is made from the project + tracker.
   */
  workingBoard?: BoardState;
}) {
  const { project, sceneId, ops, delegation, mode = "all" } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  // Working copy: prefer the one passed in (shared with delegation), else the
  // live tracker, else fall back to the project file.
  const trackedBoard = boardTracker.get(projectId);
  const workingBoard: BoardState = params.workingBoard ?? structuredClone(
    trackedBoard ?? project.boardState ?? createDefaultBoardState()
  );

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
      description: "List components on the board with ids, types, positions, and assigned pins. Much cheaper than get_board_state.",
      inputSchema: z.object({}),
      execute: async () => ({
        components: Object.values(workingBoard.components)
          .filter((component) => component.type !== "arduino_uno")
          .map((component) => ({
            id: component.id,
            type: component.type,
            name: component.name,
            x: component.x,
            y: component.y,
            pins: component.pins,
            properties: component.properties,
          })),
      }),
    }),

    list_wires: tool({
      description: "List wires only. Use this when you need wiring detail without the full board payload.",
      inputSchema: z.object({}),
      execute: async () => ({
        wires: Object.values(workingBoard.wires).map((wire) => ({
          id: wire.id,
          fromRow: wire.fromRow,
          fromCol: wire.fromCol,
          toRow: wire.toRow,
          toCol: wire.toCol,
          color: wire.color,
        })),
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
      description: "Read the full board payload (components, wires, full sketch). Expensive. Prefer get_board_overview, list_components, list_wires, get_component_details, or get_sketch_code first.",
      inputSchema: z.object({}),
      execute: async () => {
        return {
          components: workingBoard.components,
          wires: workingBoard.wires,
          sketchCode: workingBoard.sketchCode,
        };
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
      execute: async () => ({
        guide: `## Wiring Rules
- ALL connections come from WIRES, not pin assignments. Set all component pins to null.
- Same-row cols 0-4 are connected (left bus). Same-row cols 5-9 are connected (right bus). No wire needed within a bus.
- LED: always add 220Ω resistor. Place LED at col 2 row N, resistor at col 3 row N+1 (cathode row). Wire pin→(N,2), GND→(N+1,7). Cathode and resistor share left bus.
- 3-pin components (servo/pot/sensor): each pin on a SEPARATE ROW or they short via bus. Wire signal→(row,x), 5V→(row+1,x), GND→(row+2,x).
- High-current loads (servo, motor, relay, large LED arrays) should use external power_supply with common ground to Arduino GND.
- power_supply (MB102) anchors on fixed rail columns, not component.x:
  top row y: left+=(-2), left-=(-1), right-=(10), right+=(11)
  bottom row y+1: left+=(-2), left-=(-1), right-=(10), right+=(11)
- Resistor spans 5 cols: place at col 3 to bridge gap (pinA at col 3, pinB at col 7).

## Footprints
LED: 2 rows vertical (anode y, cathode y+1) | Resistor: 5 cols horizontal (a at x, b at x+4) | Button: cols 3,6 rows y,y+1 | Servo/Pot: 3 rows (signal, vcc, gnd) | Capacitor: 3 rows (pos, neg)

## Pin Names
LED: anode,cathode | RGB: red,green,blue,common | Button: a,b | Resistor: a,b | Capacitor: positive,negative | Pot: vcc,signal,gnd | Buzzer: positive,negative | Servo: signal,vcc,gnd | NeoPixel: din | PIR/DHT/IR: signal | Relay/Motor: signal | ShiftReg: data,clock,latch | OLED: sda,scl | LCD: rs,en,d4,d5,d6,d7 | 7seg: a,b,c,d,e,f,g

## Arduino Pins
Digital: D0-D13 | Analog: A0-A5 (=D14-19) | PWM: D3,5,6,9,10,11 | I2C: A4(SDA), A5(SCL)`,
      }),
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
      description: "Wire a component to an Arduino pin by component ID. Resolves coordinates automatically.",
      inputSchema: z.object({
        componentId: z.string(),
        arduinoPin: z.number().describe("Pin# (-1=5V, -3=GND, 0-19=digital/analog)"),
        color: z.string().optional(),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        const wireId = crypto.randomUUID();
        const wire = {
          id: wireId,
          fromRow: -999,
          fromCol: input.arduinoPin,
          toRow: comp.y,
          toCol: comp.x,
          color: input.color ?? "#22c55e",
        };
        ops.push(makeBoardOp(opCtx, { kind: "connect_wire", payload: { wire } }));
        workingBoard.wires[wireId] = wire;
        return { wireId, from: `Arduino pin ${input.arduinoPin}`, to: `${comp.name} at row=${comp.y} col=${comp.x}` };
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
        const check = validateSketch(input.code);
        if (!check.valid) {
          return { error: `Sketch has errors: ${check.error}${check.line ? ` (line ${check.line})` : ""}. Fix the code and retry.` };
        }
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
          return { error: `Patched sketch has errors: ${check.error}${check.line ? ` (line ${check.line})` : ""}. Fix and retry.` };
        }

        ops.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: patched } }));
        workingBoard.sketchCode = patched;

        return {
          updated: true,
          linesReplaced: input.endLine - input.startLine + 1,
          newCodeLength: patched.length,
        };
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
Wires: reference components by their INDEX in the components array (0, 1, 2...).
  - Use "component:N" to wire an Arduino pin to a component's grid position.
  - For LED circuits: pair each LED with a resistor — the tool wires LED→resistor→GND correctly.
Sketch: provide full Arduino sketch code.

Example — LED blink:
  components: [{type:"led", name:"LED"}, {type:"resistor", name:"R1", properties:{resistance:220}}]
  wires: [{arduinoPin:13, toComponent:0}]
  ledResistorPairs: [{ledIndex:0, resistorIndex:1}]
  sketch: "void setup(){...}"`,

      inputSchema: z.object({
        components: z.array(z.object({
          type: z.enum(ALL_COMPONENT_TYPES),
          name: z.string(),
          properties: z.record(z.string(), z.unknown()).optional(),
        })).describe("Components to place. Referenced by array index in wires."),

        wires: z.array(z.object({
          arduinoPin: z.number().describe("Arduino pin number (D0-D13=0-13, A0-A5=14-19, 5V=-1, GND=-3)"),
          toComponent: z.number().int().min(0).describe("Index into components array"),
          color: z.string().optional(),
          pinOffset: z.number().int().optional().describe("Row offset for most parts. For power_supply: 0=L+, 1=L-, 2=R-, 3=R+, 4=L+ (bottom), 5=L- (bottom), 6=R- (bottom), 7=R+ (bottom)."),
        })).describe("Wires from Arduino pins to components"),

        ledResistorPairs: z.array(z.object({
          ledIndex: z.number().int().min(0).describe("Index of LED in components array"),
          resistorIndex: z.number().int().min(0).describe("Index of its series resistor"),
        })).optional().describe("LED+resistor pairs — tool auto-wires cathode→resistor→GND"),

        sketch: z.string().optional().describe("Complete Arduino sketch code"),
      }),

      execute: async (input) => {
        const errors: string[] = [];

        // Validate indices
        for (const wire of input.wires) {
          if (wire.toComponent >= input.components.length) {
            errors.push(`Wire references component index ${wire.toComponent} but only ${input.components.length} components defined.`);
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
        if (errors.length > 0) return { success: false, errors };

        // ── Auto-position components ──
        // Build a working copy for position checks
        const tempBoard = structuredClone(workingBoard);
        const placedComponents: Array<{ id: string; type: string; name: string; row: number; col: number }> = [];
        const pairedResistors = new Set((input.ledResistorPairs ?? []).map(p => p.resistorIndex));
        const pairedLeds = new Set((input.ledResistorPairs ?? []).map(p => p.ledIndex));

        let nextRow = 0;
        // Find first open row
        for (const c of Object.values(tempBoard.components)) {
          if (c.type !== "arduino_uno") nextRow = Math.max(nextRow, c.y + 4);
        }

        // Component height in rows
        function componentHeight(type: string): number {
          if (type === "led" || type === "rgb_led") return 2;
          if (type === "servo" || type === "potentiometer" || type === "temperature_sensor" || type === "capacitor") return 3;
          if (type === "button") return 2;
          if (type === "resistor") return 1;
          return 1;
        }

        // Default column for component types
        function componentCol(type: string): number {
          if (type === "button") return 3; // straddles gap
          return 2; // left strip
        }

        // Default pin map (all null)
        function defaultPins(type: string): Record<string, null> {
          const pinMaps: Record<string, string[]> = {
            led: ["anode", "cathode"], rgb_led: ["red", "green", "blue", "common"],
            button: ["a", "b"], resistor: ["a", "b"], capacitor: ["positive", "negative"],
            potentiometer: ["vcc", "signal", "gnd"], buzzer: ["positive", "negative"],
            servo: ["signal", "vcc", "gnd"], neopixel: ["din"],
            pir_sensor: ["signal"], relay: ["signal"], dc_motor: ["signal"],
            dht_sensor: ["signal"], ir_receiver: ["signal"],
            shift_register: ["data", "clock", "latch"],
            oled_display: ["sda", "scl"], lcd_16x2: ["rs", "en", "d4", "d5", "d6", "d7"],
            seven_segment: ["a", "b", "c", "d", "e", "f", "g"],
            ic: [], temperature_sensor: ["vcc", "signal", "gnd"],
          };
          const names = pinMaps[type] ?? [];
          const result: Record<string, null> = {};
          for (const n of names) result[n] = null;
          return result;
        }

        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i];

          // Skip resistors that are paired with LEDs — they'll be positioned with the LED
          if (pairedResistors.has(i)) continue;

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
              // Resistor at col 3, same row as cathode — spans gap to col 7
              placedComponents[pair.resistorIndex] = {
                id: resId, type: "resistor", name: resComp.name, row: cathodeRow, col: 3,
              };
              nextRow = cathodeRow + 2; // leave gap after LED+resistor pair
            }
          } else {
            nextRow = row + componentHeight(comp.type) + 1;
          }
        }

        // Fill in any remaining components that weren't positioned
        for (let i = 0; i < input.components.length; i++) {
          if (placedComponents[i]) continue;
          const comp = input.components[i];
          const col = componentCol(comp.type);
          const id = crypto.randomUUID();
          placedComponents[i] = { id, type: comp.type, name: comp.name, row: nextRow, col };
          nextRow += componentHeight(comp.type) + 1;
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

        function resolveWireTarget(
          target: { type: string; row: number; col: number },
          pinOffset: number | undefined,
        ): { row: number; col: number } {
          if (target.type !== "power_supply") {
            return {
              row: target.row + (pinOffset ?? 0),
              col: target.col,
            };
          }

          const slot = pinOffset ?? 0;
          const slots: Array<{ row: number; col: number }> = [
            { row: target.row, col: -2 },      // left+ top
            { row: target.row, col: -1 },      // left- top
            { row: target.row, col: 10 },      // right- top
            { row: target.row, col: 11 },      // right+ top
            { row: target.row + 1, col: -2 },  // left+ bottom
            { row: target.row + 1, col: -1 },  // left- bottom
            { row: target.row + 1, col: 10 },  // right- bottom
            { row: target.row + 1, col: 11 },  // right+ bottom
          ];
          return slots[Math.max(0, Math.min(7, slot))] ?? slots[0]!;
        }

        // Wire Arduino pins to components
        for (const wire of input.wires) {
          const target = placedComponents[wire.toComponent];
          const to = resolveWireTarget(target, wire.pinOffset);
          const wireId = crypto.randomUUID();
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: wireId,
                fromRow: -999,
                fromCol: wire.arduinoPin,
                toRow: to.row,
                toCol: to.col,
                color: wire.color ?? "#22c55e",
              },
            },
          }));
        }

        // Auto-wire LED+resistor pairs: GND → resistor pin B (col 7, right strip)
        for (const pair of input.ledResistorPairs ?? []) {
          const res = placedComponents[pair.resistorIndex];
          const wireId = crypto.randomUUID();
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: wireId,
                fromRow: -999,
                fromCol: -3, // GND
                toRow: res.row,
                toCol: 7, // resistor pin B on right strip
                color: "#42a5f5",
              },
            },
          }));
        }

        // Write sketch (validate first)
        let sketchError: string | undefined;
        if (input.sketch) {
          const check = validateSketch(input.sketch);
          if (!check.valid) {
            sketchError = `${check.error}${check.line ? ` (line ${check.line})` : ""}`;
          } else {
            generatedOps.push(makeBoardOp(opCtx, {
              kind: "update_sketch",
              payload: { code: input.sketch },
            }));
            workingBoard.sketchCode = input.sketch;
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
          wiresCreated: input.wires.length + (input.ledResistorPairs?.length ?? 0),
          sketchUpdated: !!input.sketch && !sketchError,
          sketchError,
          layout: summary,
        };
      },
    }),

    // ── Delegation ──────────────────────────────────────────────────

    delegate_to_graph_agent: makeDelegationTool(
      "graph",
      runGraphAgent,
      "Delegate to graph agent for visual node-block programming.",
      delegation,
      ops,
    ),

    delegate_to_circuit_agent: makeDelegationTool(
      "circuit",
      runCircuitAgent,
      "Delegate to circuit specialist for wiring validation or repair. The specialist shares this turn's working board and uses the same tool contract you do.",
      delegation,
      ops,
      // Share the parent's working board with the circuit specialist so both
      // sides mutate one state through one tool layer.
      workingBoard,
    ),
  } as const;

  if (mode === "build") {
    return Object.fromEntries(
      Object.entries(allTools).filter(([name]) => BUILD_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  }
  if (mode === "edit") {
    return Object.fromEntries(
      Object.entries(allTools).filter(([name]) => EDIT_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  }
  if (mode === "circuit") {
    return Object.fromEntries(
      Object.entries(allTools).filter(([name]) => CIRCUIT_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  }
  return allTools;
}
