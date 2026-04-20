import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { agentPlanSchema, clampEstimatedToolCalls } from "../planner";

// ── Schema-shape tests ─────────────────────────────────────────────────
//
// Anthropic's structured-outputs API (`output_config.format.schema`) rejects
// JSON Schemas that combine `type: "integer"` with `minimum`/`maximum`:
//
//   AI_APICallError: output_config.format.schema:
//     For 'integer' type, properties maximum, minimum are not supported
//
// `generateObject` ships our zod schema through `z.toJSONSchema()` and that
// payload becomes `output_config.format.schema`. These tests pin the emitted
// shape so the schema can never silently regress to a form the provider
// rejects.

function collectKeywordsAtIntegerNodes(
  schema: unknown,
  found: Array<{ path: string; keywords: string[] }> = [],
  path = "$",
): Array<{ path: string; keywords: string[] }> {
  if (!schema || typeof schema !== "object") return found;
  const node = schema as Record<string, unknown>;
  if (node.type === "integer") {
    const offending = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]
      .filter((key) => key in node);
    if (offending.length > 0) {
      found.push({ path, keywords: offending });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object") {
      collectKeywordsAtIntegerNodes(value, found, `${path}.${key}`);
    }
  }
  return found;
}

function collectAllTypeAnnotations(schema: unknown, acc: Set<string> = new Set()): Set<string> {
  if (!schema || typeof schema !== "object") return acc;
  const node = schema as Record<string, unknown>;
  if (typeof node.type === "string") acc.add(node.type);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectAllTypeAnnotations(value, acc);
    }
  }
  return acc;
}

describe("agentPlanSchema JSON Schema shape", () => {
  const jsonSchema = z.toJSONSchema(agentPlanSchema, { target: "draft-7" });

  test("has no min/max keywords on integer-typed nodes", () => {
    // Anthropic structured-outputs rejects min/max on integer types.
    const violations = collectKeywordsAtIntegerNodes(jsonSchema);
    expect(violations).toEqual([]);
  });

  test("does not declare any field as `type: integer`", () => {
    // Zod 4's `z.toJSONSchema()` always emits ±MAX_SAFE_INTEGER bounds for
    // any `.int()` field (see planner.ts comment), so even bare `.int()`
    // re-introduces the rejected combination. Numeric counts must stay
    // `type: number` and be normalized server-side.
    const allTypes = [...collectAllTypeAnnotations(jsonSchema)];
    expect(allTypes).not.toContain("integer");
  });

  test("estimatedToolCalls is exposed as a number with a documented bound", () => {
    const props = (jsonSchema as { properties?: Record<string, unknown> }).properties;
    expect(props?.estimatedToolCalls).toMatchObject({ type: "number" });
    // The bound must live in description so the model actually receives it
    // (the schema can't enforce it without re-introducing the rejected keywords).
    const description = (props?.estimatedToolCalls as { description?: string }).description;
    expect(description).toMatch(/1-10/);
  });
});

describe("agentPlanSchema runtime parse", () => {
  test("accepts a typical plan payload", () => {
    const result = agentPlanSchema.safeParse({
      summary: "Place an LED",
      steps: [
        { action: "Place LED at (5,5)", tool: "place_component", destructive: false },
      ],
      estimatedToolCalls: 3,
      isDestructive: false,
    });
    expect(result.success).toBe(true);
  });

  // Out-of-range integers are no longer rejected at the zod level — the
  // bound is communicated in `.describe()` and clamped after parse inside
  // `generatePlan`. This guards against a regression that re-introduces
  // `.min()/.max()` on the schema (see schema-shape tests above).
  test("does not reject estimatedToolCalls outside the documented 1-10 range", () => {
    expect(
      agentPlanSchema.safeParse({
        summary: "Big build",
        steps: [],
        estimatedToolCalls: 99,
        isDestructive: false,
      }).success,
    ).toBe(true);

    expect(
      agentPlanSchema.safeParse({
        summary: "Empty",
        steps: [],
        estimatedToolCalls: 0,
        isDestructive: false,
      }).success,
    ).toBe(true);
  });
});

describe("clampEstimatedToolCalls", () => {
  test("rounds non-integers", () => {
    expect(clampEstimatedToolCalls(3.4)).toBe(3);
    expect(clampEstimatedToolCalls(3.6)).toBe(4);
  });

  test("clamps below 1 to 1 and above 10 to 10", () => {
    expect(clampEstimatedToolCalls(0)).toBe(1);
    expect(clampEstimatedToolCalls(-5)).toBe(1);
    expect(clampEstimatedToolCalls(11)).toBe(10);
    expect(clampEstimatedToolCalls(99)).toBe(10);
  });

  test("passes in-range integers through unchanged", () => {
    for (let n = 1; n <= 10; n++) {
      expect(clampEstimatedToolCalls(n)).toBe(n);
    }
  });

  test("falls back to the minimum for non-finite inputs", () => {
    expect(clampEstimatedToolCalls(NaN)).toBe(1);
    expect(clampEstimatedToolCalls(Infinity)).toBe(1);
    expect(clampEstimatedToolCalls(-Infinity)).toBe(1);
  });
});
