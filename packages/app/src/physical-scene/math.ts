/** Documents use millimetres; Rapier uses metres. Quaternions are XYZW. */
export type Vec3 = { x: number; y: number; z: number }
export type Quat = Vec3 & { w: number }
export const identity: Quat = { x: 0, y: 0, z: 0, w: 1 }
export const zero: Vec3 = { x: 0, y: 0, z: 0 }
export const scale = (v: Vec3, n: number): Vec3 => ({ x: v.x * n, y: v.y * n, z: v.z * n })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => add(a, scale(b, -1))
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
export const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z)
  if (!Number.isFinite(length) || length === 0) throw new Error('Expected a finite, nonzero direction')
  return scale(v, 1 / length)
}
export const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })
export const multiply = (a: Quat, b: Quat): Quat => ({
  ...add(add(scale(b, a.w), scale(a, b.w)), cross(a, b)),
  w: a.w * b.w - dot(a, b),
})
export const rotate = (q: Quat, v: Vec3): Vec3 => {
  const uv = scale(cross(q, v), 2)
  return add(v, add(scale(uv, q.w), cross(q, uv)))
}
export const mmToM = (v: Vec3): Vec3 => scale(v, 0.001)
export const mToMm = (v: Vec3): Vec3 => scale(v, 1000)
export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))
export const wrapAngle = (v: number): number => Math.atan2(Math.sin(v), Math.cos(v))
export const twistAngle = (q: Quat, axis: Vec3): number => wrapAngle(2 * Math.atan2(dot(q, axis), q.w))
export const pointInWorld = (position: Vec3, rotation: Quat, local: Vec3): Vec3 => add(position, rotate(rotation, local))
export const fromTuple = (v: readonly [number, number, number]): Vec3 => ({ x: v[0], y: v[1], z: v[2] })
/** Intrinsic XYZ Euler angles, matching Three.js's default Euler order. */
export function fromEuler(v: readonly [number, number, number]): Quat {
  const [x, y, z] = v.map((angle) => angle / 2)
  const cx = Math.cos(x), cy = Math.cos(y), cz = Math.cos(z)
  const sx = Math.sin(x), sy = Math.sin(y), sz = Math.sin(z)
  return { x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz, w: cx * cy * cz - sx * sy * sz }
}
