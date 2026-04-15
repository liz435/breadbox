// ── Sketch Size Ref ────────────────────────────────────────────────────
//
// Shared ref that stores the latest size estimate/info after a successful
// compile or transpile. Read by the sketch editor to show flash/RAM usage.

import type { SketchSizeEstimate } from "./arduino-transpiler"

export type SketchSize = SketchSizeEstimate & {
  /** "estimate" for transpile mode, "actual" for real avr-gcc compile */
  source: "estimate" | "actual"
}

export const sketchSizeRef: { current: SketchSize | null } = { current: null }
