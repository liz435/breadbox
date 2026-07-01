// MCP tool registration — glues each handler to McpServer.registerTool
// with a zod input schema and a JSON-serialising envelope.
//
// Keep this layer thin. All domain logic lives in handlers.ts; changes here
// should only be adding/removing tools or renaming arguments.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { diagramToolInputSchema } from "@dreamer/schemas"
import type { McpSession } from "./context"
import {
  analyzePowerBudgetHandler,
  applyDesign,
  deleteCustomPart,
  getBoardOverview,
  getBoardState,
  getComponentDetails,
  getCurrentProject,
  getCustomPart,
  getSketchCode,
  getWiringGuide,
  listComponents,
  listCustomParts,
  listProjects,
  listWires,
  patchSketch,
  saveCustomPart,
  setCurrentProject,
  updateSketch,
  validateCustomPart,
  validateDesign,
} from "./handlers"

// Compact DSL reference embedded in the custom-part tool descriptions so the
// agent can generate a valid `spec` without a separate schema fetch.
const DSL_SHAPE =
  'spec = { type: "custom:<kebab>", label, category?: "input"|"output"|"passive"|"display"|"other", ' +
  "pins: [{ name, dx, dy, role?: \"power\"|\"ground\"|\"digital\"|\"analog\"|\"io\" }], " +
  "properties?: { <name>: number }, " +
  "size?: { width, height }, accentColor?: <css color>, " +
  "svg?: <raw SVG body markup; scaled to the part, pins drawn on top; omit for the default labeled box>, " +
  'electrical?: { elements: [{ kind: "resistor", a, b, ohms } | { kind: "source", plus, minus, volts } | ' +
  '{ kind: "input_impedance", pin, ohms? }] }, ' +
  "sketch?: { includes?, globals?, setup?, loop? } }. " +
  'A pin ref is a pin name or "0" (ground). ohms/volts may be a number or an expression string over ' +
  'properties (e.g. "value / 100 * 5"). Sketch lines support {{name}} and {{pin.<name>}}.'

function asContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  }
}

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  }
}

async function wrap<T>(fn: () => T | Promise<T>) {
  try {
    const result = await fn()
    return asContent(result)
  } catch (err) {
    return errorContent(err)
  }
}

