import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  deleteCustomPart,
  getCustomPartModule,
  getCustomPartSource,
  isValidPartId,
  listCustomParts,
  saveCustomPart,
} from "../custom-parts";

// A representative part with a TS type annotation, so transpilation has
// something to strip.
const SAMPLE = `const GAIN: number = 5
export default (host) =>
  host.defineComponent({
    type: "custom:test-part",
    label: "Test Part",
    pins: [{ name: "sig", dx: 0, dy: 0 }],
    buildNetlist: (comp, ctx, api) => ({ lines: [], nodeA: api.pin("sig"), nodeB: "0" }),
  })
`;

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

  test("saves, lists, and reads back source", async () => {
    await saveCustomPart("test-part", SAMPLE);
    expect((await listCustomParts()).map((p) => p.id)).toContain("test-part");
    expect(await getCustomPartSource("test-part")).toContain("custom:test-part");
  });

  test("serves a transpiled module with TS types stripped", async () => {
    await saveCustomPart("test-part", SAMPLE);
    const js = await getCustomPartModule("test-part");
    expect(js).toContain("export default");
    expect(js).not.toContain(": number"); // type annotation stripped
  });

  test("rejects an invalid id", async () => {
    expect(isValidPartId("Bad Id")).toBe(false);
    expect(saveCustomPart("Bad Id", SAMPLE)).rejects.toThrow();
  });

  test("rejects source that fails to transpile", async () => {
    expect(saveCustomPart("broken", "export default (((")).rejects.toThrow();
    expect(await getCustomPartSource("broken")).toBeNull(); // not persisted
  });

  test("delete removes the file", async () => {
    await saveCustomPart("test-part", SAMPLE);
    expect(await deleteCustomPart("test-part")).toBe(true);
    expect(await getCustomPartSource("test-part")).toBeNull();
    expect(await deleteCustomPart("test-part")).toBe(false);
  });

  test("missing module returns null", async () => {
    expect(await getCustomPartModule("nope")).toBeNull();
  });
});
