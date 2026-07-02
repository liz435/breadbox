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

/**
 * A complete, valid actuator example showing behavior signals + visual
 * bindings: a STEP/DIR stepper whose rotor turns as sketch code pulses the
 * step pin. Also the art-quality bar: layered body, faceplate, bolts, an
 * id'd rotor group, a label. Kept in sync via custom-component-prompt.test.ts.
 */
export const WORKED_EXAMPLE_ACTUATOR = {
  type: "custom:stepper-motor",
  label: "Stepper Motor",
  category: "output",
  description: "NEMA-17 style stepper behind a STEP/DIR driver, 1.8° per step",
  pins: [
    { name: "step", dx: 0, dy: 0, role: "digital" },
    { name: "dir", dx: 0, dy: 1, role: "digital" },
    { name: "vcc", dx: 0, dy: 2, role: "power" },
    { name: "gnd", dx: 0, dy: 3, role: "ground" },
  ],
  properties: { stepAngle: 1.8 },
  size: { width: 60, height: 60 },
  svg:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
    "<defs><radialGradient id='face' cx='0.35' cy='0.35' r='0.9'>" +
    "<stop offset='0' stop-color='#64748b'/><stop offset='1' stop-color='#334155'/>" +
    "</radialGradient></defs>" +
    "<rect x='6' y='6' width='88' height='88' rx='10' fill='#1e293b' stroke='#475569' stroke-width='2'/>" +
    "<circle cx='15' cy='15' r='3.5' fill='#0f172a' stroke='#64748b'/>" +
    "<circle cx='85' cy='15' r='3.5' fill='#0f172a' stroke='#64748b'/>" +
    "<circle cx='15' cy='85' r='3.5' fill='#0f172a' stroke='#64748b'/>" +
    "<circle cx='85' cy='85' r='3.5' fill='#0f172a' stroke='#64748b'/>" +
    "<circle cx='50' cy='50' r='34' fill='url(#face)' stroke='#64748b'/>" +
    "<circle cx='50' cy='50' r='29' fill='#0f172a'/>" +
    "<g id='rotor'>" +
    "<circle cx='50' cy='50' r='9' fill='#cbd5e1' stroke='#64748b'/>" +
    "<rect x='48.75' y='42' width='2.5' height='8' rx='1' fill='#f59e0b'/>" +
    "</g>" +
    "<text x='50' y='97' text-anchor='middle' font-size='7' fill='#94a3b8' font-family='monospace'>NEMA 17</text>" +
    "</svg>",
  electrical: {
    elements: [
      { kind: "input_impedance", pin: "step" },
      { kind: "input_impedance", pin: "dir" },
    ],
  },
  behavior: {
    signals: [
      { kind: "count", name: "steps", pin: "step", direction: "dir" },
      { kind: "expr", name: "angle", expr: "steps * stepAngle" },
    ],
  },
  visual: {
    bindings: [{ target: "rotor", rotate: "angle", originX: 50, originY: 50 }],
  },
  sketch: {
    globals: ["const int STEP_PIN = {{pin.step}}; // {{name}}", "const int DIR_PIN = {{pin.dir}};"],
    setup: ["pinMode(STEP_PIN, OUTPUT);", "pinMode(DIR_PIN, OUTPUT);"],
    loop: [
      "digitalWrite(DIR_PIN, HIGH);",
      "for (int i = 0; i < 200; i++) { digitalWrite(STEP_PIN, HIGH); delayMicroseconds(800); digitalWrite(STEP_PIN, LOW); delayMicroseconds(800); }",
      "delay(500);",
    ],
  },
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
  look: { keys: ["svg", "accentColor", "size", "visual"], phrase: "the part's visual appearance and animation bindings" },
  behavior: { keys: ["electrical", "behavior"], phrase: "how the part affects the circuit and reacts to pin activity" },
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
  "electrical"?: { "elements": [ <element>, ... ] },   // what the circuit solver sees
  "behavior"?: { "signals": [ <signal>, ... ] },   // live values derived from pin activity
  "visual"?: { "bindings": [ <binding>, ... ] },   // animate SVG elements from signals
  "sketch"?: { "includes"?: [], "globals"?: [], "setup"?: [], "loop"?: [] }   // Arduino code
}

Each electrical element contributes one SPICE primitive between named pins:
  { "kind": "resistor", "a": "<pinRef>", "b": "<pinRef>", "ohms": <number|expr> }
  { "kind": "source",   "plus": "<pinRef>", "minus": "<pinRef>", "volts": <number|expr> }
  { "kind": "input_impedance", "pin": "<pinRef>", "ohms"?: <number|expr> }   // pulldown to ground (default 10000)

Behavior signals make the part react to sketch code at runtime. Each has a unique
identifier "name" other expressions can reference:
  { "kind": "digital",   "name", "pin" }                       // the pin's level, 0|1
  { "kind": "pwm",       "name", "pin" }                       // measured duty cycle 0..1
  { "kind": "count",     "name", "pin", "direction"?: "<pin>" } // rising edges; ±1 by DIR level
  { "kind": "frequency", "name", "pin" }                       // rising-edge Hz; 0 when idle
  { "kind": "integrate", "name", "rate": <expr>, "min"?, "max"?, "wrap"? } // value += rate × seconds
  { "kind": "expr",      "name", "expr": <expr> }              // derived value
Give animated SVG elements an id and bind them (numbers or expressions over
properties + signals; rotation/scale default to the element's own center):
  { "target": "<svg element id>", "rotate"?, "originX"?, "originY"?,
    "translateX"?, "translateY"?, "scale"?, "opacity"? }

- A <pinRef> is a declared pin name, or "0" for ground; signal pins are declared pin names.
- A <number|expr> is a JSON number OR a string expression over the part's properties
  (and, in behavior/visual, its signals): arithmetic + - * / %, comparisons
  (< > <= >= == !=), parentheses, and the functions min, max, abs, clamp, floor,
  ceil, round, sqrt, pow. Example: "moisture / 100 * 5".
  No other identifiers and no other functions — it is sandboxed.

Sketch templates: each line may use {{name}} (the placed part's name) and
{{pin.<pinName>}} (the Arduino pin the user wired that pin to). \`includes\` and
\`globals\` go at file top, \`setup\` inside setup(), \`loop\` inside loop().

Make the part look like the real component, not a placeholder box: declare a
viewBox, layer a body, face/silkscreen details, legs or terminals, and a text
label; give every animated element an id. Aim for the visual quality of the
stepper example below.

## Worked example 1 — sensor (electrical only)
An analog sensor whose signal pin reports value/100 × 5V:
\`\`\`json
${JSON.stringify(WORKED_EXAMPLE_PART, null, 2)}
\`\`\`

## Worked example 2 — actuator (signals + animation)
A STEP/DIR stepper motor: the sketch pulses \`step\`, the \`steps\` counter tracks
edges (±1 by the \`dir\` level), and the rotor group rotates by the derived angle:
\`\`\`json
${JSON.stringify(WORKED_EXAMPLE_ACTUATOR, null, 2)}
\`\`\`

## Before you reply, self-check
  - "type" is "custom:" + a kebab-case id; "label" and at least one pin are present.
  - Every pinRef in electrical.elements is a declared pin name or "0"; every signal
    pin is a declared pin name.
  - Every expression uses only the part's properties/signals and the allowed
    operators/functions; signal names are unique identifiers.
  - Every visual binding targets an id that exists in the svg, and the svg has a viewBox.
  - Sketch placeholders reference real pin names, and the sketch actually drives the
    pins the behavior signals watch (so the part moves when the code runs).

Reply with the updated JSON document only.
`;
}
