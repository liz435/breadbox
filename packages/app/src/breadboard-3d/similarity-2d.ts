// ── 2D similarity least-squares fit (closed form) ────────────────────────────
//
// Fits a uniform scale + rotation + translation that best maps `src` points
// onto `dst` points in the board plane (x, z). This is the core of the component
// pin calibration: src = a model's captured pin positions (per type), dst = the
// actual footprint holes of a placed instance. Two points → exact; more points →
// the least-squares similarity (Umeyama, specialised to 2D + uniform scale).

export type P2 = { x: number; z: number }

export type Similarity2D = {
  /** Uniform scale factor. */
  scale: number
  /** Board-plane rotation from src to dst, radians (standard x→z sense). */
  rotation: number
  /** Translation applied after scale + rotation (board plane). */
  tx: number
  tz: number
}

const IDENTITY: Similarity2D = { scale: 1, rotation: 0, tx: 0, tz: 0 }

/** Least-squares uniform-scale + rotation + translation mapping src → dst. */
export function fitSimilarity2D(src: readonly P2[], dst: readonly P2[]): Similarity2D {
  const n = Math.min(src.length, dst.length)
  if (n === 0) return { ...IDENTITY }

  let sax = 0
  let saz = 0
  let sbx = 0
  let sbz = 0
  for (let i = 0; i < n; i++) {
    sax += src[i].x
    saz += src[i].z
    sbx += dst[i].x
    sbz += dst[i].z
  }
  const ax = sax / n
  const az = saz / n
  const bx = sbx / n
  const bz = sbz / n

  // One point pins down only translation.
  if (n === 1) return { scale: 1, rotation: 0, tx: bx - ax, tz: bz - az }

  // Cross-covariance of centred points.
  let sxx = 0
  let szz = 0
  let sxz = 0
  let szx = 0
  let varA = 0
  for (let i = 0; i < n; i++) {
    const cax = src[i].x - ax
    const caz = src[i].z - az
    const cbx = dst[i].x - bx
    const cbz = dst[i].z - bz
    sxx += cax * cbx
    szz += caz * cbz
    sxz += cax * cbz
    szx += caz * cbx
    varA += cax * cax + caz * caz
  }

  const a = sxx + szz
  const b = sxz - szx
  const rotation = Math.atan2(b, a)
  const scale = varA > 1e-9 ? Math.hypot(a, b) / varA : 1

  // Translate so the scaled+rotated src centroid lands on the dst centroid.
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const rax = scale * (cos * ax - sin * az)
  const raz = scale * (sin * ax + cos * az)
  return { scale, rotation, tx: bx - rax, tz: bz - raz }
}

/** Apply a fitted similarity to a board-plane point. */
export function applySimilarity2D(t: Similarity2D, p: P2): P2 {
  const cos = Math.cos(t.rotation)
  const sin = Math.sin(t.rotation)
  return {
    x: t.scale * (cos * p.x - sin * p.z) + t.tx,
    z: t.scale * (sin * p.x + cos * p.z) + t.tz,
  }
}
