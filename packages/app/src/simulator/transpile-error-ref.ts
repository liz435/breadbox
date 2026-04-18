// ── Transpile Error Ref ─────────────────────────────────────────────────
//
// Shared ref that stores the last transpile error so the CodeMirror linter
// can display it inline as a red squiggle. Set by the simulation loop when
// compilation fails, cleared when compilation succeeds or the sketch changes.

import type { TranspileError } from "./arduino-transpiler"

/**
 * Transpile error wrapped with a capture timestamp. The UI renders `ts`
 * verbatim instead of computing the clock at render time, so the
 * displayed stamp doesn't advance on every React re-render.
 */
export type TimestampedTranspileError = {
  error: TranspileError
  ts: number
}

export const transpileErrorRef: { current: TimestampedTranspileError | null } = { current: null }
