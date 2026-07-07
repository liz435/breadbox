// ── Strict hardware mode flag (ROADMAP Phase D) ────────────────────────────
//
// Opt-in realism that makes the simulator fail the way real hardware fails:
//   - Buttons exhibit contact bounce (a press is a burst of edges, not one).
//   - The HD44780 LCD enforces its busy window — bytes sent while busy are
//     dropped, exactly like skipping the datasheet delays on a real panel.
//   - I2C address collisions corrupt the bus instead of aborting the sim.
//
// Default OFF: lessons and casual builds keep the forgiving behavior. Turn
// on per browser via localStorage.setItem("dreamer.strictHardware", "1").

const STORAGE_KEY = "dreamer.strictHardware"

let overrideValue: boolean | null = null

export function isStrictHardwareEnabled(): boolean {
  if (overrideValue !== null) return overrideValue
  try {
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    if (stored !== null) return stored === "1"
  } catch {
    // Storage unavailable (SSR, tests, privacy mode) — fall through.
  }
  return false
}

/** Test/dev hook: force the flag, or pass null to restore storage-driven value. */
export function setStrictHardwareEnabled(value: boolean | null): void {
  overrideValue = value
}
