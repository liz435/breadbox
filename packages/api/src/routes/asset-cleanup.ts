// ── Asset cleanup helpers (pure) ─────────────────────────────────────────────
//
// Imported 3D models pile up on disk: every upload writes a fresh file (no
// dedup), and a body dropped by undo / board reload / apply_design leaves its
// asset unreferenced with nothing to collect it. These pure helpers back the
// two fixes in the asset routes — content-hash dedup on upload, and an orphan
// sweep that reclaims model assets no assembly body references — kept free of
// I/O so they can be unit-tested.

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
 * IDs of MODEL assets that no assembly body references — safe to delete. Only
 * model assets are swept; other types (sprites, scripts, audio…) have their own
 * lifecycles and references we don't track here. A body counts as a reference
 * by either its assetId or its serve uri.
 */
export function findOrphanModelAssets(
  assets: Record<string, Asset>,
  bodies: Iterable<AssetRef>,
): string[] {
  const refIds = new Set<string>();
  const refUris = new Set<string>();
  for (const body of bodies) {
    if (body.assetId) refIds.add(body.assetId);
    if (body.uri) refUris.add(body.uri);
  }
  const orphans: string[] = [];
  for (const [id, asset] of Object.entries(assets)) {
    if (asset.type !== "model") continue;
    if (refIds.has(id) || refUris.has(asset.uri)) continue;
    orphans.push(id);
  }
  return orphans;
}
