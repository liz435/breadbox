import { describe, expect, test } from "bun:test";
import type { Asset } from "../../db/schemas";
import { findDuplicateAsset, planAssetSweep } from "../asset-cleanup";

function asset(over: Partial<Asset> & { id: string }): Asset {
  return {
    projectId: "p",
    type: "model",
    uri: `/project/p/assets/${over.id}.glb`,
    meta: {},
    ...over,
  } as Asset;
}

const DAY = 24 * 60 * 60 * 1000;
const GRACE = 7 * DAY;
const NOW = 1_000 * DAY; // arbitrary fixed "now" (Date.now is not injected)

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

describe("planAssetSweep", () => {
  function plan(assets: Record<string, Asset>, bodies: { assetId?: string; uri?: string }[]) {
    return planAssetSweep({ assets, bodies, now: NOW, graceMs: GRACE });
  }

  test("a newly unreferenced model is marked, never removed on first sight", () => {
    const assets = { orphan: asset({ id: "orphan" }) };
    expect(plan(assets, [])).toEqual({ mark: ["orphan"], unmark: [], remove: [] });
  });

  test("referenced models are left alone", () => {
    const assets = {
      byId: asset({ id: "byId" }),
      byUri: asset({ id: "byUri", uri: "/project/p/assets/byUri.glb" }),
    };
    const bodies = [{ assetId: "byId" }, { uri: "/project/p/assets/byUri.glb" }];
    expect(plan(assets, bodies)).toEqual({ mark: [], unmark: [], remove: [] });
  });

  test("an orphan still within the grace window is kept (not removed)", () => {
    const assets = {
      x: asset({ id: "x", meta: { orphanedAt: new Date(NOW - 3 * DAY).toISOString() } }),
    };
    expect(plan(assets, [])).toEqual({ mark: [], unmark: [], remove: [] });
  });

  test("an orphan past the grace window is removed", () => {
    const assets = {
      x: asset({ id: "x", meta: { orphanedAt: new Date(NOW - 8 * DAY).toISOString() } }),
    };
    expect(plan(assets, [])).toEqual({ mark: [], unmark: [], remove: ["x"] });
  });

  test("a re-referenced marked asset is unmarked, not removed", () => {
    const assets = {
      x: asset({ id: "x", meta: { orphanedAt: new Date(NOW - 8 * DAY).toISOString() } }),
    };
    expect(plan(assets, [{ assetId: "x" }])).toEqual({ mark: [], unmark: ["x"], remove: [] });
  });

  test("non-model assets are never touched, even when unreferenced", () => {
    const assets = {
      sprite: asset({ id: "sprite", type: "sprite", uri: "/project/p/assets/sprite.png" }),
      model: asset({ id: "model" }),
    };
    expect(plan(assets, [])).toEqual({ mark: ["model"], unmark: [], remove: [] });
  });

  test("no bodies → every model asset is marked (first pass), none removed yet", () => {
    const assets = { a: asset({ id: "a" }), b: asset({ id: "b" }) };
    const result = plan(assets, []);
    expect(result.mark.sort()).toEqual(["a", "b"]);
    expect(result.remove).toEqual([]);
  });
});
