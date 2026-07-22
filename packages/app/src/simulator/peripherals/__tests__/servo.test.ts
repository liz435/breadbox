import { describe, test, expect } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { ServoPeripheral } from "../servo"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

function makeComponent(pin: number): BoardComponent {
  return {
    id: "servo-1",
    type: "servo",
    name: "Servo",
    x: 7,
    y: 5,
    rotation: 0,
    pins: { signal: pin, vcc: null, gnd: null },
    properties: {},
  }
}

const SERVO_POWER_WIRES = {
  "servo-5v": { id: "servo-5v", fromRow: -999, fromCol: -1, toRow: 6, toCol: 7, color: "#ef4444" },
  "servo-gnd": { id: "servo-gnd", fromRow: -999, fromCol: -3, toRow: 7, toCol: 7, color: "#111827" },
}

describe("ServoPeripheral — explicit (transpile-mode) API", () => {
  test("write(angle) updates state angle", () => {
    const p = new ServoPeripheral(makeComponent(9))
    p.onExplicitAttach(9)
    p.onExplicitWrite(45)
    const state = p.getState()
    expect(state).not.toBeNull()
    expect(state?.kind).toBe("servo")
    expect(state?.pin).toBe(9)
    expect(state?.angle).toBe(45)
    expect(state?.attached).toBe(true)
  })

  test("write(angle) clamps to [0, 180]", () => {
    const p = new ServoPeripheral(makeComponent(9))
    p.onExplicitAttach(9)
    p.onExplicitWrite(-50)
    expect(p.getState()?.angle).toBe(0)
    p.onExplicitWrite(250)
    expect(p.getState()?.angle).toBe(180)
  })

  test("detach flips attached flag but keeps last angle", () => {
    const p = new ServoPeripheral(makeComponent(9))
    p.onExplicitAttach(9)
    p.onExplicitWrite(90)
    p.onExplicitDetach()
    const state = p.getState()
    expect(state?.attached).toBe(false)
    expect(state?.angle).toBe(90)
  })
})

describe("ServoPeripheral — AVR pulse detection", () => {
  function edge(pin: number, value: 0 | 1, simMs: number) {
    return { pin, value, simMs, source: "avr" as const }
  }

  test("50Hz frame with 1.5ms pulse → angle ≈ 90°", () => {
    const p = new ServoPeripheral(makeComponent(9))
    // Three frames is enough to hit count=3 and trigger detection.
    let t = 0
    for (let frame = 0; frame < 4; frame++) {
      p.onPinEdge(edge(9, 1, t))
      p.onPinEdge(edge(9, 0, t + 1.5)) // 1.5ms HIGH pulse
      t += 20 // next 50Hz frame
    }
    const state = p.getState()
    expect(state).not.toBeNull()
    expect(state?.kind).toBe("servo")
    // 1.5ms maps to ~92° via Arduino Servo mapping (544-2400µs).
    expect(state?.angle).toBeGreaterThanOrEqual(85)
    expect(state?.angle).toBeLessThanOrEqual(100)
  })

  test("50Hz frame with 0.544ms pulse → angle ≈ 0°", () => {
    const p = new ServoPeripheral(makeComponent(9))
    let t = 0
    for (let frame = 0; frame < 4; frame++) {
      p.onPinEdge(edge(9, 1, t))
      p.onPinEdge(edge(9, 0, t + 0.544))
      t += 20
    }
    const state = p.getState()
    expect(state?.angle).toBeLessThanOrEqual(5)
  })

  test("50Hz frame with 2.4ms pulse → angle ≈ 180°", () => {
    const p = new ServoPeripheral(makeComponent(9))
    let t = 0
    for (let frame = 0; frame < 4; frame++) {
      p.onPinEdge(edge(9, 1, t))
      p.onPinEdge(edge(9, 0, t + 2.4))
      t += 20
    }
    const state = p.getState()
    expect(state?.angle).toBeGreaterThanOrEqual(175)
  })

  test("shiftOut-style bursts are ignored (no servo detection)", () => {
    const p = new ServoPeripheral(makeComponent(9))
    // Six rapid edges over 120µs — typical shiftOut pattern. Frequency would
    // look like thousands of Hz and pulse widths are far outside servo range.
    const base = 0
    for (let i = 0; i < 6; i++) {
      p.onPinEdge(edge(9, (i % 2) as 0 | 1, base + i * 0.02))
    }
    const state = p.getState()
    // Either no state, or attached stays false and angle stays at default 0.
    expect(state?.attached ?? false).toBe(false)
  })
})

