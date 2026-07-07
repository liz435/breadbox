import { describe, expect, test } from "bun:test";
import {
  assemblyBodySchema,
  assemblyDocSchema,
  boardStateSchema,
  createDefaultBoardState,
  createEmptyAssembly,
} from "../index";

describe("assemblyDocSchema", () => {
  test("empty doc parses with defaults", () => {
    const doc = assemblyDocSchema.parse({});
    expect(doc.bodies).toEqual({});
    expect(doc.bindings).toEqual([]);
  });

  test("body defaults: world parent, identity transform, y-up, unit scale", () => {
    const body = assemblyBodySchema.parse({
      id: "body_1",
      name: "bracket",
      assetId: "asset-1",
      uri: "/project/p1/assets/asset-1.stl",
      format: "stl",
    });
    expect(body.parent).toEqual({ kind: "world" });
    expect(body.transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });
    expect(body.importScale).toBe(1);
    expect(body.upAxis).toBe("y");
    expect(body.joint).toBeUndefined();
  });

  test("component parent defaults to the part body node", () => {
    const body = assemblyBodySchema.parse({
      id: "body_arm",
      name: "arm",
      assetId: "asset-2",
      uri: "/project/p1/assets/asset-2.glb",
      format: "glb",
      parent: { kind: "component", componentId: "servo-1" },
    });
    expect(body.parent).toEqual({
      kind: "component",
      componentId: "servo-1",
      node: "body",
    });
  });

  test("rejects a non-positive import scale", () => {
    expect(() =>
      assemblyBodySchema.parse({
        id: "b",
        name: "b",
        assetId: "a",
        uri: "/u",
        format: "stl",
        importScale: 0,
      }),
    ).toThrow();
  });
});

describe("boardState assembly field", () => {
  test("legacy saves without assembly still parse", () => {
    const legacy = createDefaultBoardState();
    delete (legacy as { assembly?: unknown }).assembly;
    const parsed = boardStateSchema.parse(JSON.parse(JSON.stringify(legacy)));
    expect(parsed.assembly).toBeUndefined();
  });

  test("assembly round-trips through boardStateSchema", () => {
    const state = createDefaultBoardState();
    state.assembly = {
      ...createEmptyAssembly(),
      bodies: {
        body_1: assemblyBodySchema.parse({
          id: "body_1",
          name: "arm",
          assetId: "asset-1",
          uri: "/project/p1/assets/asset-1.glb",
          format: "glb",
          parent: { kind: "component", componentId: "servo-1", node: "angle" },
          joint: { pivot: [0, 5, 0], axis: [0, 1, 0] },
        }),
      },
      bindings: [
        {
          id: "bind_1",
          componentId: "servo-1",
          signal: "angle",
          bodyId: "body_1",
          channel: "rotate",
          map: { scale: 1, offset: 0 },
        },
      ],
    };
    const parsed = boardStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(parsed.assembly).toEqual(state.assembly);
  });
});
