// ── Sketch Size Ref ────────────────────────────────────────────────────
//
// Shared ref that stores the latest size estimate/info after a successful
// compile or transpile. Read by the sketch editor to show flash/RAM usage.

import type { SketchSizeEstimate } from "./arduino-transpiler"

export type SketchSize = SketchSizeEstimate & {
  /** "estimate" for transpile mode, "actual" for real avr-gcc compile */
  source: "estimate" | "actual"
  /**
   * When this size was computed. Captured once at write time so the UI
   * displays a stable timestamp instead of re-computing `new Date()` on
   * every render (which makes the stamp appear to roll).
   */
  ts: number
}

export const sketchSizeRef: { current: SketchSize | null } = { current: null }
