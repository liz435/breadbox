// ── External-edit prompt builder ────────────────────────────────────────────
//
// Bundles a DreamerDiagram (DSL v1) together with an auto-generated format
// spec into a single Markdown prompt a user can paste into ANY external chat
// (claude.ai, ChatGPT, …) to get a valid, edited diagram back — no Anthropic
// API key, no MCP, and no Claude Code required. The chat does the thinking;
// the user round-trips the JSON back through the Diagram Panel's Apply button.
//
// The component/pin reference and board-target list are GENERATED from the
// canonical registries (componentTypeSchema, getComponentPinNames,
// BOARD_TARGETS) so they can never drift from the schema. The conventions,
// guardrails, and the worked example are distilled from the in-app agent's
// prompt (packages/api/src/agents/core/prompts.ts) and wiring guide — the same
// guidance that makes the MCP/agent path produce better circuits than a thin
// one-shot prompt would.

import { componentTypeSchema, isBoardComponentType } from "./arduino";
import { getComponentPinNames } from "./component-pins";
import { BOARD_TARGETS } from "./board-targets";
import { DIAGRAM_SCHEMA_V1, type DreamerDiagramInput } from "./design";
import { type DiagramIssue } from "./diagram-validator";

// Component types that exist in the schema but aren't placed parts with named,
// wireable pins — excluded from the generated pin reference.
const NON_WIREABLE_TYPES = new Set(["wire", "multimeter", "ir_remote"]);

/** One `  type: pin, pin, …` line per wireable component type. Generated from
 *  the component-type enum + the pin-name registry, so new types appear here
 *  automatically. */
function componentPinReference(): string {
  const lines: string[] = [];
  for (const type of componentTypeSchema.options) {
    if (isBoardComponentType(type) || NON_WIREABLE_TYPES.has(type)) continue;
    const pins = getComponentPinNames(type);
    if (pins.length > 0) {
      lines.push(`  ${type}: ${pins.join(", ")}`);
    } else if (type === "power_supply") {
      lines.push(`  power_supply: wire via <id>.+ and <id>.- (no named pins)`);
    } else if (type === "ic") {
      lines.push(`  ic: generic chip — you name its pins yourself`);
    }
  }
  return lines.join("\n");
}

/** `  id — label, mcu` per supported board. Generated from BOARD_TARGETS. */
function boardTargetReference(): string {
  return Object.values(BOARD_TARGETS)
    .map((b) => `  ${b.id} — ${b.label}, ${b.mcu}`)
    .join("\n");
}

// The wire-endpoint grammar mirrors the table in diagram-adapter.ts. Stable
// enough to keep as prose; the adapter is the source of truth on resolution.
const WIRE_ENDPOINT_GRAMMAR = `  arduino.<n>        digital pin, e.g. arduino.13
  arduino.A<n>       analog pin, e.g. arduino.A0  (A0–A5 on Uno/Nano)
  arduino.D<n>       alias for arduino.<n>
  arduino.GND        ground  (also arduino.5V, arduino.3V3, arduino.VIN, arduino.AREF)
  <id>.<pin>         a component pin, e.g. led1.anode, pot1.signal
  <psuId>.+ / .-     external power-supply rails
  grid.<row>,<col>   raw breadboard cell (rarely needed)`;

// Arduino Uno pin IDs — from COMMON_PROMPT in the agent prompt.
const ARDUINO_PINS = `Arduino Uno pin IDs (in wire endpoints and the sketch):
  Digital D0–D13 = 0–13 · Analog A0–A5 (write them as arduino.A0 … arduino.A5)
  PWM-capable (needed for analogWrite / fades): 3, 5, 6, 9, 10, 11
  Power: arduino.5V, arduino.3V3, arduino.GND`;

// Breadboard layout + footprint heights — from the agent's "Board row budget".
const LAYOUT_RULES = `Breadboard layout (so parts don't overlap or accidentally short):
  - Grid is 30 rows (0–29) × columns 0–9. Cols 0–4 form one bus, 5–9 another,
    with a no-connect gap between col 4 and col 5.
  - Put each component on its OWN rows; leave ~2 empty rows between parts.
  - Footprint heights (rows): led/rgb_led/button = 2 · resistor = 1 ·
    servo/potentiometer/sensors/capacitor = 3 · seven_segment = 9 · lcd_16x2 = 12.
  - resistor and button straddle the center gap: one pin at col 3, the other at col 6.`;

