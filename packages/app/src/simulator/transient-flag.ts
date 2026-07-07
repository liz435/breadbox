// ── Transient solver feature flag ──────────────────────────────────────────
//
// Gates the Phase A "robust transient" solver path (see ROADMAP.md). When ON,
// the simulation loop drives a persistent TransientSession: real C/L elements,
// PWM as square-wave sources, circuit time advancing in lockstep with the
// MCU's simulated clock. When OFF, the legacy repeated operating-point path
// (duty-averaged PWM + display-timescale capacitor evolution) runs instead —
// that path doubles as the education "demo timescale" mode, since it shows
// fast RC transients stretched to a watchable speed.
//
// Default ON. Override per browser via
//   localStorage.setItem("dreamer.transientSolver", "0")
// and reload. Node/test environments (no localStorage) get the default; tests
// that need a specific path call the exported setter.

const STORAGE_KEY = "dreamer.transientSolver"

let overrideValue: boolean | null = null

export function isTransientSolverEnabled(): boolean {
  if (overrideValue !== null) return overrideValue
  try {
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    if (stored !== null) return stored !== "0"
  } catch {
    // Storage unavailable (SSR, tests, privacy mode) — fall through to default.
  }
  return true
}

/** Test/dev hook: force the flag, or pass null to restore storage-driven value. */
export function setTransientSolverEnabled(value: boolean | null): void {
  overrideValue = value
}
