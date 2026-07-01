// ── Custom Part external-edit prompt builder ────────────────────────────────
//
// Wraps a custom-component DSL spec in a self-contained Markdown prompt a user
// can paste into ANY external chat. Mirrors buildExternalEditPrompt (the diagram
// equivalent): the chat edits the JSON and replies with ONLY the updated JSON,
// which the user pastes back into the editor. The format spec is embedded so the
// chat doesn't need the schema.

/** A complete, valid worked example — kept in sync via custom-component-prompt.test.ts. */
export const WORKED_EXAMPLE_PART = {
  type: "custom:soil-moisture",
  label: "Soil Moisture",
  category: "input",
  pins: [
    { name: "vcc", dx: 0, dy: 0, role: "power" },
    { name: "gnd", dx: 0, dy: 1, role: "ground" },
    { name: "sig", dx: 0, dy: 2, role: "analog" },
  ],
  properties: { moisture: 50 },
  electrical: {
    elements: [{ kind: "source", plus: "sig", minus: "0", volts: "moisture / 100 * 5" }],
  },
  sketch: { loop: ["int v = analogRead({{pin.sig}}); // {{name}}"] },
};

/** The editable facets of a custom part — one row per facet in the editor. */
export type CustomPartFacet =
  | "info"
  | "pins"
  | "properties"
  | "look"
  | "behavior"
  | "firmware";

/** Which DSL keys each facet owns, plus a human phrase for the scoped prompt. */
const FACET_SPEC: Record<CustomPartFacet, { keys: string[]; phrase: string }> = {
  info: { keys: ["type", "label", "category", "description"], phrase: "the part's identity and palette metadata" },
  pins: { keys: ["pins"], phrase: "the named pins and their grid offsets" },
  properties: { keys: ["properties"], phrase: "the user-tweakable numeric properties" },
  look: { keys: ["svg", "accentColor", "size"], phrase: "the part's visual appearance" },
  behavior: { keys: ["electrical"], phrase: "how the part affects the circuit" },
  firmware: { keys: ["sketch"], phrase: "the Arduino code the part generates" },
};

export type CustomPartPromptOptions = {
  /** The user's requested change, baked into `## My change`. */
  change?: string;
  /** Restrict the requested edit to a single facet of the part. */
  facet?: CustomPartFacet;
};

export function buildCustomPartPrompt(specJson: string, options: CustomPartPromptOptions = {}): string {
  const change = options.change?.trim();
  const changeBlock = change && change.length > 0 ? change : "<describe the change you want here>";
  const facet = options.facet ? FACET_SPEC[options.facet] : null;
  const focusBlock = facet
    ? `## Focus\nChange **only** ${facet.phrase} — the \`${facet.keys.join("`, `")}\` field${facet.keys.length > 1 ? "s" : ""}. Leave every other field exactly as it is. Still reply with the complete JSON document.\n\n`
    : "";
  return `# Edit this Breadbox custom component

You are editing a Breadbox **custom component** — a reusable breadboard part,
expressed as a single JSON document (its pins, properties, how it affects the
circuit, and the Arduino code it generates).

Apply the change I describe below, then reply with **only** the complete updated
JSON document — no explanation, no markdown code fences, nothing else. It must be
valid and follow the spec.

## My change
${changeBlock}

${focusBlock}## Current part
\`\`\`json
${specJson}
\`\`\`

## Format spec

A custom component is one JSON object:
{
  "type": "custom:<kebab-name>",   // unique; the name after "custom:" is the id
  "label": "<human label>",
  "category": "input" | "output" | "passive" | "display" | "other",   // optional
  "pins": [ { "name": "<pin>", "dx": <int cols>, "dy": <int rows>, "role"?: "power"|"ground"|"digital"|"analog"|"io" } ],
  "properties"?: { "<name>": <number> },   // user-tweakable; referenced by expressions
  "accentColor"?: "<css color>",   // body tint for the auto-generated box
  "svg"?: "<raw SVG markup>",   // custom look, scaled to the part; pins drawn on top (omit for the auto box)
  "electrical"?: { "elements": [ <element>, ... ] },   // how the part affects the circuit
  "sketch"?: { "includes"?: [], "globals"?: [], "setup"?: [], "loop"?: [] }   // Arduino code
}

Each electrical element contributes one SPICE primitive between named pins:
  { "kind": "resistor", "a": "<pinRef>", "b": "<pinRef>", "ohms": <number|expr> }
  { "kind": "source",   "plus": "<pinRef>", "minus": "<pinRef>", "volts": <number|expr> }
  { "kind": "input_impedance", "pin": "<pinRef>", "ohms"?: <number|expr> }   // pulldown to ground (default 10000)

- A <pinRef> is a declared pin name, or "0" for ground.
- A <number|expr> is a JSON number OR a string expression over the part's properties:
  arithmetic + - * / %, comparisons (< > <= >= == !=), parentheses, and the functions
  min, max, abs, clamp, floor, ceil, round, sqrt, pow. Example: "moisture / 100 * 5".
  No other identifiers and no other functions — it is sandboxed.

Sketch templates: each line may use {{name}} (the placed part's name) and
{{pin.<pinName>}} (the Arduino pin the user wired that pin to). \`includes\` and
\`globals\` go at file top, \`setup\` inside setup(), \`loop\` inside loop().

## Worked example
A complete, valid part — an analog sensor whose signal pin reports value/100 × 5V:
\`\`\`json
${JSON.stringify(WORKED_EXAMPLE_PART, null, 2)}
\`\`\`

## Before you reply, self-check
  - "type" is "custom:" + a kebab-case id; "label" and at least one pin are present.
  - Every pinRef in electrical.elements is a declared pin name or "0".
  - Every expression uses only the part's properties and the allowed operators/functions.
  - Sketch placeholders reference real pin names.

Reply with the updated JSON document only.
`;
}
