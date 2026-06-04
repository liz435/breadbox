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
// BOARD_TARGETS) so they can never drift from the schema. The conventions and
// validation notes are distilled from the in-app agent's wiring guide and the
// importer's checks (see diagram-validator.ts) — kept short so the whole
// bundle stays a few hundred tokens.

import { componentTypeSchema, isBoardComponentType } from "./arduino";
import { getComponentPinNames } from "./component-pins";
import { BOARD_TARGETS } from "./board-targets";
import { DIAGRAM_SCHEMA_V1 } from "./design";

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

// Distilled from the agent wiring guide. Short, paste-friendly do/don'ts.
const CONVENTIONS = `  - Connections come from WIRES, not pin numbers — every pin you use needs a wire.
  - Wire colors: power/5V red "#ef4444", ground black "#1e293b", signals any other color.
  - One wire per Arduino pin; to fan a net out, land it on a breadboard row/rail and branch from there.
  - LEDs need a series resistor (~220Ω) between the LED and ground — never tie an Arduino pin straight to an LED.
  - Buttons: wire pin a → an Arduino pin, pin b → GND, and use INPUT_PULLUP (pressed reads LOW).
  - Every component needs a ground path back to Arduino GND (or the supply's -).
  - 3-pin parts (servo, pot, sensors) put each pin on its own breadboard row so they don't short together.
  - High-current loads (servo, motor, relay): use an external power_supply and share a common ground with the Arduino.`;

// Mirrors the importer's structural + semantic checks (diagram-validator.ts).
const VALIDATION_NOTES = `The circuit is validated on import. Never produce a structural error, and avoid these warnings:
  - structural error: unknown component type, invalid pin name, or an unresolvable wire endpoint (rejects the whole diagram)
  - DANGLING_COMPONENT: a component with no wires touching any of its pins
  - PIN_NOT_WIRED: the sketch drives a pin that no wire connects
  - MISSING_GROUND: a gnd/cathode/negative pin not wired to GND or a supply -
  - MISSING_I2C_WIRING: an I²C part (e.g. OLED) with sda/scl left unwired
  - EMPTY_SKETCH: components placed but the sketch has no real code`;

export type ExternalEditPromptOptions = {
  /**
   * The user's requested change, baked into the `## My change` section so the
   * pasted prompt is ready to send as-is. When omitted/blank, a placeholder is
   * left for the user to fill in inside the chat.
   */
  change?: string
}

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

Conventions:
${CONVENTIONS}

${VALIDATION_NOTES}

Remember: reply with the updated JSON document only.
`;
}
