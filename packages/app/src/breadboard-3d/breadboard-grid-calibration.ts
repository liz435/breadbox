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
import { gridToPixel, isPositiveRailCol, isRailRow, railRows } from "@/breadboard/breadboard-grid"
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
 * Baked calibration: measured on the imported breadboard model and fine-tuned
 * anchor-by-anchor until the warped grid sits on the molded holes. Rows share a
 * top/bottom z; columns are near-vertical (the right edge tapers ~0.1mm to match
 * the model). This is the grid the calibrator opens from; drag/nudge the anchors
 * to refine, "Reset" returns here. Bump STORAGE_KEY when these change so stale
 * saved edits don't shadow it.
 */
const BAKED_CALIBRATION: GridCalibration = {
  height: 8.5,
  banks: {
    L: {
      c00: { x: -13.554479718728802, z: -73.3598624553862 },
      c10: { x: -4.184160060530952, z: -73.3598624553862 },
      c01: { x: -13.554479718728802, z: 73.47133484660077 },
      c11: { x: -4.184160060530952, z: 73.47133484660077 },
    },
    R: {
      c00: { x: 2.667922635701583, z: -73.3598624553862 },
      c10: { x: 12.07623016131446, z: -73.3598624553862 },
      c01: { x: 2.667922635701583, z: 73.47133484660077 },
      c11: { x: 11.97623016131446, z: 73.47133484660077 },
    },
  },
  rails: {
    [-2]: { x: -22.618492272982685, z: -73.3598624553862 },
    [-1]: { x: -20.15363647564775, z: -73.3598624553862 },
    [10]: { x: 18.89393002280706, z: -73.3598624553862 },
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

const STORAGE_KEY = "dreamer:breadboard-grid-calibration:v3"

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

// ── Anchor selection + fine-tune ──────────────────────────────────────────────
//
// The calibrator lets you click one anchor to select it, then nudge it by exact
// world-mm steps (panel X/Z steppers or arrow keys) — finer than dragging. This
// selection is transient UI state and is deliberately not persisted.

/** Which anchor the calibrator has selected for fine-tuning. */
export type AnchorRef =
  | { kind: "bank"; bank: "L" | "R"; corner: keyof BankCorners }
  | { kind: "rail"; col: number }

/** Stable string key for an anchor — identity + React/selection comparison. */
export function anchorKey(ref: AnchorRef): string {
  return ref.kind === "bank" ? `bank:${ref.bank}:${ref.corner}` : `rail:${ref.col}`
}

function sameAnchor(a: AnchorRef | null, b: AnchorRef | null): boolean {
  if (!a || !b) return a === b
  return anchorKey(a) === anchorKey(b)
}

let selected: AnchorRef | null = null
const selectionListeners = new Set<() => void>()

export function getSelectedAnchor(): AnchorRef | null {
  return selected
}

export function setSelectedAnchor(ref: AnchorRef | null): void {
  if (sameAnchor(selected, ref)) return
  selected = ref
  for (const fn of selectionListeners) fn()
}

function subscribeSelection(fn: () => void): () => void {
  selectionListeners.add(fn)
  return () => selectionListeners.delete(fn)
}

export function useSelectedAnchor(): AnchorRef | null {
  return useSyncExternalStore(subscribeSelection, getSelectedAnchor, getSelectedAnchor)
}

/** Human label for the selected anchor, shown in the fine-tune panel. */
export function anchorLabel(ref: AnchorRef): string {
  if (ref.kind === "rail") {
    return `${isPositiveRailCol(ref.col) ? "+" : "−"} rail · col ${ref.col}`
  }
  const cs = ref.bank === "L" ? 0 : 5
  const ce = ref.bank === "L" ? 4 : 9
  const row = ref.corner === "c00" || ref.corner === "c10" ? 0 : ROW_MAX
  const col = ref.corner === "c00" || ref.corner === "c01" ? cs : ce
  return `${ref.bank} bank · ${row},${col}`
}

/** Current world XZ of an anchor (bank corner or rail width anchor). */
export function anchorXZ(ref: AnchorRef): XZ {
  if (ref.kind === "bank") return state.banks[ref.bank][ref.corner]
  return state.rails[ref.col] ?? worldOf(0, ref.col)
}

/** Write an anchor's absolute world XZ — the drag path and fine-tune share this. */
export function setAnchor(ref: AnchorRef, xz: XZ): void {
  if (ref.kind === "bank") setBankCorner(ref.bank, ref.corner, xz)
  else setRailAnchor(ref.col, xz)
}

/** Nudge an anchor by a world-space delta (fine-tune steppers / arrow keys). */
export function nudgeAnchor(ref: AnchorRef, dx: number, dz: number): void {
  const p = anchorXZ(ref)
  setAnchor(ref, { x: p.x + dx, z: p.z + dz })
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

/** Rail hole rows, precomputed once (static block/skip pattern). */
const RAIL_HOLE_ROWS = railRows()

/** Nearest row that actually carries a rail hole. Power rails only have holes in
 *  the block/skip pattern, but the whole rail is one electrical net, so a wire
 *  may reference any row along it. Snapping to the nearest hole row lets a rail
 *  jumper plug into a real hole instead of floating in a gap — purely visual. */
function nearestRailHoleRow(row: number): number {
  if (RAIL_HOLE_ROWS.length === 0 || isRailRow(row)) return row
  let best = RAIL_HOLE_ROWS[0]
  for (const r of RAIL_HOLE_ROWS) {
    if (Math.abs(r - row) < Math.abs(best - row)) best = r
  }
  return best
}

/** World position a hole/wire attaches to for a breadboard grid cell, warped by
 *  the live calibration. Every column rides one bank's bilinear warp: terminal
 *  columns at a fixed parameter u across the bank, rail columns at a u set by
 *  their width anchor (extrapolated past the bank edge). Rows follow the warp;
 *  rail rows snap to the nearest physical hole row (see `nearestRailHoleRow`). */
export function warpedGridXZ(row: number, col: number): { x: number; y: number; z: number } {
  const cal = state
  // Left bank (cols 0-4) also carries the two left rails (-2,-1); right bank
  // (cols 5-9) carries the two right rails (10,11).
  const useRight = col >= 5
  const bank = useRight ? cal.banks.R : cal.banks.L
  const isTerminal = col >= 0 && col <= 9
  // Terminal columns have a hole on every row; rail rows snap to the block
  // pattern so a jumper lands in a real hole, not a skipped gap.
  const gridRow = isTerminal ? row : nearestRailHoleRow(row)
  const v = ROW_MAX > 0 ? gridRow / ROW_MAX : 0
  let u: number
  if (isTerminal) {
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
