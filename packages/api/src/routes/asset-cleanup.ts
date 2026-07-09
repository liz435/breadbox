// ── Asset cleanup helpers (pure) ─────────────────────────────────────────────
//
// Imported 3D models pile up on disk: every upload writes a fresh file (no
// dedup), and a body dropped by undo / board reload / apply_design leaves its
// asset unreferenced with nothing to collect it. These pure helpers back the
// two fixes in the asset routes — content-hash dedup on upload, and a
// grace-period mark-and-sweep that reclaims model assets no assembly body
// references — kept free of I/O so they can be unit-tested.

import type { Asset } from "../db/schemas";

/** The slice of an assembly body the sweep needs to decide "still in use". */
export type AssetRef = { assetId?: string; uri?: string };

/**
 * An existing asset with the same content hash + extension, if any. The upload
 * route reuses it instead of writing a duplicate file, so re-importing the same
 * model doesn't multiply on disk.
 */
export function findDuplicateAsset(
  assets: Record<string, Asset>,
  sha256: string,
  ext: string,
): Asset | null {
  for (const asset of Object.values(assets)) {
    if (asset.meta?.sha256 === sha256 && asset.meta?.ext === ext) return asset;
  }
  return null;
}

/**
 * What a sweep should do to each MODEL asset, split into three disjoint sets:
 *
 * - `mark`   — newly unreferenced; stamp `orphanedAt` and KEEP the file.
 * - `unmark` — referenced again after having been marked; clear `orphanedAt`.
 * - `remove` — has stayed orphaned past the grace window; delete file + entry.
 *
 * The grace period is the whole point: deleting an imported model the first
 * time it looks unreferenced would destroy a file the board autosave (debounced)
 * hasn't caught up to yet — e.g. a model imported seconds before the app closed.
 * Marking first, deleting only on a later sweep past the window, makes reclaim
 * non-destructive in the short term while still collecting truly-abandoned files.
 * A body counts as a reference by either its assetId or its serve uri; only
 * model assets are considered (sprites/scripts/audio have their own lifecycles).
 */
export type SweepPlan = {
  mark: string[];
  unmark: string[];
  remove: string[];
};

export function planAssetSweep(params: {
  assets: Record<string, Asset>;
  bodies: Iterable<AssetRef>;
  /** Epoch ms "now" — injected so the plan is deterministic and testable. */
  now: number;
  /** How long an asset must stay orphaned before it's eligible for removal. */
  graceMs: number;
}): SweepPlan {
  const { assets, bodies, now, graceMs } = params;

  const refIds = new Set<string>();
  const refUris = new Set<string>();
  for (const body of bodies) {
    if (body.assetId) refIds.add(body.assetId);
    if (body.uri) refUris.add(body.uri);
  }

  const plan: SweepPlan = { mark: [], unmark: [], remove: [] };
  for (const [id, asset] of Object.entries(assets)) {
    if (asset.type !== "model") continue;

    const referenced = refIds.has(id) || refUris.has(asset.uri);
    const stamp =
      typeof asset.meta?.orphanedAt === "string"
        ? Date.parse(asset.meta.orphanedAt)
        : Number.NaN;
    const marked = !Number.isNaN(stamp);

    if (referenced) {
      if (marked) plan.unmark.push(id);
      continue;
    }
    if (!marked) {
      plan.mark.push(id);
    } else if (now - stamp >= graceMs) {
      plan.remove.push(id);
    }
    // else: still within the grace window — leave the mark untouched.
  }
  return plan;
}