// Wiring conventions — distilled from the agent wiring guide + button rules.
// Emphasises EXPLICIT wires (don't rely on the bus) so layouts stay robust.
const WIRING_RULES = `Wiring conventions:
  - Make EVERY connection an explicit wire — never rely on two pins merely sharing a row.
  - One wire per Arduino pin; to fan a net out, land it on a row/rail and branch from there.
  - LED: Arduino pin → led.anode; led.cathode → a ~220Ω resistor → arduino.GND. Never wire an LED straight to a pin.
  - Button: a → an Arduino pin, b → arduino.GND, and use INPUT_PULLUP (pressed reads LOW, rest reads HIGH).
  - 3-pin parts (servo/pot/sensor): signal → Arduino pin, vcc → arduino.5V, gnd → arduino.GND — each on its own row.
  - High-current loads (servo/motor/relay): power from an external power_supply and share a common ground with the Arduino.
  - Wire colors: 5V red "#ef4444", GND black "#1e293b", and a distinct color per signal line.`;

// Exact pin names matter — call out the ones models most often get wrong.
const PIN_GOTCHAS = `Pin-name gotchas (use these EXACT names):
  - seven_segment: a,b,c,d,e,f,g,dp,gnd — NOT "com" or "cathode".
  - lcd_16x2: power pins are vss,vdd — NOT "vcc"/"gnd".
  - led: anode,cathode — NOT "+"/"-". capacitor/buzzer: positive,negative.
  - oled_display: I²C — wire BOTH scl and sda (to A5/A4 on Uno).`;

// Transpiler-safe C++ subset — lifted from TRANSPILE_GUARDRAIL_BLOCK in the
// agent prompt. Sketches outside this subset fail compilation.
const SKETCH_GUARDRAILS = `Sketch must stay in the transpiler-safe C++ subset:
  - No pointers, pass-by-reference (&), templates, or namespaces.
  - NO 2-D array initializers (int a[N][M] = {{…}}) — use flat if/else or switch/case.
  - No array initializers built from const variables — assign each element directly.
  - Prefer plain globals, 1-D literal arrays, simple loops, direct function calls.
  - For digit/segment lookup tables, use if(n==0){a=1;…} chains, NOT 2-D arrays.`;

// What the importer checks — so the model avoids hard errors and the common
// semantic warnings.
const VALIDATION_NOTES = `On import the diagram is validated. Hard errors (reject the whole diagram):
unknown component type, invalid pin name, or an unresolvable wire endpoint.
Warnings to avoid: a component with no wires (dangling), a pin the sketch drives
that no wire connects, or a ground/cathode/negative pin with no path to GND.
Routing an LED's cathode to GND through its resistor still counts as grounded.`;

// A complete, known-good example. Mirrors the LED-blink DSL example in the
// agent prompt; validated by diagram-prompt.test.ts so it can never ship broken.
const WORKED_EXAMPLE: DreamerDiagramInput = {
  $schema: DIAGRAM_SCHEMA_V1,
  board: "arduino_uno",
  sketch:
    "void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}\n",
  components: [
    { id: "led1", type: "led", at: [5, 7], rotation: 0, properties: { color: "#ef4444" } },
    { id: "r1", type: "resistor", at: [5, 3], rotation: 0, properties: { resistance: 220 } },
  ],
  wires: [
    { from: "arduino.13", to: "led1.anode", color: "#22c55e" },
    { from: "led1.cathode", to: "r1.b", color: "#1e293b" },
    { from: "r1.a", to: "arduino.GND", color: "#1e293b" },
  ],
};

/** The validated worked-example diagram, exported so tests can assert it stays
 *  valid as the schema/validator evolve. */
export const WORKED_EXAMPLE_DIAGRAM: DreamerDiagramInput = WORKED_EXAMPLE;

export type ExternalEditPromptOptions = {
  /**
   * The user's requested change, baked into the `## My change` section so the
   * pasted prompt is ready to send as-is. When omitted/blank, a placeholder is
   * left for the user to fill in inside the chat.
   */
  change?: string;
};

