// ── Contact bounce (ROADMAP Phase D) ───────────────────────────────────────
//
// A real tactile switch doesn't make one clean transition — the springy
// contacts chatter for ~0.25–2 ms before settling. Sketches that read a
// button without debouncing count several presses per click; the debounce
// lesson exists precisely because of this. In strict hardware mode a press/
// release schedules that burst as sim-time pin edges through the peripheral
// bus (the same µs-precision path the ultrasonic echo uses), so a fast-
// polling sketch really does see the chatter.
//
// The pattern is deterministic (no randomness): identical presses behave
// identically, which keeps lessons and tests reproducible.

import type { PeripheralBus } from "./peripherals/peripheral-bus"

/**
 * Bounce envelope, milliseconds after the initial contact. Each entry flips
 * the line AWAY from the final value and back; the line settles at
 * `finalValue` from BOUNCE_SETTLE_MS on. ~1.1 ms total — inside the real
 * 0.25–2 ms range.
 */
const BOUNCE_PATTERN_MS: ReadonlyArray<{ atMs: number; toFinal: boolean }> = [
  { atMs: 0.25, toFinal: false },
  { atMs: 0.45, toFinal: true },
  { atMs: 0.7, toFinal: false },
  { atMs: 0.85, toFinal: true },
  { atMs: 1.0, toFinal: false },
  { atMs: 1.1, toFinal: true },
]

export type BounceContext = {
  /** The peripheral bus carrying the scheduled-edge queue. */
  bus: PeripheralBus
  /** Current simulated time in ms (runner.getMillis()). */
  nowSimMs: number
  /** Immediate write for the leading edge (pin store external write). */
  writeNow: (pin: number, value: 0 | 1) => void
}

/**
 * Drive `pin` to `finalValue` with a realistic bounce burst. The leading
 * edge lands immediately; the chatter and the settling edge are scheduled
 * in sim time.
 */
export function writeWithContactBounce(
  pin: number,
  finalValue: 0 | 1,
  ctx: BounceContext,
): void {
  const restValue: 0 | 1 = finalValue === 1 ? 0 : 1
  ctx.writeNow(pin, finalValue)
  for (const step of BOUNCE_PATTERN_MS) {
    ctx.bus.scheduleEdge(
      pin,
      step.toFinal ? finalValue : restValue,
      ctx.nowSimMs + step.atMs,
    )
  }
}
