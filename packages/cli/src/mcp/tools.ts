// MCP tool registration — glues each handler to McpServer.registerTool
// with a zod input schema and a JSON-serialising envelope.
//
// Keep this layer thin. All domain logic lives in handlers.ts; changes here
// should only be adding/removing tools or renaming arguments.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  BREADBOARD_FULL_ROWS,
  BREADBOARD_TERMINAL_HALF_WIDTH,
  diagramToolInputSchema,
  WORKED_EXAMPLE_ACTUATOR,
} from "@dreamer/schemas"
import { createLogger } from "@dreamer/api/logger"
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

// Compact DSL shape embedded in validate_custom_part; the full authoring
// guide (facet semantics, art bar, worked example) lives on save_custom_part.
const DSL_SHAPE =
  'spec = { type: "custom:<kebab>", label, category?: "input"|"output"|"passive"|"display"|"other", ' +
  "pins: [{ name, dx, dy, role?: \"power\"|\"ground\"|\"digital\"|\"analog\"|\"io\" }], " +
  "properties?: { <name>: number }, " +
  "size?: { width, height }, accentColor?: <css color>, " +
  "svg?: <raw SVG body markup with a viewBox>, " +
  'electrical?: { elements: [{ kind: "resistor", a, b, ohms } | { kind: "source", plus, minus, volts } | ' +
  '{ kind: "input_impedance", pin, ohms? }] }, ' +
  "behavior?: { signals: [<signal>] }, visual?: { bindings: [<binding>] }, " +
  "sketch?: { includes?, globals?, setup?, loop? } }. " +
  "See save_custom_part for the full authoring guide (signal kinds, bindings, art guidance, worked example)."

// The full authoring guide an agent needs to produce a GOOD part — realistic
// art, behavior that sketch code can drive, and animation bound to it — not
// just a schema-valid one. Kept on save_custom_part only to avoid paying for
// it twice in the tool listing.
const DSL_GUIDE = `
A custom part is one JSON spec. Shape: ${DSL_SHAPE.replace(/ See save_custom_part.*$/, "")}

FACETS — a convincing part usually uses all four:
- electrical.elements: what the circuit solver sees. SPICE primitives between declared
  pin names (or "0" = ground). Give every MCU-driven input pin an input_impedance
  element so wiring validation sees a load.
- behavior.signals: live values derived from pin activity — THIS is what makes the part
  respond to sketch code. Kinds:
    { kind: "digital", name, pin }                        pin level 0|1
    { kind: "pwm", name, pin }                            measured duty cycle 0..1 (analogWrite)
    { kind: "count", name, pin, direction?: <pin> }       rising-edge counter; with direction,
                                                          each edge adds +1 (DIR high) or -1 (DIR low)
    { kind: "frequency", name, pin }                      rising-edge Hz, 0 when idle
    { kind: "integrate", name, rate: <expr>, min?, max?, wrap? }  value += rate x elapsed seconds
                                                          (continuous motion, e.g. duty * maxDegPerSec; wrap: 360 for angles)
    { kind: "expr", name, expr: <expr> }                  derived value
  Signal names are identifiers, unique, and must not collide with property names.
  Signals watch the ARDUINO pin each part pin resolves to through the wiring — parts
  cannot drive each other's signals. For a multi-part chain (e.g. driver + motor),
  wire both parts to the same MCU-driven nets so each derives its signals from the
  same Arduino pin activity.
- visual.bindings: animate SVG elements from signals. Each binds one element by id:
    { target: "<svg id>", rotate?, originX?, originY?, translateX?, translateY?, scale?, opacity? }
  Values are numbers or expressions over properties + signals. rotate/scale default to
  the element's own center; pass originX/originY (viewBox coords) for a specific pivot.
- sketch: Arduino code templates ({{name}} = placed part's name, {{pin.<name>}} = the
  Arduino pin wired to that part pin). Emit a minimal working driver for the part so a
  generated sketch demonstrates it — pinMode in setup, motion in loop.

PLACEMENT & WIRING (after saving): place the part with apply_design as
{ type: "custom:<id>", at: [row, col] }. Pin p occupies grid cell (row + p.dy, col + p.dx).
The main grid is ${BREADBOARD_FULL_ROWS} rows x ${BREADBOARD_TERMINAL_HALF_WIDTH * 2} cols,
0-indexed — every pin's cell must land on the board. Cols 0-${BREADBOARD_TERMINAL_HALF_WIDTH - 1}
of a row are one bus, cols ${BREADBOARD_TERMINAL_HALF_WIDTH}-${BREADBOARD_TERMINAL_HALF_WIDTH * 2 - 1}
another; pins sharing a bus are already connected, so put pins that must stay isolated on
separate rows. Wire with endpoints "<componentId>.<pinName>" using your declared pin names.
Arduino endpoints: "arduino.<n>", "arduino.A<n>", "arduino.D<n>", or "arduino.5V|3V3|GND|VIN|AREF"
(case-insensitive). Power rails sit beside the grid at cols -1 (left +), -2 (left -),
${BREADBOARD_TERMINAL_HALF_WIDTH * 2} (right +), ${BREADBOARD_TERMINAL_HALF_WIDTH * 2 + 1} (right -),
addressed as "grid.<row>,<col>"; each rail splits at row ${BREADBOARD_FULL_ROWS / 2} — its top
and bottom halves are separate nets.

EXPRESSIONS: sandboxed. Arithmetic + - * / %, comparisons (< > <= >= == !=), parentheses,
and min, max, abs, clamp, floor, ceil, round, sqrt, pow over properties/signal names.
No other identifiers or functions.

ART: draw the real component, not a placeholder — but keep it economical. SVG length is
the dominant authoring cost (every path coordinate is generated serially), so DEFAULT to a
recognizable, modestly detailed drawing (~15-30 elements: body, key face features, terminals,
a text label) and offer to refine the art afterwards if the user wants more fidelity. Always
declare a viewBox and give every animated element an id (e.g. a rotor <g>). Only when the
user explicitly asks for high-fidelity art, match the detail of: ${JSON.stringify(WORKED_EXAMPLE_ACTUATOR.svg)}

WORKED EXAMPLE — a stepper motor whose rotor turns when sketch code pulses STEP:
${JSON.stringify(WORKED_EXAMPLE_ACTUATOR)}

CHECKLIST before saving: every element/signal pin is a declared pin name; expressions
only use properties/signals; every binding target id exists in the svg; the svg has a
viewBox; the sketch drives the pins the signals watch (validate_custom_part checks all
of this and returns issues/warnings).`

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

