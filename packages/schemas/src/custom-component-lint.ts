// ── Custom Component semantic lint ──────────────────────────────────────────
//
// Cross-reference checks the zod schema can't express: pin refs must be
// declared pins, expressions must parse and only use known names, visual
// bindings must target ids that exist in the SVG. Shared by the MCP
// validate/save tools and the app editor so an agent gets actionable feedback
// at authoring time instead of a silently-dead part at runtime.
//
// Errors are things that would break the part (unknown pin, unparseable
// expression); warnings are things that make it worse than intended (binding
// with no matching SVG id, sketch placeholder for an undeclared pin).

import { evaluateExpression } from "./expr-eval";
import type { CustomComponentDsl, DslSignal } from "./custom-component-dsl";

export type DslLintIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

function checkExpr(
  expr: string,
  context: Record<string, number>,
  path: string,
  issues: DslLintIssue[],
): void {
  try {
    // Evaluate with every variable = 1: catches syntax errors, unknown
    // variables, and unknown functions without risking division by zero.
    evaluateExpression(expr, context);
  } catch (err) {
    issues.push({
      severity: "error",
      path,
      message: `expression "${expr}" is invalid: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function checkNumberOrExpr(
  value: number | string,
  context: Record<string, number>,
  path: string,
  issues: DslLintIssue[],
): void {
  if (typeof value === "string") checkExpr(value, context, path, issues);
}

/** Escape regex metacharacters so arbitrary ids (e.g. Figma's "Group 3.1") match literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signalPinRefs(signal: DslSignal): Array<{ field: string; pin: string }> {
  switch (signal.kind) {
    case "digital":
    case "pwm":
    case "frequency":
      return [{ field: "pin", pin: signal.pin }];
    case "count":
      return signal.direction
        ? [
            { field: "pin", pin: signal.pin },
            { field: "direction", pin: signal.direction },
          ]
        : [{ field: "pin", pin: signal.pin }];
    default:
      return [];
  }
}

/** Semantic checks on a structurally valid DSL spec. Empty result = clean. */
export function lintCustomComponentDsl(dsl: CustomComponentDsl): DslLintIssue[] {
  const issues: DslLintIssue[] = [];
  const pinNames = new Set(dsl.pins.map((p) => p.name));
  const propNames = Object.keys(dsl.properties);
  const signals = dsl.behavior?.signals ?? [];
  const bindings = dsl.visual?.bindings ?? [];

  // Contexts for expression checking: every known name bound to 1.
  const propContext: Record<string, number> = {};
  for (const name of propNames) propContext[name] = 1;
  const signalContext: Record<string, number> = { ...propContext };
  for (const s of signals) signalContext[s.name] = 1;

  // ── pins ──
  const seenPins = new Set<string>();
  dsl.pins.forEach((pin, i) => {
    if (seenPins.has(pin.name)) {
      issues.push({ severity: "error", path: `pins[${i}]`, message: `duplicate pin name "${pin.name}"` });
    }
    seenPins.add(pin.name);
  });

  // ── electrical.elements ──
  dsl.electrical.elements.forEach((el, i) => {
    const path = `electrical.elements[${i}]`;
    const refs =
      el.kind === "resistor"
        ? [el.a, el.b]
        : el.kind === "source"
          ? [el.plus, el.minus]
          : [el.pin];
    for (const ref of refs) {
      if (ref !== "0" && !pinNames.has(ref)) {
        issues.push({ severity: "error", path, message: `pin ref "${ref}" is not a declared pin (or "0")` });
      }
    }
    if (el.kind === "resistor") checkNumberOrExpr(el.ohms, propContext, `${path}.ohms`, issues);
    else if (el.kind === "source") checkNumberOrExpr(el.volts, propContext, `${path}.volts`, issues);
    else checkNumberOrExpr(el.ohms, propContext, `${path}.ohms`, issues);
  });

  // ── behavior.signals ──
  const seenSignals = new Set<string>();
  signals.forEach((signal, i) => {
    const path = `behavior.signals[${i}]`;
    if (seenSignals.has(signal.name)) {
      issues.push({ severity: "error", path, message: `duplicate signal name "${signal.name}"` });
    }
    seenSignals.add(signal.name);
    if (propNames.includes(signal.name)) {
      issues.push({
        severity: "error",
        path,
        message: `signal "${signal.name}" collides with a property of the same name`,
      });
    }
    for (const { field, pin } of signalPinRefs(signal)) {
      if (!pinNames.has(pin)) {
        issues.push({ severity: "error", path: `${path}.${field}`, message: `"${pin}" is not a declared pin` });
      }
    }
    // Rate/expr may reference properties and any signal (including later ones —
    // the runtime evaluates against last-known values, so ordering is loose).
    if (signal.kind === "integrate") checkExpr(signal.rate, signalContext, `${path}.rate`, issues);
    if (signal.kind === "expr") checkExpr(signal.expr, signalContext, `${path}.expr`, issues);
  });

  // ── visual.bindings ──
  if (bindings.length > 0 && !dsl.svg) {
    issues.push({
      severity: "error",
      path: "visual.bindings",
      message: "visual.bindings requires an svg body (bindings target element ids inside it)",
    });
  }
  bindings.forEach((binding, i) => {
    const path = `visual.bindings[${i}]`;
    if (dsl.svg && !new RegExp(`id\\s*=\\s*["']${escapeRegExp(binding.target)}["']`).test(dsl.svg)) {
      issues.push({
        severity: "warning",
        path,
        message: `svg has no element with id="${binding.target}" — this binding will do nothing`,
      });
    }
    for (const key of ["rotate", "translateX", "translateY", "scale", "opacity"] as const) {
      const value = binding[key];
      if (value !== undefined) checkNumberOrExpr(value, signalContext, `${path}.${key}`, issues);
    }
    if (binding.rotate === undefined && binding.translateX === undefined && binding.translateY === undefined &&
        binding.scale === undefined && binding.opacity === undefined) {
      issues.push({ severity: "warning", path, message: "binding sets no animated property" });
    }
  });
  if (dsl.svg && bindings.length > 0 && !/viewBox\s*=/.test(dsl.svg)) {
    issues.push({
      severity: "warning",
      path: "svg",
      message: 'animated svg should declare a viewBox (e.g. <svg viewBox="0 0 100 100">) so bindings scale correctly',
    });
  }

  // ── sketch placeholders ──
  if (dsl.sketch) {
    const lines = [...dsl.sketch.includes, ...dsl.sketch.globals, ...dsl.sketch.setup, ...dsl.sketch.loop];
    lines.forEach((line) => {
      for (const match of line.matchAll(/\{\{pin\.([a-zA-Z0-9_]+)\}\}/g)) {
        const pin = match[1]!;
        if (!pinNames.has(pin)) {
          issues.push({
            severity: "warning",
            path: "sketch",
            message: `placeholder {{pin.${pin}}} references an undeclared pin`,
          });
        }
      }
    });
  }

  return issues;
}
