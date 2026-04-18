// ── Sketch Size Ref ────────────────────────────────────────────────────
//
// Shared ref holding the latest size info after a successful AVR compile.
// Read by the sketch editor to show flash/RAM usage.

import type { SketchSizeInfo } from "./avr-compiler"

export type SketchSize = SketchSizeInfo & {
  /** Always "actual" post-transpile-drop; kept for UI formatting. */
  source: "actual"
  /**
   * When this size was computed. Captured once at write time so the UI
   * displays a stable timestamp instead of re-computing `new Date()` on
   * every render (which makes the stamp appear to roll).
   */
  ts: number
}

export const sketchSizeRef: { current: SketchSize | null } = { current: null }
