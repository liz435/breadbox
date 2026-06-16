// ── Auto-placement ──────────────────────────────────────────────────────────
//
// Re-place a pasted diagram's discrete components onto their own, non-overlapping
// breadboard rows so the circuit never overlaps or accidentally shorts because an
// external chat picked bad `at: [row, col]` coordinates. This is the client-side
// stand-in for the agent's server-only `propose_circuit` placement.
//
// SAFETY: connectivity is preserved only when every connection is an explicit
// wire — named wire endpoints (e.g. led1.anode) resolve to wherever the component
// lands, so moving a component doesn't break its wires. Diagrams that rely on two
// pins implicitly sharing a breadboard row (no wire) would change meaning, which
// is why the external-edit prompt mandates explicit wires and the Apply step
// makes this an opt-out, undoable pass.

import { isBoardComponentType } from "./arduino";
import { resolveComponentPins } from "./component-pins";

const GAP = 2; // empty rows between independent components
const DEFAULT_COL = 2; // base column for vertical-footprint parts (left bus, cols 0–4)
const STRADDLE_COL = 3; // resistor/button straddle the center gap; the resolver forces their cols
const STRADDLE_TYPES = new Set(["resistor", "button"]);
const BOARD_ROWS = 30;

/** Footprint height (rows) derived from the canonical pin resolver, so it can't
 *  drift from real component geometry. Falls back to 1 row on any failure. */
function componentHeight(type: string): number {
  try {
    const pins = resolveComponentPins(type, 0, 0);
    const rows = Object.values(pins).map((p) => p.row);
    if (rows.length === 0) return 1;
    return Math.max(...rows) - Math.min(...rows) + 1;
  } catch {
    return 1;
  }
}

type LooseComponent = { type?: unknown; [key: string]: unknown };

function isDiscrete(type: unknown): type is string {
  return typeof type === "string" && !isBoardComponentType(type);
}

/**
 * Stack discrete components on their own rows (board/surface components are left
 * untouched). Returns the input unchanged if it isn't an array, or if the parts
 * wouldn't fit the board — never make the layout worse.
 */
export function autoPlaceComponents(components: unknown): unknown {
  if (!Array.isArray(components)) return components;

  // Would the stacked layout fit? If not, leave coordinates as the author set them.
  let needed = 0;
  for (const c of components) {
    const type = (c as LooseComponent)?.type;
    if (isDiscrete(type)) needed += componentHeight(type) + GAP;
  }
  if (needed > BOARD_ROWS) return components;

  let nextRow = 1;
  return components.map((c) => {
    const comp = c as LooseComponent;
    if (!isDiscrete(comp?.type)) return c;
    const row = nextRow;
    nextRow += componentHeight(comp.type) + GAP;
    const col = STRADDLE_TYPES.has(comp.type) ? STRADDLE_COL : DEFAULT_COL;
    return { ...comp, at: [row, col] };
  });
}

/**
 * Apply {@link autoPlaceComponents} to a parsed diagram-shaped object,
 * defensively: returns the input unchanged if it isn't diagram-shaped, so it's
 * safe to call on freshly-parsed (not-yet-validated) pasted JSON.
 */
export function autoPlaceDiagram(input: unknown): unknown {
  if (!input || typeof input !== "object" || !("components" in input)) return input;
  const components = (input as { components: unknown }).components;
  return { ...(input as object), components: autoPlaceComponents(components) };
}