// Per-call timing goes to stderr (stdout carries the JSON-RPC stream) and,
// when the file sink is enabled, to the JSONL log — the only visibility into
// which tools are slow once the server runs headless under an MCP client.
const log = createLogger("mcp")

async function wrap<T>(tool: string, fn: () => T | Promise<T>) {
  const started = performance.now()
  try {
    const result = await fn()
    log.info(`${tool} ok in ${Math.round(performance.now() - started)}ms`)
    return asContent(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn(`${tool} failed in ${Math.round(performance.now() - started)}ms: ${message}`)
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
    async () => wrap("list_projects", () => listProjects()),
  )

  server.registerTool(
    "get_current_project",
    {
      description:
        "Return the project id this MCP session is currently operating on, or null if none is selected.",
      inputSchema: {},
    },
    async () => wrap("get_current_project", () => getCurrentProject(session)),
  )

  server.registerTool(
    "set_current_project",
    {
      description:
        "Select a project by id. All subsequent per-project tools (reads + writes) will target it.",
      inputSchema: { projectId: z.string().min(1) },
    },
    async (input) => wrap("set_current_project", () => setCurrentProject(session, input)),
  )

  // ── Reads ───────────────────────────────────────────────────────

  server.registerTool(
    "get_board_overview",
    {
      description:
        "Cheap summary of the current project's board: component + wire counts, each component's id/type/position/assigned pins, wire endpoints, and a short sketch summary. Prefer this before get_board_state — it is far smaller and usually enough to reason about the board.",
      inputSchema: {},
    },
    async () => wrap("get_board_overview", () => getBoardOverview(session)),
  )

  server.registerTool(
    "get_board_state",
    {
      description:
        "Return the current project's FULL board as a DreamerDiagram (DSL v1) — same shape `apply_design` accepts. Expensive (full payload); prefer get_board_overview unless you need every field.",
      inputSchema: {},
    },
    async () => wrap("get_board_state", () => getBoardState(session)),
  )

  server.registerTool(
    "list_components",
    {
      description:
        "List the current project's components (DSL shape): { id, type, at: [x,y], rotation, name?, pins?, properties }.",
      inputSchema: {},
    },
    async () => wrap("list_components", () => listComponents(session)),
  )

  server.registerTool(
    "list_wires",
    {
      description:
        "List the current project's wires (DSL shape) with readable endpoint strings ('arduino.13', 'led1.anode', …).",
      inputSchema: {},
    },
    async () => wrap("list_wires", () => listWires(session)),
  )

  server.registerTool(
    "get_sketch_code",
    {
      description: "Return the current project's Arduino sketch source.",
      inputSchema: {},
    },
    async () => wrap("get_sketch_code", () => getSketchCode(session)),
  )

  server.registerTool(
    "get_component_details",
    {
      description: "Fetch one component from the current project by id.",
      inputSchema: { componentId: z.string().min(1) },
    },
    async (input) => wrap("get_component_details", () => getComponentDetails(session, input)),
  )

  server.registerTool(
    "analyze_power_budget",
    {
      description:
        "Analyse per-pin load, rail load, and electrical safety of the current project's board. Returns a PowerBudgetReport.",
      inputSchema: {},
    },
    async () => wrap("analyze_power_budget", () => analyzePowerBudgetHandler(session)),
  )

  server.registerTool(
    "get_wiring_guide",
    {
      description:
        "Static reference: wire colours, wiring rules, component footprints, pin names, Arduino pin aliases.",
      inputSchema: {},
    },
    async () => wrap("get_wiring_guide", () => getWiringGuide()),
  )

  // ── Writes ──────────────────────────────────────────────────────

  server.registerTool(
    "validate_design",
    {
      description:
        "Dry-run check on a DreamerDiagram (DSL v1). Returns `issues[]` with severity/category/code/path/message. Does NOT modify the board. Call before `apply_design`.",
      inputSchema: diagramToolInputSchema.shape,
    },
    async (input) => wrap("validate_design", () => validateDesign(input)),
  )

  server.registerTool(
    "apply_design",
    {
      description:
        "Atomically replace the current project's board with a DreamerDiagram (DSL v1). Removes every existing component + wire and installs the new design. Also sets the sketch.",
      inputSchema: diagramToolInputSchema.shape,
    },
    async (input) => wrap("apply_design", () => applyDesign(session, input)),
  )

  server.registerTool(
    "update_sketch",
    {
      description:
        "Replace the current project's Arduino sketch. Validated before accepting (balanced braces, setup/loop present).",
      inputSchema: { code: z.string() },
    },
    async (input) => wrap("update_sketch", () => updateSketch(session, input)),
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
    async (input) => wrap("patch_sketch", () => patchSketch(session, input)),
  )

  // ── Custom parts (global, not project-scoped) ───────────────────

  server.registerTool(
    "list_custom_parts",
    {
      description:
        "List the user's custom components as [{ id, format }], where format is 'code' (a TS module) or 'dsl' (a declarative spec).",
      inputSchema: {},
    },
    async () => wrap("list_custom_parts", () => listCustomParts()),
  )

  server.registerTool(
    "get_custom_part",
    {
      description: "Fetch one custom part by id, returning its source and format.",
      inputSchema: { id: z.string().min(1) },
    },
    async (input) => wrap("get_custom_part", () => getCustomPart(input)),
  )

  server.registerTool(
    "validate_custom_part",
    {
      description:
        `Dry-run validate a custom-component DSL spec: structural schema PLUS semantic lint (pin refs, expression syntax, binding targets). Returns { valid: true, id, warnings? } or { valid: false, issues[], warnings? }. Does NOT save. ${DSL_SHAPE}`,
      inputSchema: { spec: z.record(z.string(), z.unknown()) },
    },
    async (input) => wrap("validate_custom_part", () => validateCustomPart(input)),
  )

  server.registerTool(
    "save_custom_part",
    {
      description:
        `Create or update a custom component from a DSL spec. The id is the name after "custom:" in spec.type. Validated (schema + semantic lint) before saving; the saved part appears in the palette, simulates like a built-in, and — when it declares behavior signals — reacts live to the sketch code driving its pins. ${DSL_GUIDE}`,
      inputSchema: { spec: z.record(z.string(), z.unknown()) },
    },
    async (input) => wrap("save_custom_part", () => saveCustomPart(input)),
  )

  server.registerTool(
    "delete_custom_part",
    {
      description: "Delete a custom part by id.",
      inputSchema: { id: z.string().min(1) },
    },
    async (input) => wrap("delete_custom_part", () => deleteCustomPart(input)),
  )
}
