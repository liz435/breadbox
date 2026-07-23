// ── Breadboard model placement calibration ───────────────────────────────────
//
// The 3D breadboard is now an imported GLB (breadboard.glb). The hole grid and
// wire/part endpoints stay fixed on the schematic layout (pixelToWorld); this
// store only nudges the *model* so its surface sits under those fixed holes.
// A live, localStorage-backed transform (in-plane offset, height, yaw, scale)
// is layered on top of the runtime auto-fit. The "Calibrate breadboard" mode
// (toolbar toggle) lets the user drag the model into place and tweak the rest
// from a panel; once dialed in, the values get baked into DEFAULT_TRANSFORM.

import { useSyncExternalStore } from "react"

/** Adjustment layered on top of the auto-fit, all applied in the board frame. */
export type BreadboardTransform = {
  /** In-plane offset added to the fitted position (mm): +x right. */
  x: number
  /** In-plane offset (mm): +z toward the viewer. */
  z: number
  /** Vertical lift from resting on the floor (mm). */
  y: number
  /** Extra rotation about vertical, added to the auto-fit (radians). */
  yaw: number
  /** Multiplier on the fitted (footprint) scale; 1 = fill the footprint. */
  scale: number
}

/** Baked default placement — dialed in against breadboard.glb via the calibrator
 *  and exported with "Copy JSON". Layered on top of the runtime auto-fit. */
const DEFAULT_TRANSFORM: BreadboardTransform = {
  x: -0.171,
  z: -13.583,
  y: 1,
  yaw: 0,
  scale: 1.46,
}

// Bumped v2 → v3: a stale saved transform (missing the 1.46 fit scale / offset)
// was shadowing the baked default on desktop, shrinking the board out from under
// the hole grid. Bumping discards the stale value so the baked placement loads.
const STORAGE_KEY = "dreamer:breadboard-calibration:v3"

function load(): BreadboardTransform {
  if (typeof localStorage === "undefined") return DEFAULT_TRANSFORM
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TRANSFORM
    const parsed = JSON.parse(raw) as Partial<BreadboardTransform>
    return {
      x: typeof parsed.x === "number" ? parsed.x : DEFAULT_TRANSFORM.x,
      z: typeof parsed.z === "number" ? parsed.z : DEFAULT_TRANSFORM.z,
      y: typeof parsed.y === "number" ? parsed.y : DEFAULT_TRANSFORM.y,
      yaw: typeof parsed.yaw === "number" ? parsed.yaw : DEFAULT_TRANSFORM.yaw,
      scale: typeof parsed.scale === "number" ? parsed.scale : DEFAULT_TRANSFORM.scale,
    }
  } catch {
    return DEFAULT_TRANSFORM
  }
}

let state: BreadboardTransform = load()
const listeners = new Set<() => void>()

function commit(next: BreadboardTransform) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Non-fatal: placement just won't persist across reloads.
  }
  for (const fn of listeners) fn()
}

export function getBreadboardTransform(): BreadboardTransform {
  return state
}

export function setBreadboardTransform(patch: Partial<BreadboardTransform>): void {
  commit({ ...state, ...patch })
}

/** Restore the shipped baked placement. */
export function resetBreadboardTransform(): void {
  commit({ ...DEFAULT_TRANSFORM })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useBreadboardTransform(): BreadboardTransform {
  return useSyncExternalStore(subscribe, getBreadboardTransform, getBreadboardTransform)
}

// ── Calibration mode toggle ──────────────────────────────────────────────────

const MODE_KEY = "dreamer:breadboard-calibrate"
let calibrating =
  typeof localStorage !== "undefined" && localStorage.getItem(MODE_KEY) === "1"
const modeListeners = new Set<() => void>()

export function isBreadboardCalibrating(): boolean {
  return calibrating
}

export function setBreadboardCalibrating(on: boolean): void {
  calibrating = on
  try {
    localStorage.setItem(MODE_KEY, on ? "1" : "0")
  } catch {
    // ignore
  }
  for (const fn of modeListeners) fn()
}

function subscribeCalibrating(fn: () => void): () => void {
  modeListeners.add(fn)
  return () => modeListeners.delete(fn)
}

export function useBreadboardCalibrating(): boolean {
  return useSyncExternalStore(
    subscribeCalibrating,
    isBreadboardCalibrating,
    isBreadboardCalibrating,
  )
}
