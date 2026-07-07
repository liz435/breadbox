import { describe, expect, test } from "bun:test";
import {
  assemblyBindingSchema,
  assemblyBodySchema,
  assemblyDocSchema,
  assemblyJointSchema,
  boardStateSchema,
  createDefaultBoardState,
  createEmptyAssembly,
  repairAssemblyForComponents,
  scaleToVec3,
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

  test("joint defaults to a rotate hinge; slide is accepted", () => {
    const rotate = assemblyJointSchema.parse({ pivot: [0, 0, 0], axis: [0, 1, 0] });
    expect(rotate.kind).toBe("rotate");
    const slide = assemblyJointSchema.parse({ pivot: [0, 0, 0], axis: [1, 0, 0], kind: "slide" });
    expect(slide.kind).toBe("slide");
  });

  test("transform scale accepts a uniform number or a per-axis triple", () => {
    const uniform = assemblyBodySchema.parse({
      id: "b",
      name: "b",
      assetId: "a",
      uri: "/u",
      format: "stl",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 2 },
    });
    expect(scaleToVec3(uniform.transform.scale)).toEqual([2, 2, 2]);
    const perAxis = assemblyBodySchema.parse({
      id: "b2",
      name: "b2",
      assetId: "a",
      uri: "/u",
      format: "stl",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 2, 3] },
    });
    expect(scaleToVec3(perAxis.transform.scale)).toEqual([1, 2, 3]);
  });

  test("emissive binding channel is accepted", () => {
    const binding = assemblyBindingSchema.parse({
      id: "bind_glow",
      componentId: "led-1",
      signal: "brightness",
      bodyId: "body_1",
      channel: "emissive",
    });
    expect(binding.channel).toBe("emissive");
  });
});

describe("repairAssemblyForComponents", () => {
  const base = () => ({
    ...createEmptyAssembly(),
    bodies: {
      arm: assemblyBodySchema.parse({
        id: "arm",
        name: "arm",
        assetId: "a1",
        uri: "/u1",
        format: "glb",
        parent: { kind: "component", componentId: "servo-1", node: "angle" },
        transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: 1 },
      }),
      base: assemblyBodySchema.parse({
        id: "base",
        name: "base",
        assetId: "a2",
        uri: "/u2",
        format: "stl",
      }),
    },
    bindings: [
      assemblyBindingSchema.parse({
        id: "b1",
        componentId: "servo-1",
        signal: "angle",
        bodyId: "arm",
      }),
    ],
  });

  test("keeps mounts and bindings when the target component survives", () => {
    const repaired = repairAssemblyForComponents(base(), ["servo-1", "breadboard-1"]);
    expect(repaired.bodies.arm.parent).toEqual({
      kind: "component",
      componentId: "servo-1",
      node: "angle",
    });
    expect(repaired.bindings).toHaveLength(1);
  });

  test("drops a vanished component's mount to world (preserving transform) and its bindings", () => {
    const repaired = repairAssemblyForComponents(base(), ["led-1"]);
    expect(repaired.bodies.arm.parent).toEqual({ kind: "world" });
    // World fallback keeps the stored local transform.
    expect(repaired.bodies.arm.transform.position).toEqual([1, 2, 3]);
    // World-parented body is untouched.
    expect(repaired.bodies.base.parent).toEqual({ kind: "world" });
    expect(repaired.bindings).toHaveLength(0);
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
