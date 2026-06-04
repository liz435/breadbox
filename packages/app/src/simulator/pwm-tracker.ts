// ── PWM duty-cycle tracker ───────────────────────────────────────────────────
//
// avr8js drives PWM (`analogWrite`) pins the way real hardware does: it toggles
// the GPIO HIGH/LOW at the timer frequency (~490–980 Hz). The `onPinChange`
// bridge only sees the *instantaneous* bit, so mirroring it straight into the
// pin store makes a PWM pin's `digitalValue` flap between 0 and 1 on every edge.
//
// Real components don't see that flapping — a motor's rotational inertia and an
// LED's persistence average the switching into a steady level proportional to
// the *duty cycle* (the fraction of time the pin is HIGH). This tracker
// reconstructs that duty cycle from the edge stream so consumers can read a
// smooth `pwmValue` instead of a strobing `digitalValue`.
//
// On each edge it folds the segment that just ended into a time-weighted
// exponential moving average; on `sample()` it folds in the still-open segment
// and decides whether the pin is actively switching (PWM) or has settled to a
// steady HIGH/LOW (a plain `digitalWrite`, or `analogWrite` at 0/255, which
// avr8js drives as a constant level with no edges).

// EMA time constant, in CPU cycles. ~0.9 of a 60fps frame (266k cycles) on a
// 16 MHz MCU, i.e. several PWM periods. Long enough that the duty reported each
// frame barely ripples (≈±3% for a 50% square wave) — so an LED reading it
// won't flicker — yet short enough to track an `analogWrite()` fade within a
// few frames (~45ms). Steady HIGH/LOW is handled by STEADY_CYCLES below, so a
// large TAU here doesn't slow down digital transitions.
const TAU_CYCLES = 250_000

// If a pin holds a single level longer than this, it isn't switching — it's a
// steady digital HIGH/LOW. Two 490 Hz periods (~65k cycles); any genuine PWM,
// even at the duty extremes (1/255 or 254/255), toggles well within this.
const STEADY_CYCLES = 65_000

type PinTrack = {
  level: 0 | 1
  duty: number // EMA estimate, 0..1
  lastEdgeCycle: number // last actual HIGH<->LOW transition
  lastUpdateCycle: number
}

export type PwmSample = {
  isPwm: boolean
  pwmValue: number // 0..255
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export class PwmTracker {
  private pins = new Map<number, PinTrack>()

  /** Drop all per-pin state — call on simulation reset/reload. */
  reset(): void {
    this.pins.clear()
  }

  /** Record a HIGH/LOW transition observed on `pin` at simulated `cycle`. */
  recordEdge(pin: number, value: 0 | 1, cycle: number): void {
    const t = this.pins.get(pin)
    if (!t) {
      this.pins.set(pin, {
        level: value,
        duty: value,
        lastEdgeCycle: cycle,
        lastUpdateCycle: cycle,
      })
      return
    }
    this.integrate(t, cycle)
    if (value !== t.level) {
      t.level = value
      t.lastEdgeCycle = cycle
    }
  }

  /**
   * Fold the still-open segment up to `cycle` into the estimate and classify
   * the pin. Returns null for pins no edge has ever been recorded on.
   */
  sample(pin: number, cycle: number): PwmSample | null {
    const t = this.pins.get(pin)
    if (!t) return null
    this.integrate(t, cycle)
    const switching = cycle - t.lastEdgeCycle < STEADY_CYCLES
    if (!switching) {
      // Settled: report the held level as a fully on/off "PWM" so consumers
      // reading pwmValue still see the right thing, but flag isPwm=false.
      return { isPwm: false, pwmValue: t.level === 1 ? 255 : 0 }
    }
    return { isPwm: true, pwmValue: Math.round(clamp01(t.duty) * 255) }
  }

  /** Pins seen so far (each has had at least one edge recorded). */
  trackedPins(): number[] {
    return [...this.pins.keys()]
  }

  // Advance the time-weighted EMA to `cycle`, weighting the current open
  // segment by how long it has lasted.
  private integrate(t: PinTrack, cycle: number): void {
    const dt = cycle - t.lastUpdateCycle
    if (dt <= 0) return
    const alpha = 1 - Math.exp(-dt / TAU_CYCLES)
    t.duty += alpha * (t.level - t.duty)
    t.lastUpdateCycle = cycle
  }
}
