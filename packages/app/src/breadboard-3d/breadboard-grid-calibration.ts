// ── Breadboard hole-grid calibration (warp holes/wires onto the model) ───────
//
// The 3D breadboard is an imported GLB; its molded holes don't line up with the
// app's regular grid, and a single move/scale/rotate can't correct a grid
// that's non-uniformly off. This store warps the grid itself, in 3D only, from
// a small set of anchors the user drags onto real holes:
//
//   • Terminal banks (cols 0-4 and 5-9): 4 corner anchors each → bilinear
//     interpolation fills every hole in the bank.
//   • Power rails (cols -2,-1,10,11): 1 anchor each. The anchor only sets the
//     rail column's WIDTH (how far across the board it sits); the rail's length
//     rides the neighbouring bank's warp, so its row spacing stays consistent
//     with the terminals. (Which rows carry a rail hole is `isRailRow`.)
//
// `warpedGridXZ(row,col)` is what the 3D hole render and wire endpoints call.
// The default is a baked calibration measured on the model (see
// BAKED_CALIBRATION), so the warp is active out of the box; drag the anchors to
// refine it further.

import { useSyncExternalStore } from "react"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { ROWS } from "@/breadboard/breadboard-constants"
import { pixelToWorld } from "./layout"

export type XZ = { x: number; z: number }

/** A terminal bank's four corners: (row0,colStart) (row0,colEnd) (rowMax,colStart) (rowMax,colEnd). */
export type BankCorners = { c00: XZ; c10: XZ; c01: XZ; c11: XZ }

export type GridCalibration = {
  /** Shared height of the board surface where holes/wires sit (world mm). */
  height: number
  banks: { L: BankCorners; R: BankCorners }
  /** One width anchor per rail col (-2,-1,10,11); only its lateral offset matters. */
  rails: Record<number, XZ>
}

export const RAIL_COLS = [-2, -1, 10, 11] as const
const ROW_MAX = ROWS - 1

function worldOf(row: number, col: number): XZ {
  const px = gridToPixel({ row, col })
  const w = pixelToWorld(px.x, px.y)
  return { x: w.x, z: w.z }
}

/**
 * Baked calibration measured on the imported breadboard model, then squared up
 * so the warped grid is axis-aligned: every row shares one top/bottom z and
 * every column shares one x (the raw drag was skewed by ~0.3mm). This is the
 * grid the calibrator opens from; drag the anchors to refine, "Reset" returns
 * here. Bump STORAGE_KEY when these change so stale saved edits don't shadow it.
 */
const BAKED_CALIBRATION: GridCalibration = {
  height: 9,
  banks: {
    L: {
      c00: { x: -13.554479718728802, z: -73.3598624553862 },
      c10: { x: -4.184160060530952, z: -73.3598624553862 },
      c01: { x: -13.554479718728802, z: 73.47133484660077 },
      c11: { x: -4.184160060530952, z: 73.47133484660077 },
    },
    R: {
      c00: { x: 2.667922635701583, z: -73.3598624553862 },
      c10: { x: 12.376230161314459, z: -73.3598624553862 },
      c01: { x: 2.667922635701583, z: 73.47133484660077 },
      c11: { x: 12.376230161314459, z: 73.47133484660077 },
    },
  },
  rails: {
    [-2]: { x: -22.618492272982685, z: -73.3598624553862 },
    [-1]: { x: -20.15363647564775, z: -73.3598624553862 },
    [10]: { x: 18.99393002280706, z: -73.3598624553862 },
    [11]: { x: 21.10847280592963, z: -73.3598624553862 },
  },
}

/** Starting calibration the store loads and "Reset" returns to: a fresh deep
 *  copy of the baked grid so callers can't mutate the constant. */
function defaultCalibration(): GridCalibration {
  const cloneBank = (bank: BankCorners): BankCorners => ({
    c00: { ...bank.c00 },
    c10: { ...bank.c10 },
    c01: { ...bank.c01 },
    c11: { ...bank.c11 },
  })
  const rails: Record<number, XZ> = {}
  for (const col of RAIL_COLS) {
    const r = BAKED_CALIBRATION.rails[col] ?? worldOf(0, col)
    rails[col] = { x: r.x, z: r.z }
  }
  return {
    height: BAKED_CALIBRATION.height,
    banks: { L: cloneBank(BAKED_CALIBRATION.banks.L), R: cloneBank(BAKED_CALIBRATION.banks.R) },
    rails,
  }
}

