// ── Custom Component DSL ─────────────────────────────────────────────────────
//
// A declarative, portable description of a user-authored component. Unlike the
// code-module form (`(host) => host.defineComponent(...)`), this is pure data:
// safe to validate/apply via MCP and to copy-paste to/from a chatbot. The app
// compiles it into the same runtime ComponentDefinition (see dsl-to-definition).
//
// Simulation behaviour stays data too, split across two facets:
//   - `electrical.elements`: SPICE primitives between named pins (what the part
//     looks like to the circuit solver), with numeric params that may be
//     expression strings over the component's properties (see expr-eval).
//   - `behavior.signals`: named runtime values derived from live pin activity
//     (edge counts, PWM duty, frequency, integrators) — how sketch code drives
//     the part. Compiled into a generic peripheral on the simulator's bus.
// `visual.bindings` then animates elements of the part's SVG from those signals.

import { z } from "zod";

/** A pin reference inside an element: a declared pin name, or "0" for SPICE ground. */
const pinRefSchema = z.string().min(1);

/** A declared pin name (signals watch real pins, so "0"/ground is not allowed). */
const pinNameSchema = z.string().min(1);

/** A signal name: a valid expression identifier so other expressions can reference it. */
const signalNameSchema = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "signal names must be identifiers");

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

/**
 * A named runtime signal derived from live pin activity during simulation.
 * Signals make a part *controllable from sketch code*: the sketch toggles the
 * Arduino pins the part is wired to, and the signals turn that pin traffic
 * into numbers (a step count, a duty cycle, an accumulated angle) that
 * `visual.bindings` can animate and other expressions can reference.
 */
export const dslSignalSchema = z.discriminatedUnion("kind", [
  /** The current digital level (0 or 1) of a pin. */
  z.object({ kind: z.literal("digital"), name: signalNameSchema, pin: pinNameSchema }),
  /** Measured PWM duty cycle (0..1) on a pin; settles to the DC level when edges stop. */
  z.object({ kind: z.literal("pwm"), name: signalNameSchema, pin: pinNameSchema }),
  /**
   * Rising-edge counter on `pin`. With `direction` set, each edge adds +1 when
   * the direction pin is HIGH and -1 when LOW — a stepper's STEP/DIR pair.
   */
  z.object({
    kind: z.literal("count"),
    name: signalNameSchema,
    pin: pinNameSchema,
    direction: pinNameSchema.optional(),
  }),
  /** Rising-edge frequency in Hz on a pin; decays to 0 when edges stop. */
  z.object({ kind: z.literal("frequency"), name: signalNameSchema, pin: pinNameSchema }),
  /**
   * Accumulator: value += rate × elapsed seconds, evaluated continuously.
   * `rate` is an expression over properties and other signals (e.g. a duty
   * cycle × max RPM for a spinning DC motor). Optional clamp and modulo wrap
   * (`wrap: 360` keeps an angle in [0, 360)).
   */
  z.object({
    kind: z.literal("integrate"),
    name: signalNameSchema,
    rate: z.string().min(1),
    min: z.number().optional(),
    max: z.number().optional(),
    wrap: z.number().positive().optional(),
  }),
  /** A derived value: an expression over properties and previously listed signals. */
  z.object({ kind: z.literal("expr"), name: signalNameSchema, expr: z.string().min(1) }),
]);

/**
 * Binds one SVG element (looked up by `target` id inside the part's `svg`) to
 * expressions over properties + behavior signals. Numeric-only by design —
 * the same sandboxed expression grammar as electrical params.
 */
export const dslBindingSchema = z.object({
  /** The `id` of an element inside the part's SVG (e.g. "rotor"). */
  target: z.string().min(1),
  /** Rotation in degrees, about (originX, originY) or the element's own center. */
  rotate: numberOrExpr.optional(),
  /** Rotation/scale origin in the SVG's own viewBox coordinates. */
  originX: z.number().optional(),
  originY: z.number().optional(),
  /** Translation in viewBox units. */
  translateX: numberOrExpr.optional(),
  translateY: numberOrExpr.optional(),
  /** Uniform scale factor about the origin. */
  scale: numberOrExpr.optional(),
  /** Opacity 0..1 (e.g. an indicator LED bound to a digital signal). */
  opacity: numberOrExpr.optional(),
});

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
  /**
   * Raw SVG markup drawn as the part's body, scaled to the footprint with the
   * pins overlaid. Omit to fall back to the auto-generated labeled box.
   */
  svg: z.string().optional(),
  electrical: z
    .object({ elements: z.array(dslElementSchema).default([]) })
    .default({ elements: [] }),
  /** Runtime signals derived from pin activity — how sketch code drives the part. */
  behavior: z.object({ signals: z.array(dslSignalSchema).default([]) }).optional(),
  /** Animation bindings from behavior signals onto elements of `svg`. */
  visual: z.object({ bindings: z.array(dslBindingSchema).default([]) }).optional(),
  /** Arduino sketch templates. Placeholders: {{name}}, {{pin.<name>}}. */
  sketch: dslSketchSchema.optional(),
});

export type DslElement = z.infer<typeof dslElementSchema>;
export type DslSignal = z.infer<typeof dslSignalSchema>;
export type DslBinding = z.infer<typeof dslBindingSchema>;
export type CustomComponentDsl = z.infer<typeof customComponentDslSchema>;
