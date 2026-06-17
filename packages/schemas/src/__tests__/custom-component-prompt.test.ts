import { describe, expect, test } from "bun:test";
import { buildCustomPartPrompt, WORKED_EXAMPLE_PART } from "../custom-component-prompt";
import { customComponentDslSchema } from "../custom-component-dsl";

describe("buildCustomPartPrompt", () => {
  test("the worked example is a valid DSL spec", () => {
    expect(customComponentDslSchema.safeParse(WORKED_EXAMPLE_PART).success).toBe(true);
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
});