const STORAGE_KEY = "dreamer:breadboard-grid-calibration:v2"

function load(): GridCalibration {
  const base = defaultCalibration()
  if (typeof localStorage === "undefined") return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as {
      height?: number
      banks?: GridCalibration["banks"]
      rails?: Record<string, { x?: number; z?: number }>
    }
    // Keep persisted rails only if they're the current flat {x,z} width anchors;
    // older nested {a,b}/{a,b,c,d} data resets to the default, not misread.
    const railsOk =
      parsed.rails != null &&
      RAIL_COLS.every((col) => {
        const r = parsed.rails?.[String(col)]
        return r != null && typeof r.x === "number" && typeof r.z === "number"
      })
    return {
      height: typeof parsed.height === "number" ? parsed.height : base.height,
      banks: parsed.banks ?? base.banks,
      rails: railsOk ? (parsed.rails as unknown as GridCalibration["rails"]) : base.rails,
    }
  } catch {
    return base
  }
}

let state: GridCalibration = load()
const listeners = new Set<() => void>()

function commit(next: GridCalibration) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Non-fatal: calibration just won't persist across reloads.
  }
  for (const fn of listeners) fn()
}

export function getGridCalibration(): GridCalibration {
  return state
}

export function setHeight(height: number): void {
  commit({ ...state, height })
}

export function setBankCorner(bank: "L" | "R", corner: keyof BankCorners, xz: XZ): void {
  commit({
    ...state,
    banks: { ...state.banks, [bank]: { ...state.banks[bank], [corner]: xz } },
  })
}

export function setRailAnchor(col: number, xz: XZ): void {
  commit({ ...state, rails: { ...state.rails, [col]: xz } })
}

export function resetGridCalibration(): void {
  commit(defaultCalibration())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useGridCalibration(): GridCalibration {
  return useSyncExternalStore(subscribe, getGridCalibration, getGridCalibration)
}

// ── The warp ─────────────────────────────────────────────────────────────────

function lerp(p: XZ, q: XZ, t: number): XZ {
  return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }
}

/** Lateral parameter of `p` along the bank's top edge a→b (0 at a, 1 at b). Only
 *  the component along the edge is used, so a rail anchor sets purely how far
 *  across the board — its width — the rail column sits, not its length. */
function projectU(p: XZ, a: XZ, b: XZ): number {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const denom = abx * abx + abz * abz
  if (denom === 0) return 0
  return ((p.x - a.x) * abx + (p.z - a.z) * abz) / denom
}

/** World position a hole/wire attaches to for a breadboard grid cell, warped by
 *  the live calibration. Every column rides one bank's bilinear warp: terminal
 *  columns at a fixed parameter u across the bank, rail columns at a u set by
 *  their width anchor (extrapolated past the bank edge). Rows follow the warp. */
export function warpedGridXZ(row: number, col: number): { x: number; y: number; z: number } {
  const cal = state
  const v = ROW_MAX > 0 ? row / ROW_MAX : 0
  // Left bank (cols 0-4) also carries the two left rails (-2,-1); right bank
  // (cols 5-9) carries the two right rails (10,11).
  const useRight = col >= 5
  const bank = useRight ? cal.banks.R : cal.banks.L
  let u: number
  if (col >= 0 && col <= 9) {
    const cs = useRight ? 5 : 0
    u = (col - cs) / 4 // 0..1 across the bank's 5 cols
  } else {
    const anchor = cal.rails[col] ?? worldOf(0, col)
    u = projectU(anchor, bank.c00, bank.c10)
  }
  const top = lerp(bank.c00, bank.c10, u)
  const bot = lerp(bank.c01, bank.c11, u)
  const p = lerp(top, bot, v)
  return { x: p.x, y: cal.height, z: p.z }
}