describe("PeripheralBus — servo integration", () => {
  test("attachBoard creates a ServoPeripheral per servo component", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: {
        "servo-1": makeComponent(9),
      },
      wires: SERVO_POWER_WIRES,
      pinStore: new PinStateStore(),
    })
    expect(bus.get("servo-1")).toBeDefined()
    const found = bus.findByTypeOnPin("servo", 9)
    expect(found).toBeDefined()
    expect(found?.id).toBe("servo-1")
  })

  test("dispatchEdge drives servo angle through the bus", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: {
        "servo-1": makeComponent(9),
      },
      wires: SERVO_POWER_WIRES,
      pinStore: new PinStateStore(),
    })
    let t = 0
    for (let frame = 0; frame < 4; frame++) {
      bus.dispatchEdge({ pin: 9, value: 1, simMs: t, source: "avr" })
      bus.dispatchEdge({ pin: 9, value: 0, simMs: t + 1.5, source: "avr" })
      t += 20
    }
    const snapshot = bus.snapshot()
    expect(snapshot["servo-1"]?.kind).toBe("servo")
    const angle = snapshot["servo-1"]?.kind === "servo"
      ? snapshot["servo-1"].angle
      : -1
    expect(angle).toBeGreaterThanOrEqual(85)
    expect(angle).toBeLessThanOrEqual(100)
  })

  test("snapshot omits peripherals whose getState returns null", () => {
    const bus = new PeripheralBus()
    // Servo component with no signal pin and no wires → watchedPins empty,
    // getState null.
    bus.attachBoard({
      components: {
        "servo-orphan": {
          id: "servo-orphan",
          type: "servo",
          name: "Servo",
          x: 0,
          y: 0,
          rotation: 0,
          pins: { signal: null, vcc: null, gnd: null },
          properties: {},
        },
      },
      wires: {},
      pinStore: new PinStateStore(),
    })
    expect(Object.keys(bus.snapshot())).toHaveLength(0)
  })

  test("unpowered servo ignores PWM commands", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: { "servo-1": makeComponent(9) },
      wires: {},
      pinStore: new PinStateStore(),
    })
    for (let frame = 0; frame < 4; frame++) {
      const t = frame * 20
      bus.dispatchEdge({ pin: 9, value: 1, simMs: t, source: "avr" })
      bus.dispatchEdge({ pin: 9, value: 0, simMs: t + 1.5, source: "avr" })
    }
    const state = bus.snapshot()["servo-1"]
    expect(state?.kind === "servo" ? state.angle : 0).toBe(0)
  })

  test("resolves signal pin from wire topology when component.pins.signal is null", () => {
    const bus = new PeripheralBus()
    bus.attachBoard({
      components: {
        "servo-1": {
          id: "servo-1",
          type: "servo",
          name: "Servo",
          x: 7, // right cluster
          y: 5,
          rotation: 0,
          pins: { signal: null, vcc: null, gnd: null },
          properties: {},
        },
      },
      wires: {
        ...SERVO_POWER_WIRES,
        "wire-d9": {
          id: "wire-d9",
          fromRow: -999,
          fromCol: 9,
          toRow: 5,
          toCol: 7,
          color: "#fbbf24",
        },
      },
      pinStore: new PinStateStore(),
    })
    // Bus should now know D9 drives this servo.
    expect(bus.findByTypeOnPin("servo", 9)?.id).toBe("servo-1")

    // Drive a servo pulse and confirm state lands.
    let t = 0
    for (let frame = 0; frame < 4; frame++) {
      bus.dispatchEdge({ pin: 9, value: 1, simMs: t, source: "avr" })
      bus.dispatchEdge({ pin: 9, value: 0, simMs: t + 1.5, source: "avr" })
      t += 20
    }
    const snap = bus.snapshot()
    expect(snap["servo-1"]?.kind).toBe("servo")
    const pin = snap["servo-1"]?.kind === "servo" ? snap["servo-1"].pin : -1
    expect(pin).toBe(9)
  })
})
