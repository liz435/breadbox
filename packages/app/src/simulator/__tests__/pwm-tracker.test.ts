import { describe, expect, it } from "bun:test"
import { PwmTracker } from "../pwm-tracker"

// ATmega328P @ 16 MHz, Timer default ~490 Hz → ~32653 cycles per PWM period.
const PERIOD = Math.round(16_000_000 / 490)

/**
 * Drive `tracker` with `periods` cycles of a square wave on `pin` at the given
 * duty (0..1), starting at `startCycle`. Returns the cycle the wave ends on so
 * the caller can sample at a known phase.
 */
function feedPwm(
  tracker: PwmTracker,
  pin: number,
  duty: number,
  periods: number,
  startCycle = 0,
): number {
  const high = Math.round(PERIOD * duty)
  let c = startCycle
  for (let i = 0; i < periods; i++) {
    tracker.recordEdge(pin, 1, c) // rising edge
    if (high > 0 && high < PERIOD) tracker.recordEdge(pin, 0, c + high) // falling edge
    c += PERIOD
  }
  return c
}

describe("PwmTracker", () => {
  it("returns null for a pin that has never seen an edge", () => {
    const tracker = new PwmTracker()
    expect(tracker.sample(9, 100_000)).toBeNull()
  })

  it("reconstructs the duty cycle of a 50% square wave", () => {
    const tracker = new PwmTracker()
    const end = feedPwm(tracker, 9, 0.5, 40)
    const sample = tracker.sample(9, end)
    expect(sample?.isPwm).toBe(true)
    // ~127.5 ± frame-phase ripple
    expect(sample?.pwmValue).toBeGreaterThan(110)
    expect(sample?.pwmValue).toBeLessThan(145)
  })

  it("tracks low and high duty cycles", () => {
    const low = new PwmTracker()
    const lowEnd = feedPwm(low, 5, 0.2, 40)
    const lowSample = low.sample(5, lowEnd)
    expect(lowSample?.isPwm).toBe(true)
    expect(lowSample?.pwmValue).toBeGreaterThan(35)
    expect(lowSample?.pwmValue).toBeLessThan(75)

    const high = new PwmTracker()
    const highEnd = feedPwm(high, 6, 0.8, 40)
    const highSample = high.sample(6, highEnd)
    expect(highSample?.isPwm).toBe(true)
    expect(highSample?.pwmValue).toBeGreaterThan(185)
    expect(highSample?.pwmValue).toBeLessThan(225)
  })

  it("classifies a steady HIGH as non-PWM at full value", () => {
    const tracker = new PwmTracker()
    tracker.recordEdge(13, 1, 0) // single rising edge, then held HIGH
    const sample = tracker.sample(13, 500_000) // long after, no further edges
    expect(sample?.isPwm).toBe(false)
    expect(sample?.pwmValue).toBe(255)
  })

  it("classifies a steady LOW as non-PWM at zero", () => {
    const tracker = new PwmTracker()
    tracker.recordEdge(13, 1, 0)
    tracker.recordEdge(13, 0, 1_000) // drops LOW and stays
    const sample = tracker.sample(13, 500_000)
    expect(sample?.isPwm).toBe(false)
    expect(sample?.pwmValue).toBe(0)
  })

  it("falls back to steady once PWM stops toggling (analogWrite → digitalWrite HIGH)", () => {
    const tracker = new PwmTracker()
    const end = feedPwm(tracker, 9, 0.5, 20)
    // While switching, it reads as PWM.
    expect(tracker.sample(9, end)?.isPwm).toBe(true)
    // The sketch now drives the pin steady HIGH (one final rising edge, then no
    // more toggling). After a couple of silent periods it should read as a
    // steady HIGH rather than a stale 50% duty.
    tracker.recordEdge(9, 1, end)
    const settled = tracker.sample(9, end + 100_000)
    expect(settled?.isPwm).toBe(false)
    expect(settled?.pwmValue).toBe(255)
  })

  it("reset() forgets all pins", () => {
    const tracker = new PwmTracker()
    feedPwm(tracker, 9, 0.5, 10)
    expect(tracker.trackedPins()).toContain(9)
    tracker.reset()
    expect(tracker.trackedPins()).toHaveLength(0)
    expect(tracker.sample(9, 100_000)).toBeNull()
  })
})
