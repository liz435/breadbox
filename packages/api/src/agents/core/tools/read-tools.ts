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

    read_serial_monitor: tool({
      description:
        "Read recent Serial Monitor output from the user's running sketch. " +
        "Use this to debug Serial.println() output, inspect sensor values, " +
        "check whether the main loop is iterating, or look at runtime error " +
        "traces. Returns the most recent entries (capped). Each entry is " +
        "{ text, ts, source? } where source — when present — is 'board' " +
        "(real hardware over USB) or 'simulator' (in-browser AVR8js). The " +
        "buffer is a snapshot taken at request time — output produced after " +
        "the user pressed Send won't appear; ask them to retry if you need " +
        "fresher data.",
      inputSchema: z.object({
        tailLines: z.number().int().min(1).max(500).default(50)
          .describe("Number of most-recent matching lines to return."),
        sinceMs: z.number().int().min(0).optional()
          .describe("If set, only return entries with ts within the last N ms. Use to focus on output from the last few seconds."),
        grep: z.string().optional()
          .describe("Optional JS regex (case-sensitive). Only entries whose text matches are returned."),
        source: z.enum(["simulator", "board", "both"]).default("both")
          .describe("Filter by source. 'both' includes untagged entries (and is the right default when you don't know which surface the user is running on)."),
      }),
      execute: async (input) => {
        // Forward-compatible read of the optional `source` field. The
        // on-disk BoardState schema today is { text, ts }; the WebSerial
        // PR extends it with `source?: "simulator" | "board"`. Treating
        // entries as a wider shape here lets this filter ship now and
        // start narrowing once the schema gains source-tagging — no
        // follow-up to this file needed.
        type SerialEntry = { text: string; ts: number; source?: "simulator" | "board" };
        const all = (workingBoard.serialOutput ?? []) as SerialEntry[];
        if (all.length === 0) {
          return {
            entries: [],
            totalAvailable: 0,
            filteredCount: 0,
            truncated: false,
            note: "Serial buffer is empty. Either the sketch hasn't run, Serial.begin() hasn't been called, or the monitor isn't connected.",
          };
        }
        let re: RegExp | null = null;
        if (input.grep) {
          try {
            re = new RegExp(input.grep);
          } catch (err) {
            return { error: `Invalid regex: ${err instanceof Error ? err.message : "unknown"}` };
          }
        }
        const cutoff = input.sinceMs ? Date.now() - input.sinceMs : 0;
        const filtered = all.filter((entry) => {
          if (entry.ts < cutoff) return false;
          // Source filter is permissive: only drop an entry when it has
          // a source tag AND that tag disagrees with the requested
          // filter. Untagged entries always pass — matches the
          // SerialMonitor's UI behavior of showing untagged in every view.
          if (input.source !== "both" && entry.source && entry.source !== input.source) return false;
          if (re && !re.test(entry.text)) return false;
          return true;
        });
        const tail = filtered.slice(-input.tailLines);
        return {
          entries: tail,
          totalAvailable: all.length,
          filteredCount: filtered.length,
          truncated: filtered.length > tail.length,
        };
      },
    }),
  } as const;
}
