// ── Part volume (oriented bounding boxes for wire routing) ───────────────────
//
// A GLB part's true body is a box, not a disc — and for panel modules (LCD,
// OLED) that box is large and offset from the pin header, so the disc obstacle
// in part-obstacles.ts can't describe it. This module derives an oriented
// bounding box (OBB) for a placed GLB part using the SAME transform the renderer
// applies (glb-parts.tsx): the model's normalized bounds carried through the
// pin-calibration fit and the PartMesh placement. Wires then arc over the real
// body instead of the pin disc.
//
// Body extents come from the loaded GLB (recorded here as each instance renders,
// keyed by component type) so the volume tracks whatever the calibration does.

import { Matrix4, Vector3 } from "three"
import { useSyncExternalStore } from "react"
import type { BoardComponent } from "@dreamer/schemas"
import { BOARD_SURFACE_Y, type WorldPoint } from "./layout"
import { computePinFit, footprintCenter, rotationYaw } from "./part-frame"
import type { P2 } from "./similarity-2d"

// ── Normalized-bounds store (populated by the GLB renderer) ───────────────────

/** A GLB's axis-aligned extents in its normalized frame (upright, height-scaled,
 *  XZ-centred at origin, base at y≈0): half-widths in X/Z and the full height. */
export type NormBounds = { halfX: number; halfZ: number; height: number }

const boundsCache = new Map<string, NormBounds>()
const listeners = new Set<() => void>()
let version = 0

/** Record a type's normalized GLB bounds. Idempotent — only bumps the version
 *  (and re-routes wires) when the numbers actually change. */
export function recordNormBounds(type: string, b: NormBounds): void {
  const prev = boundsCache.get(type)
  if (
    prev &&
    Math.abs(prev.halfX - b.halfX) < 1e-6 &&
    Math.abs(prev.halfZ - b.halfZ) < 1e-6 &&
    Math.abs(prev.height - b.height) < 1e-6
  ) {
    return
  }
  boundsCache.set(type, { ...b })
  version++
  for (const fn of listeners) fn()
}

export function getNormBounds(type: string): NormBounds | undefined {
  return boundsCache.get(type)
}

function subscribeBounds(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getBoundsVersion(): number {
  return version
}

/** Subscribe wire routing to bounds arriving/changing so obstacles rebuild as
 *  GLBs load in (before that, parts fall back to their pin disc). */
export function useBoundsVersion(): number {
  return useSyncExternalStore(subscribeBounds, getBoundsVersion, getBoundsVersion)
}

// ── Oriented bounding box (board plane) ──────────────────────────────────────

/** An oriented rectangle in the board plane plus a top height. `(cx,cz)` is the
 *  box centre; `(ux,uz)`/`(vx,vz)` are its two half-axis vectors (world mm), so a
 *  corner is centre ± u ± v. `topY` is the world-Y of the box's top face. */
export type Obb2 = {
  cx: number
  cz: number
  ux: number
  uz: number
  vx: number
  vz: number
  topY: number
}

/** Build a placed GLB part's world OBB by carrying its normalized bounds through
 *  the exact render transform: PartMesh(footprintCentroid, yaw) · Fit(cal) ·
 *  normalized. Uses three's Matrix4 so it matches glb-parts.tsx byte-for-byte. */
export function buildPartObb(
  component: BoardComponent,
  bounds: NormBounds,
  cal: { pins: P2[]; gaps?: number[] } | undefined,
  boardOffset?: WorldPoint,
): Obb2 {
  const center = footprintCenter(component)
  const yaw = rotationYaw(component.rotation)

  // PartMesh group: T(x, BOARD_SURFACE_Y, z) · R_y(yaw).
  const m = new Matrix4()
    .makeTranslation(
      center.x + (boardOffset?.x ?? 0),
      BOARD_SURFACE_Y,
      center.z + (boardOffset?.z ?? 0),
    )
    .multiply(new Matrix4().makeRotationY(yaw))

  // Calibration fit (in PartMesh-local frame): T(tx,0,tz) · R_y(-rot) · S(scale).
  const fit = computePinFit(component, cal)
  if (fit) {
    m.multiply(new Matrix4().makeTranslation(fit.tx, 0, fit.tz))
      .multiply(new Matrix4().makeRotationY(-fit.rotation))
      .multiply(new Matrix4().makeScale(fit.scale, fit.scale, fit.scale))
  }

  // Transform the normalized box's origin + half-axis tips through m; the deltas
  // are the world half-axis vectors (they absorb the fit scale + all rotations).
  const o = new Vector3(0, 0, 0).applyMatrix4(m)
  const u = new Vector3(bounds.halfX, 0, 0).applyMatrix4(m)
  const v = new Vector3(0, 0, bounds.halfZ).applyMatrix4(m)
  const top = new Vector3(0, bounds.height, 0).applyMatrix4(m)

  return {
    cx: o.x,
    cz: o.z,
    ux: u.x - o.x,
    uz: u.z - o.z,
    vx: v.x - o.x,
    vz: v.z - o.z,
    topY: top.y,
  }
}

/** Parametric interval [t0,t1] ⊆ [0,1] over which segment A→B (board plane) lies
 *  inside `obb` expanded by `margin` on every side, or null if it never does.
 *  Liang–Barsky clip in the box's local frame. */
export function obbSegmentInterval(
  obb: Obb2,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  margin: number,
): { t0: number; t1: number } | null {
  const hu = Math.hypot(obb.ux, obb.uz)
  const hv = Math.hypot(obb.vx, obb.vz)
  if (hu < 1e-6 || hv < 1e-6) return null
  const ux = obb.ux / hu
  const uz = obb.uz / hu
  const vx = obb.vx / hv
  const vz = obb.vz / hv

  // Endpoints in local (u,v) coords relative to the box centre.
  const au = (ax - obb.cx) * ux + (az - obb.cz) * uz
  const av = (ax - obb.cx) * vx + (az - obb.cz) * vz
  const bu = (bx - obb.cx) * ux + (bz - obb.cz) * uz
  const bv = (bx - obb.cx) * vx + (bz - obb.cz) * vz
  const du = bu - au
  const dv = bv - av
  const eu = hu + margin
  const ev = hv + margin

  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0 // parallel to this edge: inside iff q≥0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  // P(t) inside [-e, e] on each axis: -e ≤ coord ≤ e.
  if (!clip(-du, au + eu)) return null // u ≥ -eu
  if (!clip(du, eu - au)) return null // u ≤  eu
  if (!clip(-dv, av + ev)) return null // v ≥ -ev
  if (!clip(dv, ev - av)) return null // v ≤  ev
  if (t0 > t1) return null
  return { t0, t1 }
}
