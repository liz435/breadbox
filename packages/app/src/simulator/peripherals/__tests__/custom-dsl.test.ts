import { describe, test, expect } from "bun:test"
import type { BoardComponent, CustomComponentDsl } from "@dreamer/schemas"
import { customComponentDslSchema } from "@dreamer/schemas"
import { createCustomDslPeripheral } from "../custom-dsl"

function makeDsl(spec: Record<string, unknown>): CustomComponentDsl {
  const result = customComponentDslSchema.safeParse({
    type: "custom:test-part",
    label: "Test Part",
    pins: [
      { name: "step", dx: 0, dy: 0 },
      { name: "dir", dx: 0, dy: 1 },
      { name: "ena", dx: 0, dy: 2 },
    ],
    ...spec,
  })
  if (!result.success) throw new Error(result.error.message)
  return result.data
}

function makeComponent(pins: Record<string, number | null>, properties: Record<string, unknown> = {}): BoardComponent {
  return {
    id: "part-1",
    type: "custom:test-part",
    name: "Test Part",
    x: 3,
    y: 4,
    rotation: 0,
    pins,
    properties,
  }
}

function edge(pin: number, value: 0 | 1, simMs: number) {
  return { pin, value, simMs, source: "avr" as const }
}

function values(p: NonNullable<ReturnType<typeof createCustomDslPeripheral>>): Record<string, number> {
  const state = p.getState()
  if (state?.kind !== "custom") throw new Error("expected custom state")
  return state.values
}

describe("createCustomDslPeripheral", () => {
  test("returns null when the part declares no signals", () => {
    const dsl = makeDsl({})
    expect(createCustomDslPeripheral(dsl, makeComponent({ step: 2 }))).toBeNull()
  })

  test("count with a direction pin: STEP edges add ±1 by DIR level", () => {
    const dsl = makeDsl({
      properties: { stepAngle: 1.8 },
      behavior: {
        signals: [
          { kind: "count", name: "steps", pin: "step", direction: "dir" },
          { kind: "expr", name: "angle", expr: "steps * stepAngle" },
        ],
      },
    })
    const p = createCustomDslPeripheral(dsl, makeComponent({ step: 2, dir: 3, ena: null }, { stepAngle: 1.8 }))!
    expect([...p.watchedPins].sort()).toEqual([2, 3])

    // DIR high → forward
    p.onPinEdge(edge(3, 1, 0))
    for (let i = 0; i < 10; i++) {
      p.onPinEdge(edge(2, 1, 1 + i * 2))
      p.onPinEdge(edge(2, 0, 2 + i * 2))
    }
    expect(values(p).steps).toBe(10)
    expect(values(p).angle).toBeCloseTo(18)

    // DIR low → backward
    p.onPinEdge(edge(3, 0, 30))
    for (let i = 0; i < 4; i++) {
      p.onPinEdge(edge(2, 1, 31 + i * 2))
      p.onPinEdge(edge(2, 0, 32 + i * 2))
    }
    expect(values(p).steps).toBe(6)
  })

  test("digital tracks the pin level", () => {
    const dsl = makeDsl({ behavior: { signals: [{ kind: "digital", name: "on", pin: "ena" }] } })
    const p = createCustomDslPeripheral(dsl, makeComponent({ ena: 5 }))!
    expect(values(p).on).toBe(0)
    p.onPinEdge(edge(5, 1, 0))
    expect(values(p).on).toBe(1)
    p.onPinEdge(edge(5, 0, 1))
    expect(values(p).on).toBe(0)
  })

  test("pwm measures duty cycle and settles to DC level on silence", () => {
    const dsl = makeDsl({ behavior: { signals: [{ kind: "pwm", name: "duty", pin: "ena" }] } })
    const p = createCustomDslPeripheral(dsl, makeComponent({ ena: 5 }))!
    // 25% duty at ~490Hz: 0.51ms high of a 2.04ms period.
    let t = 0
    for (let i = 0; i < 5; i++) {
      p.onPinEdge(edge(5, 1, t))
      p.onPinEdge(edge(5, 0, t + 0.51))
      t += 2.04
    }
    expect(values(p).duty).toBeCloseTo(0.25, 1)
    // Pin parks HIGH, edges stop → duty reads 1.
    p.onPinEdge(edge(5, 1, t))
    p.onTick(t + 500)
    expect(values(p).duty).toBe(1)
  })

  test("frequency measures edge rate and decays to 0", () => {
    const dsl = makeDsl({ behavior: { signals: [{ kind: "frequency", name: "hz", pin: "step" }] } })
    const p = createCustomDslPeripheral(dsl, makeComponent({ step: 2 }))!
    for (let i = 0; i < 5; i++) {
      p.onPinEdge(edge(2, 1, i * 10)) // 100 Hz
      p.onPinEdge(edge(2, 0, i * 10 + 5))
    }
    expect(values(p).hz).toBeCloseTo(100)
    p.onTick(1000)
    expect(values(p).hz).toBe(0)
  })

  test("integrate accumulates rate × seconds with wrap", () => {
    const dsl = makeDsl({
      properties: { degPerSec: 90 },
      behavior: {
        signals: [
          { kind: "digital", name: "on", pin: "ena" },
          { kind: "integrate", name: "angle", rate: "on * degPerSec", wrap: 360 },
        ],
      },
    })
    const p = createCustomDslPeripheral(dsl, makeComponent({ ena: 5 }, { degPerSec: 90 }))!
    p.onTick(0)
    p.onTick(1000)
    expect(values(p).angle).toBe(0) // ena low → no motion
    p.onPinEdge(edge(5, 1, 1000))
    p.onTick(3000) // 2s at 90°/s = 180°
    expect(values(p).angle).toBeCloseTo(180)
    p.onTick(6000) // +270° → 450° → wraps to 90°
    expect(values(p).angle).toBeCloseTo(90)
  })

  test("reset returns all signals to their initial values", () => {
    const dsl = makeDsl({ behavior: { signals: [{ kind: "count", name: "n", pin: "step" }] } })
    const p = createCustomDslPeripheral(dsl, makeComponent({ step: 2 }))!
    p.onPinEdge(edge(2, 1, 0))
    expect(values(p).n).toBe(1)
    p.reset()
    expect(values(p).n).toBe(0)
  })
})
