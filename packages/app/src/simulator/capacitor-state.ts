// ── Capacitor State ────────────────────────────────────────────────────
//
// Holds the voltage across each capacitor *between* analysis frames.
//
// The capacitor itself is simulated by spicey's native `C` element using a
// proper backward-Euler companion model, which produces the correct
// exponential RC charge/discharge curve. The only thing spicey can't do on
// its own is remember the charge from one `simulate()` call to the next — it
// re-parses the netlist every frame and resets each capacitor to 0V.
//
// So this module is the cross-frame memory: before each transient solve the
// circuit solver seeds every capacitor's initial voltage from here
// (`getCapVoltage`), and after the solve it writes the advanced voltage back
// (`setCapVoltage`). That hand-off is what lets a cap hold its charge, keep
// charging across frames, and discharge through a path when the supply drops.
//
// This file deliberately does NOT integrate anything itself — the previous
// implementation hand-rolled a forward-Euler step with a 1V/frame clamp,
// which charged linearly (not exponentially), ignored the series resistance,
// and was numerically unstable for typical RC values. The real solver owns
// the physics now; this is just a keyed store.

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
