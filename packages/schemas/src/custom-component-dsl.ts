// ── Custom Component DSL ─────────────────────────────────────────────────────
//
// A declarative, portable description of a user-authored component. Unlike the
// code-module form (`(host) => host.defineComponent(...)`), this is pure data:
// safe to validate/apply via MCP and to copy-paste to/from a chatbot. The app
// compiles it into the same runtime ComponentDefinition (see dsl-to-definition).
//
// The only thing that "can't be data" — simulation behaviour — is expressed as
// a list of SPICE primitives between named pins, with numeric params that may be
// expression strings over the component's properties (see expr-eval).

import { z } from "zod";

/** A pin reference inside an element: a declared pin name, or "0" for SPICE ground. */
const pinRefSchema = z.string().min(1);

/** A numeric parameter: a literal, or an expression string over properties. */
const numberOrExpr = z.union([z.number(), z.string().min(1)]);

const dslPinSchema = z.object({
  name: z.string().min(1),
  dx: z.number().int(),
  dy: z.number().int(),
  role: z.enum(["power", "ground", "digital", "analog", "io"]).optional(),
});

/** A SPICE primitive the part contributes to the circuit. */
export const dslElementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resistor"), a: pinRefSchema, b: pinRefSchema, ohms: numberOrExpr }),
  z.object({ kind: z.literal("source"), plus: pinRefSchema, minus: pinRefSchema, volts: numberOrExpr }),
  // A high-impedance input: a pulldown from `pin` to ground (models a CMOS input).
  z.object({ kind: z.literal("input_impedance"), pin: pinRefSchema, ohms: numberOrExpr.default(10000) }),
]);

const dslSketchSchema = z.object({
  includes: z.array(z.string()).default([]),
  globals: z.array(z.string()).default([]),
  setup: z.array(z.string()).default([]),
  loop: z.array(z.string()).default([]),
});

export const customComponentDslSchema = z.object({
  /** "custom:<kebab-name>" — the name after "custom:" is the id. */
  type: z.string().regex(/^custom:[a-z0-9-]+$/, "type must be custom:<kebab-name>"),
  label: z.string().min(1),
  category: z.enum(["output", "input", "passive", "display", "other"]).optional(),
  description: z.string().optional(),
  /** Named pins with a grid offset (dx columns, dy rows) from the placement origin. */
  pins: z.array(dslPinSchema).min(1),
  /** Default, user-tweakable numeric properties (referenced by element expressions). */
  properties: z.record(z.string(), z.number()).default({}),
  /** Pixel size of the body; defaults to the pin extent. */
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  accentColor: z.string().optional(),
  electrical: z
    .object({ elements: z.array(dslElementSchema).default([]) })
    .default({ elements: [] }),
  /** Arduino sketch templates. Placeholders: {{name}}, {{pin.<name>}}. */
  sketch: dslSketchSchema.optional(),
});

export type DslElement = z.infer<typeof dslElementSchema>;
export type CustomComponentDsl = z.infer<typeof customComponentDslSchema>;