export function registerTools(server: McpServer, session: McpSession) {
  // ── Project selection ───────────────────────────────────────────

  server.registerTool(
    "list_projects",
    {
      description: "List every Breadbox project on disk under the current BREADBOX_HOME.",
      inputSchema: {},
    },
    async () => wrap(() => listProjects()),
  )

  server.registerTool(
    "get_current_project",
    {
      description:
        "Return the project id this MCP session is currently operating on, or null if none is selected.",
      inputSchema: {},
    },
    async () => wrap(() => getCurrentProject(session)),
  )

  server.registerTool(
    "set_current_project",
    {
      description:
        "Select a project by id. All subsequent per-project tools (reads + writes) will target it.",
      inputSchema: { projectId: z.string().min(1) },
    },
    async (input) => wrap(() => setCurrentProject(session, input)),
  )

  // ── Reads ───────────────────────────────────────────────────────

  server.registerTool(
    "get_board_overview",
    {
      description:
        "Cheap summary of the current project's board: component + wire counts, each component's id/type/position/assigned pins, wire endpoints, and a short sketch summary. Prefer this before get_board_state — it is far smaller and usually enough to reason about the board.",
      inputSchema: {},
    },
    async () => wrap(() => getBoardOverview(session)),
  )

  server.registerTool(
    "get_board_state",
    {
      description:
        "Return the current project's FULL board as a DreamerDiagram (DSL v1) — same shape `apply_design` accepts. Expensive (full payload); prefer get_board_overview unless you need every field.",
      inputSchema: {},
    },
    async () => wrap(() => getBoardState(session)),
  )

  server.registerTool(
    "list_components",
    {
      description:
        "List the current project's components (DSL shape): { id, type, at: [x,y], rotation, name?, pins?, properties }.",
      inputSchema: {},
    },
    async () => wrap(() => listComponents(session)),
  )

  server.registerTool(
    "list_wires",
    {
      description:
        "List the current project's wires (DSL shape) with readable endpoint strings ('arduino.13', 'led1.anode', …).",
      inputSchema: {},
    },
    async () => wrap(() => listWires(session)),
  )

  server.registerTool(
    "get_sketch_code",
    {
      description: "Return the current project's Arduino sketch source.",
      inputSchema: {},
    },
    async () => wrap(() => getSketchCode(session)),
  )

  server.registerTool(
    "get_component_details",
    {
      description: "Fetch one component from the current project by id.",
      inputSchema: { componentId: z.string().min(1) },
    },
    async (input) => wrap(() => getComponentDetails(session, input)),
  )

  server.registerTool(
    "analyze_power_budget",
    {
      description:
        "Analyse per-pin load, rail load, and electrical safety of the current project's board. Returns a PowerBudgetReport.",
      inputSchema: {},
    },
    async () => wrap(() => analyzePowerBudgetHandler(session)),
  )

  server.registerTool(
    "get_wiring_guide",
    {
      description:
        "Static reference: wire colours, wiring rules, component footprints, pin names, Arduino pin aliases.",
      inputSchema: {},
    },
    async () => wrap(() => getWiringGuide()),
  )

  // ── Writes ──────────────────────────────────────────────────────

  server.registerTool(
    "validate_design",
    {
      description:
        "Dry-run check on a DreamerDiagram (DSL v1). Returns `issues[]` with severity/category/code/path/message. Does NOT modify the board. Call before `apply_design`.",
      inputSchema: diagramToolInputSchema.shape,
    },
    async (input) => wrap(() => validateDesign(input)),
  )

  server.registerTool(
    "apply_design",
    {
      description:
        "Atomically replace the current project's board with a DreamerDiagram (DSL v1). Removes every existing component + wire and installs the new design. Also sets the sketch.",
      inputSchema: diagramToolInputSchema.shape,
    },
    async (input) => wrap(() => applyDesign(session, input)),
  )

  server.registerTool(
    "update_sketch",
    {
      description:
        "Replace the current project's Arduino sketch. Validated before accepting (balanced braces, setup/loop present).",
      inputSchema: { code: z.string() },
    },
    async (input) => wrap(() => updateSketch(session, input)),
  )

  server.registerTool(
    "patch_sketch",
    {
      description:
        "Replace a line range in the current project's sketch. 1-indexed, end-inclusive. Validated before accepting.",
      inputSchema: {
        startLine: z.number().int().min(1),
        endLine: z.number().int().min(1),
        newCode: z.string(),
      },
    },
    async (input) => wrap(() => patchSketch(session, input)),
  )

  // ── Custom parts (global, not project-scoped) ───────────────────

  server.registerTool(
    "list_custom_parts",
    {
      description:
        "List the user's custom components as [{ id, format }], where format is 'code' (a TS module) or 'dsl' (a declarative spec).",
      inputSchema: {},
    },
    async () => wrap(() => listCustomParts()),
  )

  server.registerTool(
    "get_custom_part",
    {
      description: "Fetch one custom part by id, returning its source and format.",
      inputSchema: { id: z.string().min(1) },
    },
    async (input) => wrap(() => getCustomPart(input)),
  )

  server.registerTool(
    "validate_custom_part",
    {
      description:
        `Dry-run validate a custom-component DSL spec. Returns { valid: true, id } or { valid: false, issues[] }. Does NOT save. ${DSL_SHAPE}`,
      inputSchema: { spec: z.record(z.string(), z.unknown()) },
    },
    async (input) => wrap(() => validateCustomPart(input)),
  )

  server.registerTool(
    "save_custom_part",
    {
      description:
        `Create or update a custom component from a DSL spec. The id is the name after "custom:" in spec.type. Validated before saving; the saved part appears in the palette and simulates like a built-in. ${DSL_SHAPE}`,
      inputSchema: { spec: z.record(z.string(), z.unknown()) },
    },
    async (input) => wrap(() => saveCustomPart(input)),
  )

  server.registerTool(
    "delete_custom_part",
    {
      description: "Delete a custom part by id.",
      inputSchema: { id: z.string().min(1) },
    },
    async (input) => wrap(() => deleteCustomPart(input)),
  )
}
