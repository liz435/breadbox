import { tool } from "ai";
import {
  diagramToolInputSchema,
  validateDiagram,
  withDiagramSchemaVersion,
} from "@dreamer/schemas";
import type { ToolContext } from "./shared";

export function createDesignTools(ctx: ToolContext) {
  const { commitBoardState, buildBoardStateFromDiagram } = ctx;

  return {
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
  } as const;
}
