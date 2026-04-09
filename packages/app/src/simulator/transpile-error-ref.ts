// ── Transpile Error Ref ─────────────────────────────────────────────────
//
// Shared ref that stores the last transpile error so the CodeMirror linter
// can display it inline as a red squiggle. Set by the simulation loop when
// compilation fails, cleared when compilation succeeds or the sketch changes.

import type { TranspileError } from "./arduino-transpiler"

export const transpileErrorRef: { current: TranspileError | null } = { current: null }
