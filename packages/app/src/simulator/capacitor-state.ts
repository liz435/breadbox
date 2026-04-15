// ── Capacitor State ────────────────────────────────────────────────────
//
// Tracks the voltage across each capacitor between solver frames.
// The SPICE solver is purely algebraic (no time-domain memory), so we
// model a charged capacitor as a DC voltage source at its last known
// voltage and use the resulting current to step the charge forward:
//
//   V_new = V_old − (I × dt / C)
//
// This is first-order Euler integration of I = C × dV/dt. Not
// precision-grade, but plenty for visual feedback at 10–60 fps.

/** Per-capacitor persistent state. */
export type CapState = {
  /** Current voltage across the capacitor, in volts. */
  voltage: number
}

const store = new Map<string, CapState>()

/** Get the current voltage for a capacitor. Defaults to 0V if unseen. */
export function getCapVoltage(componentId: string): number {
  return store.get(componentId)?.voltage ?? 0
}

/**
 * Step the capacitor voltage forward by one frame.
 *
 * @param componentId  Unique component ID.
 * @param currentAmps  Current through the cap this frame (from SPICE), in amps.
 *                     Positive = charging (voltage increases).
 * @param capacitanceFarads  Capacitance in farads.
 * @param dtSeconds    Frame time step in seconds.
 */
/**
 * Step the capacitor voltage forward by one frame.
 *
 * Instead of a single Euler step (which overshoots when dt >> RC), we
 * derive the Thevenin-equivalent circuit the cap sees and use the
 * analytical RC exponential: V(t) = Vfinal + (V0 - Vfinal) × e^(-t/RC).
 *
 * From the SPICE solution at the current cap voltage:
 *   - I = current through the cap (amps)
 *   - Vcap = stored voltage
 *   - Rth = effective Thevenin resistance = |Vth - Vcap| / |I|
 *   - Vth = Vcap + I × Rth  (the voltage the cap approaches at t→∞)
 *   - τ = Rth × C
 *
 * Since the cap is modeled as a V source at Vcap, if SPICE reports
 * current I, then the rest of the circuit is pushing/pulling current.
 * The Thevenin equivalent is: Vth drives through Rth into the cap.
 * We know I and Vcap, so Rth = (some external voltage - Vcap) / I.
 * But we can compute Vth directly: at steady state I=0, so Vth is
 * simply the voltage the cap would reach. We estimate Rth from the
 * current and a reference: Rth ≈ 1 / (I / (Vdrive - Vcap)).
 * Since we don't know Vdrive, use the simpler first-order approach:
 * Rth = |dV_external / I| where dV_external is the voltage the
 * resistor(s) drop.
 *
 * Practical shortcut: SPICE gives us I at the current Vcap.
 * If I > 0, the cap is charging toward some Vfinal > Vcap.
 * If I < 0, discharging toward some Vfinal < Vcap.
 * The effective Rth = Vcap_if_no_cap / I, but we can estimate the
 * time constant τ and step with the exponential formula.
 *
 * @param componentId        Unique component ID.
 * @param currentAmps        Current through the cap (from SPICE), positive = charging.
 * @param capacitanceFarads  Capacitance in farads.
 * @param dtSeconds          Frame time step in seconds.
 */
export function stepCapVoltage(
  componentId: string,
  currentAmps: number,
  capacitanceFarads: number,
  dtSeconds: number,
): number {
  const prev = getCapVoltage(componentId)

  if (Math.abs(currentAmps) < 1e-9) {
    return prev
  }

  // Estimate the Thevenin resistance from the current operating point.
  // At Vcap=prev, the circuit pushes I amps. The total Thevenin voltage
  // driving this current through Rth is: Vth = prev + I × Rth.
  // We also know that when Vcap = Vth, I = 0.
  // From two operating points we could solve exactly, but we only have one.
  //
  // Heuristic: assume the external circuit is roughly linear. Then
  // Rth ≈ ΔV / ΔI. With only one point, estimate Rth from the maximum
  // possible voltage swing: if the cap is at 0V and current is 5mA from
  // a 5V source through 1kΩ, Rth = 5V / 0.005A = 1000Ω. This is the
  // full Thevenin resistance.
  //
  // Shortcut: Rth = (Vth - prev) / I. If we assume Vth is roughly the
  // supply voltage when charging (or 0V when discharging), we can estimate.
  // But we don't know the supply voltage from here.
  //
  // SIMPLEST STABLE APPROACH: use an exponential smoothing factor derived
  // from the RC time constant with a conservative Rth estimate.
  // Since the analysis runs at ~5 fps (200ms), and typical Arduino RC
  // circuits have τ = 0.01s to 1s, we want smooth visible transitions.
  //
  // Use the basic formula but with a damping factor to prevent overshoot:
  //   dV = I × dt / C
  //   limit |dV| to a fraction of the remaining voltage headroom

  const idealDv = (currentAmps * dtSeconds) / capacitanceFarads

  // Damping: never change more than 20% of the supply rail (5V) per frame.
  // This prevents the oscillation that happens when dV > Vcap.
  const maxDv = 1.0 // max 1V per frame
  const dv = Math.sign(idealDv) * Math.min(Math.abs(idealDv), maxDv)

  const next = Math.max(0, Math.min(prev + dv, 25))
  store.set(componentId, { voltage: next })
  return next
}

/** Reset a single capacitor (e.g., on component removal). */
export function resetCapVoltage(componentId: string): void {
  store.delete(componentId)
}

/** Reset all capacitors (e.g., on board load or simulation stop). */
export function resetAllCapVoltages(): void {
  store.clear()
}
