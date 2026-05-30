// ── Capacitor State ────────────────────────────────────────────────────
//
// Holds the voltage across each capacitor *between* analysis frames.
//
// A capacitor is modelled in the netlist as a DC voltage source held at the
// value stored here (see the registry). Each frame the circuit solver reads
// the cap's branch current, probes the surrounding circuit to find where the
// cap is heading and how fast (Thevenin), and steps this stored voltage one
// exponential step toward that target on a *watchable* display timescale —
// see circuit-solver.ts → evolveCapacitorVoltages.
//
// So this module is just the cross-frame memory for that evolving voltage:
// `getCapVoltage` feeds the next netlist, `setCapVoltage` records the stepped
// value. It deliberately does NOT integrate anything itself — the original
// implementation hand-rolled a forward-Euler step with a 1V/frame clamp, which
// charged linearly (not exponentially) and ignored the circuit entirely.

/** Per-capacitor persistent state. */
export type CapState = {
  /** Voltage across the capacitor at the end of the last solve, in volts. */
  voltage: number
}

const store = new Map<string, CapState>()

/** Get the stored voltage for a capacitor. Defaults to 0V if unseen. */
export function getCapVoltage(componentId: string): number {
  return store.get(componentId)?.voltage ?? 0
}

/**
 * Persist the voltage a capacitor reached after a transient solve, so the
 * next frame can resume integration from it.
 *
 * Non-finite values (NaN/Infinity from a failed/singular solve) are ignored
 * so a bad frame can't corrupt the stored charge — the cap simply holds its
 * previous voltage.
 */
export function setCapVoltage(componentId: string, voltage: number): void {
  if (!Number.isFinite(voltage)) return
  store.set(componentId, { voltage })
}

/** Reset a single capacitor (e.g., on component removal). */
export function resetCapVoltage(componentId: string): void {
  store.delete(componentId)
}

/** Reset all capacitors (e.g., on board load or simulation stop). */
export function resetAllCapVoltages(): void {
  store.clear()
}
