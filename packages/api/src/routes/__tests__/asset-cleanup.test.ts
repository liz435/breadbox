import { describe, expect, test } from "bun:test";
import type { Asset } from "../../db/schemas";
import { findDuplicateAsset, findOrphanModelAssets } from "../asset-cleanup";

function asset(over: Partial<Asset> & { id: string }): Asset {
  return {
    projectId: "p",
    type: "model",
    uri: `/project/p/assets/${over.id}.glb`,
    meta: {},
    ...over,
  } as Asset;
}

describe("findDuplicateAsset", () => {
  const assets: Record<string, Asset> = {
    a: asset({ id: "a", meta: { sha256: "hash-a", ext: "glb" } }),
    b: asset({ id: "b", meta: { sha256: "hash-b", ext: "glb" } }),
  };

  test("matches on hash + ext", () => {
    expect(findDuplicateAsset(assets, "hash-a", "glb")?.id).toBe("a");
  });

  test("no match for a different hash", () => {
    expect(findDuplicateAsset(assets, "hash-z", "glb")).toBeNull();
  });

  test("same hash but different ext is not a duplicate", () => {
    expect(findDuplicateAsset(assets, "hash-a", "stl")).toBeNull();
  });
});

describe("findOrphanModelAssets", () => {
  test("keeps referenced models, sweeps unreferenced ones", () => {
    const assets: Record<string, Asset> = {
      used: asset({ id: "used", uri: "/project/p/assets/used.glb" }),
      orphan: asset({ id: "orphan", uri: "/project/p/assets/orphan.glb" }),
    };
    const bodies = [{ assetId: "used", uri: "/project/p/assets/used.glb" }];
    expect(findOrphanModelAssets(assets, bodies)).toEqual(["orphan"]);
  });

  test("a body referencing only by uri still keeps its asset", () => {
    const assets: Record<string, Asset> = {
      x: asset({ id: "x", uri: "/project/p/assets/x.glb" }),
    };
    expect(findOrphanModelAssets(assets, [{ uri: "/project/p/assets/x.glb" }])).toEqual([]);
  });

  test("non-model assets are never swept, even when unreferenced", () => {
    const assets: Record<string, Asset> = {
      sprite: asset({ id: "sprite", type: "sprite", uri: "/project/p/assets/sprite.png" }),
      model: asset({ id: "model" }),
    };
    expect(findOrphanModelAssets(assets, []).sort()).toEqual(["model"]);
  });

  test("no bodies → every model asset is an orphan", () => {
    const assets: Record<string, Asset> = {
      a: asset({ id: "a" }),
      b: asset({ id: "b" }),
    };
    expect(findOrphanModelAssets(assets, []).sort()).toEqual(["a", "b"]);
  });
});