/**
 * Build a self-contained Markdown prompt around a diagram JSON string so it can
 * be pasted into any external chat. `diagramJson` is embedded verbatim (it is
 * the document to edit), so pass whatever the user currently sees — typically
 * the pretty-printed Diagram Panel buffer. Pass `options.change` to pre-fill
 * the requested edit.
 */
export function buildExternalEditPrompt(
  diagramJson: string,
  options: ExternalEditPromptOptions = {},
): string {
  const change = options.change?.trim();
  const changeBlock = change && change.length > 0 ? change : "<describe the change you want here>";
  return `# Edit this Breadbox circuit

You are editing a Breadbox circuit, expressed as a \`${DIAGRAM_SCHEMA_V1}\` JSON document
(an Arduino sketch plus the components and wires that make up the breadboard wiring).

Apply the change I describe below, then reply with **only** the complete updated JSON
document — no explanation, no markdown code fences, nothing else. It must be valid
\`${DIAGRAM_SCHEMA_V1}\` and follow the spec.

## My change
${changeBlock}

## Current diagram
\`\`\`json
${diagramJson}
\`\`\`

## Format spec

Top level: { "$schema": "${DIAGRAM_SCHEMA_V1}", "board": "<board id>", "sketch": "<Arduino C++>", "components": [...], "wires": [...] }
A component: { "id": "<unique; not 'arduino' or 'grid'>", "type": "<see below>", "at": [row, col], "properties": {} }
A wire: { "from": "<endpoint>", "to": "<endpoint>", "color": "<hex>" }

Boards:
${boardTargetReference()}

Component types and their valid pin names:
${componentPinReference()}

Wire endpoints (the from/to strings):
${WIRE_ENDPOINT_GRAMMAR}

${ARDUINO_PINS}

${LAYOUT_RULES}

${WIRING_RULES}

${PIN_GOTCHAS}

${SKETCH_GUARDRAILS}

${VALIDATION_NOTES}

## Worked example
A complete, valid diagram — a blinking LED on pin 13 with a 220Ω series resistor
to ground. Match this shape (explicit wires, resistor before ground, exact pin
names, transpiler-safe sketch):
\`\`\`json
${JSON.stringify(WORKED_EXAMPLE, null, 2)}
\`\`\`

## Before you reply, self-check
  - Every component connects via explicit wires; no dangling parts.
  - Every Arduino pin the sketch drives (pinMode/digitalWrite/analogRead/…) has a wire.
  - Grounds reach arduino.GND; LEDs go through a resistor; buttons use INPUT_PULLUP.
  - Component types and pin names exactly match the lists above.
  - The sketch obeys the transpiler-safe subset.

Reply with the updated \`${DIAGRAM_SCHEMA_V1}\` JSON document only.
`;
}

/** One readable bullet per validator issue, e.g.
 *  `  - [error/structural] INVALID_WIRE_ENDPOINT at wires[2].to: … — try …`. */
function formatIssue(issue: DiagramIssue): string {
  const where = issue.path ? ` at ${issue.path}` : "";
  const fix = issue.suggestion ? ` — ${issue.suggestion}` : "";
  return `  - [${issue.severity}/${issue.category}] ${issue.code}${where}: ${issue.message}${fix}`;
}

/**
 * Build a follow-up prompt to paste back into the SAME chat after a pasted
 * diagram fails to apply: it lists the validator's issues and the diagram that
 * produced them, and asks for a corrected document. This is the manual stand-in
 * for the MCP/agent path's validate→fix loop.
 */
export function buildFixRequestPrompt(diagramJson: string, issues: DiagramIssue[]): string {
  const issueLines =
    issues.length > 0
      ? issues.map(formatIssue).join("\n")
      : "  - (the diagram didn't validate, but no specific issues were reported)";
  return `# Fix this Breadbox circuit

The diagram below didn't pass validation. Fix **every** issue listed, then reply
with **only** the corrected \`${DIAGRAM_SCHEMA_V1}\` JSON document — no prose, no
code fences.

## Issues to fix
${issueLines}

## Diagram to fix
\`\`\`json
${diagramJson}
\`\`\`

Keep the rest of the circuit intact and follow the same rules we used before
(exact component types and pin names, explicit wires, every ground reaches
arduino.GND — LEDs through their resistor — and a transpiler-safe sketch).

Reply with the corrected JSON document only.
`;
}
