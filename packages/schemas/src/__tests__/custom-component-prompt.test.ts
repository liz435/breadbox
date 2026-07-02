import { describe, expect, test } from "bun:test";
import { buildCustomPartPrompt, WORKED_EXAMPLE_PART, WORKED_EXAMPLE_ACTUATOR } from "../custom-component-prompt";
import { customComponentDslSchema } from "../custom-component-dsl";
import { lintCustomComponentDsl } from "../custom-component-lint";

describe("buildCustomPartPrompt", () => {
  test("the worked example is a valid DSL spec", () => {
    expect(customComponentDslSchema.safeParse(WORKED_EXAMPLE_PART).success).toBe(true);
  });

  test("the actuator worked example is a valid, lint-clean DSL spec", () => {
    const parsed = customComponentDslSchema.safeParse(WORKED_EXAMPLE_ACTUATOR);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(lintCustomComponentDsl(parsed.data)).toEqual([]);
    }
  });

  test("the format spec documents behavior signals and visual bindings", () => {
    const prompt = buildCustomPartPrompt("{}");
    expect(prompt).toContain('"behavior"?');
    expect(prompt).toContain('"visual"?');
    expect(prompt).toContain('"kind": "count"');
    expect(prompt).toContain("integrate");
    expect(prompt).toContain("stepper");
  });

  test("embeds the spec, the requested change, and the format spec", () => {
    const spec = '{ "type": "custom:foo" }';
    const prompt = buildCustomPartPrompt(spec, { change: "add a gain property" });
    expect(prompt).toContain(spec);
    expect(prompt).toContain("add a gain property");
    expect(prompt).toContain("## Format spec");
    expect(prompt).toContain("input_impedance");
    expect(prompt).toContain("reply with **only**");
  });

  test("leaves a placeholder when no change is given", () => {
    const prompt = buildCustomPartPrompt("{}");
    expect(prompt).toContain("<describe the change you want here>");
  });

  test("scopes the prompt to a single facet when given", () => {
    const prompt = buildCustomPartPrompt('{ "type": "custom:foo" }', { facet: "look" });
    expect(prompt).toContain("## Focus");
    expect(prompt).toContain("visual appearance");
    expect(prompt).toContain("`svg`");
  });

  test("no Focus section without a facet", () => {
    const prompt = buildCustomPartPrompt('{ "type": "custom:foo" }', { change: "x" });
    expect(prompt).not.toContain("## Focus");
  });
});
