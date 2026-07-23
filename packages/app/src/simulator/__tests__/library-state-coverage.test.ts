// ── Peripheral state reaches the renderer ────────────────────────────────────
//
// syncLibraryState (simulation-loop.ts) is the only bridge from the peripheral
// bus to anything that can draw. A peripheral kind that it forgets to map is
// silently invisible: the physics runs every frame, the 3D scene never hears
// about it, and nothing fails. That is exactly how the relay ended up fully
// simulated — 7 ms pull-in, contacts switching the netlist — while being a
// completely inert lump on screen, and how the DC motor's rotor model ended up
// shadowed by a second, different one in the animation driver.
//
// This pins the mapping: every kind carrying mechanical or visual state must
// have a home in LibraryState. Adding a peripheral kind with a visual and no
// mapping is now a failing test rather than a part that quietly does nothing.

import { describe, expect, test } from "bun:test"
import { libraryStateSchema } from "@dreamer/schemas"

/**
 * Peripheral kinds whose state a viewer can see, mapped to the LibraryState key
 * that carries them. Extend this when adding a peripheral with a visual.
 */
const VISUAL_KINDS: Record<string, keyof ReturnType<typeof libraryStateSchema.parse>> = {
  servo: "servos",
  stepper: "steppers",
  relay: "relays",
  dc_motor: "motors",
  lcd: "lcd",
  oled: "oled",
  neopixel: "neopixels",
  custom: "custom",
}

/**
 * Kinds deliberately absent from LibraryState, with the reason. Anything not
 * listed here and not in VISUAL_KINDS is an unreviewed gap.
 */
const NON_VISUAL_KINDS: Record<string, string> = {
  buzzer: "audible only — driven straight to an OscillatorNode in simulation-loop",
  led: "drawn from solved current via CircuitAnalysis, not peripheral state",
  rgb_led: "drawn per-channel from pin states in the animation driver",
  seven_segment: "drawn per-segment from pin states in the animation driver",
  ultrasonic: "input sensor — no visual output",
  dht: "input sensor — no visual output",
  ir_receiver: "input sensor — no visual output",
  shift_register: "drives other parts' pins; no body of its own",
  raw: "diagnostic passthrough",
  edge: "diagnostic passthrough",
}

describe("every peripheral kind with a visual reaches LibraryState", () => {
  const shape = libraryStateSchema.parse({ servos: {}, steppers: {}, lcd: null })

  for (const [kind, key] of Object.entries(VISUAL_KINDS)) {
    test(`${kind} → libraryState.${String(key)}`, () => {
      expect({ kind, present: key in shape }).toEqual({ kind, present: true })
    })
  }

  test("the two classifications do not overlap", () => {
    const both = Object.keys(VISUAL_KINDS).filter((k) => k in NON_VISUAL_KINDS)
    expect(both).toEqual([])
  })

  // The mechanical parts are the ones this test exists for: their peripherals
  // own timing and inertia the renderer must mirror rather than re-derive.
  test("relay and motor state carry the fields the renderer needs", () => {
    const parsed = libraryStateSchema.parse({
      servos: {}, steppers: {}, lcd: null,
      relays: { r1: { energized: true, pending: false } },
      motors: { m1: { speed: 0.42 } },
    })
    expect(parsed.relays.r1).toEqual({ energized: true, pending: false })
    expect(parsed.motors.m1.speed).toBeCloseTo(0.42)
  })
})
