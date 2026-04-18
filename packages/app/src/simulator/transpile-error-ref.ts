// ── Sketch Compile Error Ref ───────────────────────────────────────────────
//
// Shared ref that stores the last sketch compile error so the CodeMirror
// linter can display it inline as a red squiggle. Set by simulation-loop
// when compilation fails (arduino-cli), cleared when compilation succeeds
// or the sketch changes.
//
// Kept under the name `transpileErrorRef` for UI-consumer stability even
// though the transpiler is gone — the data shape is identical.

/** Compile/transpile error with line number, column, and message. */
export type TranspileError = {
  line: number
  column?: number
  message: string
}

/**
 * Error wrapped with a capture timestamp. The UI renders `ts` verbatim
 * instead of computing the clock at render time, so the displayed stamp
 * doesn't advance on every React re-render.
 */
export type TimestampedTranspileError = {
  error: TranspileError
  ts: number
}

export const transpileErrorRef: { current: TimestampedTranspileError | null } = { current: null }
