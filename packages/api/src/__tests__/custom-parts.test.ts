import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  deleteCustomPart,
  getCustomPart,
  getCustomPartModule,
  isValidPartId,
  listCustomParts,
  saveCustomPart,
} from "../custom-parts";

// A code part with a TS type annotation, so transpilation has something to strip.
const CODE_SAMPLE = `const GAIN: number = 5
export default (host) =>
  host.defineComponent({
    type: "custom:test-part",
    label: "Test Part",
    pins: [{ name: "sig", dx: 0, dy: 0 }],
  })
`;

const DSL_SAMPLE = JSON.stringify({
  type: "custom:dsl-part",
  label: "DSL Part",
  pins: [{ name: "sig", dx: 0, dy: 0, role: "analog" }],
  electrical: { elements: [{ kind: "source", plus: "sig", minus: "0", volts: "5" }] },
});

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "bb-custom-parts-"));
  process.env.DATA_DIR = dir;
});

afterAll(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("custom parts storage", () => {
  beforeEach(async () => {
    for (const p of await listCustomParts()) await deleteCustomPart(p.id);
  });

  test("saves and lists a code part with its format", async () => {
    await saveCustomPart("test-part", "code", CODE_SAMPLE);
    expect(await listCustomParts()).toContainEqual({ id: "test-part", format: "code" });
    const part = await getCustomPart("test-part");
    expect(part?.format).toBe("code");
    expect(part?.source).toContain("custom:test-part");
  });

  test("saves and lists a DSL part with its format", async () => {
    await saveCustomPart("dsl-part", "dsl", DSL_SAMPLE);
    expect(await listCustomParts()).toContainEqual({ id: "dsl-part", format: "dsl" });
    const part = await getCustomPart("dsl-part");
    expect(part?.format).toBe("dsl");
  });

  test("module endpoint serves transpiled JS for code, null for DSL", async () => {
    await saveCustomPart("test-part", "code", CODE_SAMPLE);
    const js = await getCustomPartModule("test-part");
    expect(js).toContain("export default");
    expect(js).not.toContain(": number"); // type stripped

    await saveCustomPart("dsl-part", "dsl", DSL_SAMPLE);
    expect(await getCustomPartModule("dsl-part")).toBeNull();
  });

  test("rejects an invalid id", () => {
    expect(isValidPartId("Bad Id")).toBe(false);
    expect(saveCustomPart("Bad Id", "code", CODE_SAMPLE)).rejects.toThrow();
  });

  test("rejects code that fails to transpile", async () => {
    expect(saveCustomPart("broken", "code", "export default (((")).rejects.toThrow();
    expect(await getCustomPart("broken")).toBeNull();
  });

  test("rejects DSL that is invalid JSON or fails the schema", async () => {
    expect(saveCustomPart("bad-json", "dsl", "{ not json ")).rejects.toThrow();
    expect(saveCustomPart("bad-schema", "dsl", JSON.stringify({ type: "nope" }))).rejects.toThrow();
    expect(await getCustomPart("bad-json")).toBeNull();
  });

  test("re-saving as a different format replaces the file", async () => {
    await saveCustomPart("morph", "code", CODE_SAMPLE.replace("test-part", "morph"));
    expect((await getCustomPart("morph"))?.format).toBe("code");
    await saveCustomPart("morph", "dsl", DSL_SAMPLE.replace("dsl-part", "morph"));
    expect((await getCustomPart("morph"))?.format).toBe("dsl");
    // exactly one entry, not two
    expect((await listCustomParts()).filter((p) => p.id === "morph")).toHaveLength(1);
  });

  test("delete removes the part", async () => {
    await saveCustomPart("test-part", "code", CODE_SAMPLE);
    expect(await deleteCustomPart("test-part")).toBe(true);
    expect(await getCustomPart("test-part")).toBeNull();
  });
});
