import { tool } from "ai";
import { z } from "zod";
import { boardStateToDiagram, isBoardComponentType } from "@dreamer/schemas";
import { analyzePowerBudget } from "../../../electrical/power-budget-analyzer";
import { WIRING_GUIDE_TEXT } from "../wiring-guide-text";
import type { ToolContext } from "./shared";
import { summarizeBoardState } from "./shared";

export function createReadTools(ctx: ToolContext) {
  const { project, workingBoard } = ctx;

  return {
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
  } as const;
}
