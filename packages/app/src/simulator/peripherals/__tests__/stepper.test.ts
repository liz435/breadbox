import { describe, test, expect } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { StepperPeripheral } from "../stepper"
import { PinStateStore } from "../../pin-state-store"
import type { PeripheralContext } from "../types"

const IN1 = 8
const IN2 = 9
const IN3 = 10
const IN4 = 11

function makeStepper(stepsPerRev = 2048): BoardComponent {
  return {
    id: "stp-1",
    type: "stepper_motor",
    name: "Stepper",
    x: 2,
    y: 1,
    rotation: 0,
    // Explicit pins so the peripheral binds without wire resolution.
    pins: { in1: IN1, in2: IN2, in3: IN3, in4: IN4, vplus: null, gnd: null },
    properties: { stepsPerRev },
  }
}

function makeCtx(store: PinStateStore, component: BoardComponent): PeripheralContext {
  return {
    componentId: component.id,
    component,
    wires: {},
    pinStore: store,
    trace: () => {},
    scheduleEdge: () => {},
    nowSimMs: () => 0,
    attachTwi: () => () => {},
  }
}

type Pattern = readonly [number, number, number, number]

// HD44780-style half-step sequence on IN1..IN4 (one 45° field step each).
const HALF_STEP: Pattern[] = [
  [1, 0, 0, 0],
  [1, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 1, 1],
  [0, 0, 0, 1],
  [1, 0, 0, 1],
]

/** Set the four coil levels, then notify the peripheral of the edge. */
function apply(p: StepperPeripheral, store: PinStateStore, pat: Pattern): void {
  const pins = [IN1, IN2, IN3, IN4]
  pins.forEach((pin, i) => store.writeFromSketch(pin, { mode: "OUTPUT", digitalValue: pat[i] as 0 | 1 }))
  p.onPinEdge({ pin: IN1, value: pat[0] as 0 | 1, simMs: 0, source: "avr" })
}

/** Drive `count` half-steps forward (wrapping the 8-pattern ring). */
function driveForward(p: StepperPeripheral, store: PinStateStore, count: number): void {
  for (let i = 0; i < count; i++) apply(p, store, HALF_STEP[i % 8])
}

function angleOf(p: StepperPeripheral): number {
  const s = p.getState()
  return s ? s.angle : NaN
}

describe("StepperPeripheral — 4-phase field decode", () => {
  test("watches all four IN pins", () => {
    const p = new StepperPeripheral(makeStepper())
    expect(p.watchedPins.has(IN1)).toBe(true)
    expect(p.watchedPins.has(IN2)).toBe(true)
    expect(p.watchedPins.has(IN3)).toBe(true)
    expect(p.watchedPins.has(IN4)).toBe(true)
  })

  test("forward half-step sequence advances the shaft (positive, monotonic)", () => {
    const store = new PinStateStore()
    const p = new StepperPeripheral(makeStepper())
    p.attach(makeCtx(store, makeStepper()))
    apply(p, store, HALF_STEP[0]) // seed reference, no accumulation
    let prev = angleOf(p)
    expect(prev).toBe(0)
    for (let i = 1; i < 8; i++) {
      apply(p, store, HALF_STEP[i])
      const cur = angleOf(p)
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })

  test("one full electrical cycle (8 half-steps) = 4 full steps of the output rev", () => {
    const store = new PinStateStore()
    const p = new StepperPeripheral(makeStepper(2048))
    p.attach(makeCtx(store, makeStepper(2048)))
    // Seed on pattern 0, then walk patterns 1,2,…,7,0 — eight 45° transitions =
    // 360° of field = one electrical cycle = 4 full steps.
    apply(p, store, HALF_STEP[0])
    for (let i = 1; i <= 8; i++) apply(p, store, HALF_STEP[i % 8])
    // 4 full steps / 2048 steps-per-rev × 360° = 0.703°.
    expect(angleOf(p)).toBeCloseTo((4 / 2048) * 360, 3)
  })

  test("reversing the sequence returns the shaft toward zero", () => {
    const store = new PinStateStore()
    const p = new StepperPeripheral(makeStepper())
    p.attach(makeCtx(store, makeStepper()))
    apply(p, store, HALF_STEP[0])
    driveForward(p, store, 8)
    const forward = angleOf(p)
    expect(forward).toBeGreaterThan(0)
    // Walk the ring backwards the same number of steps.
    for (let i = 7; i >= 0; i--) apply(p, store, HALF_STEP[i % 8])
    expect(angleOf(p)).toBeCloseTo(0, 5)
  })

  test("a zero field (all coils off / opposing) holds the angle", () => {
    const store = new PinStateStore()
    const p = new StepperPeripheral(makeStepper())
    p.attach(makeCtx(store, makeStepper()))
    driveForward(p, store, 4)
    const held = angleOf(p)
    apply(p, store, [0, 0, 0, 0]) // all off
    apply(p, store, [1, 0, 1, 0]) // opposing coils → zero vector
    expect(angleOf(p)).toBe(held)
  })

  test("reset returns the shaft to zero", () => {
    const store = new PinStateStore()
    const p = new StepperPeripheral(makeStepper())
    p.attach(makeCtx(store, makeStepper()))
    driveForward(p, store, 5)
    expect(angleOf(p)).not.toBe(0)
    p.reset()
    expect(angleOf(p)).toBe(0)
  })
})
