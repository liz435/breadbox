import { describe, expect, test } from "bun:test";
import { customComponentDslSchema } from "../custom-component-dsl";
import { lintCustomComponentDsl } from "../custom-component-lint";
import type { CustomComponentDsl } from "../custom-component-dsl";

function parse(spec: unknown): CustomComponentDsl {
  const result = customComponentDslSchema.safeParse(spec);
  if (!result.success) throw new Error(`fixture is structurally invalid: ${result.error.message}`);
  return result.data;
}

const BASE = {
  type: "custom:test-part",
  label: "Test Part",
  pins: [
    { name: "step", dx: 0, dy: 0 },
    { name: "dir", dx: 0, dy: 1 },
  ],
  properties: { speed: 10 },
};

describe("lintCustomComponentDsl", () => {
  test("clean spec produces no issues", () => {
    const dsl = parse({
      ...BASE,
      svg: '<svg viewBox="0 0 10 10"><g id="rotor"/></svg>',
      electrical: { elements: [{ kind: "input_impedance", pin: "step" }] },
      behavior: {
        signals: [
          { kind: "count", name: "steps", pin: "step", direction: "dir" },
          { kind: "expr", name: "angle", expr: "steps * speed" },
        ],
      },
      visual: { bindings: [{ target: "rotor", rotate: "angle" }] },
      sketch: { loop: ["digitalWrite({{pin.step}}, HIGH);"] },
    });
    expect(lintCustomComponentDsl(dsl)).toEqual([]);
  });

  test("flags unknown pin refs in electrical elements", () => {
    const dsl = parse({
      ...BASE,
      electrical: { elements: [{ kind: "resistor", a: "nope", b: "0", ohms: 100 }] },
    });
    const issues = lintCustomComponentDsl(dsl);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain('"nope"');
  });

  test("flags unknown pins and bad expressions in signals", () => {
    const dsl = parse({
      ...BASE,
      behavior: {
        signals: [
          { kind: "digital", name: "level", pin: "missing" },
          { kind: "expr", name: "broken", expr: "level + unknown_var" },
          { kind: "integrate", name: "spin", rate: "eval(1)" },
        ],
      },
    });
    const issues = lintCustomComponentDsl(dsl);
    const messages = issues.map((i) => i.message).join("\n");
    expect(issues.every((i) => i.severity === "error")).toBe(true);
    expect(messages).toContain('"missing"');
    expect(messages).toContain("unknown_var");
    expect(messages).toContain("eval");
  });

  test("flags signal/property name collisions and duplicate signals", () => {
    const dsl = parse({
      ...BASE,
      behavior: {
        signals: [
          { kind: "digital", name: "speed", pin: "step" },
          { kind: "digital", name: "a", pin: "step" },
          { kind: "digital", name: "a", pin: "dir" },
        ],
      },
    });
    const messages = lintCustomComponentDsl(dsl).map((i) => i.message).join("\n");
    expect(messages).toContain("collides with a property");
    expect(messages).toContain("duplicate signal");
  });

  test("bindings require an svg, and warn on a missing target id", () => {
    const noSvg = parse({ ...BASE, visual: { bindings: [{ target: "rotor", rotate: 90 }] } });
    expect(lintCustomComponentDsl(noSvg).some((i) => i.severity === "error")).toBe(true);

    const wrongId = parse({
      ...BASE,
      svg: '<svg viewBox="0 0 10 10"><g id="body"/></svg>',
      visual: { bindings: [{ target: "rotor", rotate: 90 }] },
    });
    const issues = lintCustomComponentDsl(wrongId);
    expect(issues.some((i) => i.severity === "warning" && i.message.includes('id="rotor"'))).toBe(true);
  });

  test("warns when an animated svg has no viewBox", () => {
    const dsl = parse({
      ...BASE,
      svg: '<svg><g id="rotor"/></svg>',
      visual: { bindings: [{ target: "rotor", rotate: 90 }] },
    });
    expect(lintCustomComponentDsl(dsl).some((i) => i.message.includes("viewBox"))).toBe(true);
  });

  test("warns on sketch placeholders for undeclared pins", () => {
    const dsl = parse({ ...BASE, sketch: { loop: ["analogRead({{pin.sig}});"] } });
    const issues = lintCustomComponentDsl(dsl);
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("{{pin.sig}}"))).toBe(true);
  });
});
