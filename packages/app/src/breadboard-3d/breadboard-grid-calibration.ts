// ── Breadboard hole-grid calibration (warp holes/wires onto the model) ───────
//
// The 3D breadboard is an imported GLB; its molded holes don't line up with the
// app's regular grid, and a single move/scale/rotate can't correct a grid
// that's non-uniformly off. This store warps the grid itself, in 3D only, from
// a handful of anchors the user drags onto real holes:
//
//   • Terminal banks (cols 0-4 and 5-9): 4 corner anchors each → bilinear
//     interpolation fills every hole in the bank.
//   • Power rails (cols -2,-1,10,11): 2 end anchors each (top row 0, bottom row
//     ROW_MAX) → the rail holes interpolate linearly between them, keeping the
//     block/gap pattern from `isRailRow`. (Per-block gap tuning comes later.)
//
// `warpedGridXZ(row,col)` is what the 3D hole render and wire endpoints call.
// Uncalibrated defaults reproduce the schematic positions exactly, so turning
// this on changes nothing until an anchor is moved.

import { useSyncExternalStore } from "react"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { ROWS } from "@/breadboard/breadboard-constants"
import { pixelToWorld, BOARD_SURFACE_Y } from "./layout"

export type XZ = { x: number; z: number }

/** A terminal bank's four corners: (row0,colStart) (row0,colEnd) (rowMax,colStart) (rowMax,colEnd). */
export type BankCorners = { c00: XZ; c10: XZ; c01: XZ; c11: XZ }
/** A rail line's two ends: a = top (row 0), b = bottom (row ROW_MAX). */
export type RailAnchors = { a: XZ; b: XZ }

export type GridCalibration = {
  /** Shared height of the board surface where holes/wires sit (world mm). */
  height: number
  banks: { L: BankCorners; R: BankCorners }
  /** Keyed by rail col: -2, -1, 10, 11. */
  rails: Record<number, RailAnchors>
}

export const RAIL_COLS = [-2, -1, 10, 11] as const
const ROW_MAX = ROWS - 1

function worldOf(row: number, col: number): XZ {
  const px = gridToPixel({ row, col })
  const w = pixelToWorld(px.x, px.y)
  return { x: w.x, z: w.z }
}

/** Identity calibration derived from the schematic positions. */
function defaultCalibration(): GridCalibration {
  const rails: Record<number, RailAnchors> = {}
  for (const col of RAIL_COLS) {
    rails[col] = { a: worldOf(0, col), b: worldOf(ROW_MAX, col) }
  }
  return {
    height: BOARD_SURFACE_Y,
    banks: {
      L: { c00: worldOf(0, 0), c10: worldOf(0, 4), c01: worldOf(ROW_MAX, 0), c11: worldOf(ROW_MAX, 4) },
      R: { c00: worldOf(0, 5), c10: worldOf(0, 9), c01: worldOf(ROW_MAX, 5), c11: worldOf(ROW_MAX, 9) },
    },
    rails,
  }
}

const STORAGE_KEY = "dreamer:breadboard-grid-calibration"

function load(): GridCalibration {
  const base = defaultCalibration()
  if (typeof localStorage === "undefined") return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as {
      height?: number
      banks?: GridCalibration["banks"]
      rails?: Record<string, { a?: XZ; b?: XZ }>
    }
    // Keep persisted rails only if they match the current 2-anchor shape (older
    // 4-anchor block data is dropped back to the default, not misread).
    const railsOk =
      parsed.rails != null &&
      RAIL_COLS.every((col) => {
        const r = parsed.rails?.[String(col)]
        return r != null && r.a != null && r.b != null && !("c" in r)
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

export function setRailAnchor(col: number, key: keyof RailAnchors, xz: XZ): void {
  commit({
    ...state,
    rails: { ...state.rails, [col]: { ...state.rails[col], [key]: xz } },
  })
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

/** World position a hole/wire attaches to for a breadboard grid cell, warped by
 *  the live calibration. Terminals bilinear-interpolate their bank's corners;
 *  rail holes interpolate linearly between the line's top and bottom anchors. */
export function warpedGridXZ(row: number, col: number): { x: number; y: number; z: number } {
  const cal = state
  const v = ROW_MAX > 0 ? row / ROW_MAX : 0
  if (col >= 0 && col <= 9) {
    const bank = col < 5 ? cal.banks.L : cal.banks.R
    const colStart = col < 5 ? 0 : 5
    const u = (col - colStart) / 4 // 0..1 across the bank's 5 cols
    const top = lerp(bank.c00, bank.c10, u)
    const bot = lerp(bank.c01, bank.c11, u)
    const p = lerp(top, bot, v)
    return { x: p.x, y: cal.height, z: p.z }
  }
  const anchors = cal.rails[col]
  if (!anchors) {
    const w = worldOf(row, col)
    return { x: w.x, y: cal.height, z: w.z }
  }
  const p = lerp(anchors.a, anchors.b, v)
  return { x: p.x, y: cal.height, z: p.z }
}
