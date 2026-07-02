import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  deleteCustomPart,
  getCustomPart,
  listCustomParts,
  saveCustomPart,
  validateCustomPart,
} from "../handlers";

const VALID_SPEC = {
  type: "custom:my-sensor",
  label: "My Sensor",
  category: "input",
  pins: [{ name: "sig", dx: 0, dy: 0, role: "analog" }],
  properties: { value: 50 },
  electrical: {
    elements: [{ kind: "source", plus: "sig", minus: "0", volts: "value / 100 * 5" }],
  },
};

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "bb-mcp-cp-"));
  process.env.DATA_DIR = dir;
});

afterAll(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  for (const part of (await listCustomParts()).parts) await deleteCustomPart({ id: part.id });
});

describe("custom parts MCP handlers", () => {
  test("validate_custom_part accepts a good spec and reports the id", () => {
    expect(validateCustomPart({ spec: VALID_SPEC })).toEqual({ valid: true, id: "my-sensor" });
  });

  test("validate_custom_part reports issues for a bad spec", () => {
    const res = validateCustomPart({ spec: { type: "nope" } });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.issues.length).toBeGreaterThan(0);
  });

  test("save → list → get round-trips a DSL part", async () => {
    expect(await saveCustomPart({ spec: VALID_SPEC })).toEqual({ ok: true, id: "my-sensor" });
    expect((await listCustomParts()).parts).toContainEqual({ id: "my-sensor", format: "dsl" });

    const part = await getCustomPart({ id: "my-sensor" });
    expect("error" in part).toBe(false);
    if (!("error" in part)) {
      expect(part.format).toBe("dsl");
      expect(part.source).toContain("custom:my-sensor");
    }
  });

  test("save rejects an invalid spec without writing", async () => {
    const res = await saveCustomPart({ spec: { type: "custom:x" } }); // missing label/pins
    expect(res.ok).toBe(false);
    expect((await listCustomParts()).parts).toHaveLength(0);
  });

  test("validate/save fail on semantic lint errors (unknown pin, bad expression)", async () => {
    const spec = {
      ...VALID_SPEC,
      type: "custom:lint-bad",
      behavior: { signals: [{ kind: "count", name: "steps", pin: "nope" }] },
    };
    const validation = validateCustomPart({ spec });
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.issues.some((i) => i.message.includes('"nope"'))).toBe(true);
    }
    const saved = await saveCustomPart({ spec });
    expect(saved.ok).toBe(false);
    expect((await listCustomParts()).parts).toHaveLength(0);
  });

  test("lint warnings pass validation and ride along on save", async () => {
    const spec = {
      ...VALID_SPEC,
      type: "custom:lint-warn",
      svg: "<svg viewBox='0 0 10 10'><g id='body'/></svg>",
      behavior: { signals: [{ kind: "digital", name: "on", pin: "sig" }] },
      visual: { bindings: [{ target: "rotor", opacity: "on" }] }, // no #rotor in svg
    };
    const validation = validateCustomPart({ spec });
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.warnings?.some((w) => w.message.includes('id="rotor"'))).toBe(true);
    }
    const saved = await saveCustomPart({ spec });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect("warnings" in saved).toBe(true);
  });

  test("delete removes the part", async () => {
    await saveCustomPart({ spec: VALID_SPEC });
    expect(await deleteCustomPart({ id: "my-sensor" })).toEqual({ ok: true });
    expect(await getCustomPart({ id: "my-sensor" })).toEqual({
      error: 'Custom part "my-sensor" not found.',
    });
  });
});
