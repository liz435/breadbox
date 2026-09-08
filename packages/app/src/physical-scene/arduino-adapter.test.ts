import { describe, expect, it } from "bun:test"
import servo from "../learn/boards/fixtures/10-servo.hex.json"
import ultrasonic from "../learn/boards/fixtures/12-ultrasonic-sensor.hex.json"
import button from "../learn/boards/fixtures/02-button-led.hex.json"
import motor from "../learn/boards/fixtures/19-dc-motor.hex.json"
import stepper from "../learn/boards/fixtures/23-stepper.hex.json"
import { compileArduinoProgramDriver, createArduinoProgramDriver } from "./arduino-adapter"

describe("physical Arduino driver (real AVR firmware)", () => {
  it("executes compiled Servo sketch, preserves pulse events across slices and replays after reset", () => {
    const options = { actuators: [{ id: "arm", kind: "servo" as const, pin: 9 }] }
    const driver = createArduinoProgramDriver(servo.hex, options)
    expect(driver.advance(0.1).mcuTimeSeconds).toBe(0)
    driver.start()
    const first = driver.advance(0.1)
    expect(first.commands.length).toBeGreaterThanOrEqual(3)
    expect(first.commands.every(c => c.kind === "servo")).toBe(true)
    driver.pause()
    expect(driver.advance(0.1).commands).toEqual([])
    expect(driver.advance(0).mcuTimeSeconds).toBe(first.mcuTimeSeconds)
    driver.reset()
    expect(driver.status).toBe("paused")
    expect(driver.step(0.1)).toEqual(first)
    const split = createArduinoProgramDriver(servo.hex, options)
    split.start()
    const commands = Array.from({ length: 10 }, () => split.advance(0.01)).flatMap(r => r.commands)
    expect(commands).toEqual([...first.commands])
    expect(split.advance(0).mcuTimeSeconds).toBe(first.mcuTimeSeconds)
    driver.dispose(); driver.dispose(); split.dispose()
    expect(() => driver.start()).toThrow("disposed")
    expect(() => driver.reset()).toThrow("disposed")
  })

  it("feeds a held active-low contact through startup INPUT_PULLUP and responds to release", () => {
    const driver = createArduinoProgramDriver(button.hex, {
      actuators: [{ id: "output", kind: "dc_motor", pwmPin: 13 }],
    })
    driver.start()
    driver.advance(0.01, { contacts: [{ pin: 2, active: true, activeLow: true }] })
    expect(driver.advance(0.01).commands[0]).toMatchObject({ drive: 1 })
    driver.advance(0.01, { contacts: [{ pin: 2, active: false, activeLow: true }] })
    expect(driver.advance(0.01).commands[0]).toMatchObject({ drive: 0 })
    driver.reset(); driver.start()
    expect(driver.advance(0.01).commands[0]).toMatchObject({ drive: 0 })
    driver.dispose()
  })

  it("executes pulseIn on scheduled distance echoes and times out for no return", () => {
    const driver = createArduinoProgramDriver(ultrasonic.hex, {
      ultrasonic: [{ id: "range", triggerPin: 7, echoPin: 8 }],
    })
    driver.start()
    const result = driver.advance(0.1, { ultrasonic: [{ id: "range", distanceMeters: 1 }] })
    expect(result.serialOutput).toContain("Distance:")
    const cm = Number(result.serialOutput.match(/Distance: ([\d.]+)/)?.[1])
    expect(cm).toBeGreaterThan(97)
    expect(cm).toBeLessThan(100)
    driver.reset(); driver.start()
    let text = driver.advance(0.1, { ultrasonic: [{ id: "range", distanceMeters: null }] }).serialOutput
    for (let i = 0; i < 11; i++) text += driver.advance(0.1).serialOutput
    expect(text).toContain("Distance: 0.00 cm")
    driver.dispose()
  })

  it("returns real PWM duty rather than last GPIO bit or integrated motor speed", () => {
    const driver = createArduinoProgramDriver(motor.hex, { actuators: [{ id: "motor", kind: "dc_motor", pwmPin: 9 }] })
    driver.start()
    for (let i = 0; i < 7; i++) driver.advance(0.1)
    const command = driver.advance(0.1).commands[0]
    expect(command?.kind).toBe("dc_motor")
    if (command?.kind === "dc_motor") {
      expect(command.drive).toBeGreaterThan(0.4)
      expect(command.drive).toBeLessThan(0.6)
    }
    driver.dispose()
  })

  it("decodes every coil transition from the compiled Stepper library", () => {
    const driver = createArduinoProgramDriver(stepper.hex, {
      actuators: [{ id: "axis", kind: "stepper-coils", pins: [8, 10, 9, 11], stepsPerRevolution: 2048 }],
    })
    driver.start()
    const result = driver.advance(0.1)
    expect(result.commands.length).toBeGreaterThan(20)
    expect(result.commands.every(c => c.kind === "stepper" && Number.isFinite(c.targetSteps))).toBe(true)
    driver.dispose()
  })

  it("counts fast STEP/DIR pulses without tick downsampling, carrying atomic instruction overshoot", () => {
    // Actual AVR instructions: SBI DDRD,2; SBI DDRD,3; SBI PORTD,3;
    // SBI PORTD,2; CBI PORTD,2; RJMP -3. Positive pulses much faster than a tick.
    const firmware = new Uint16Array([0x9a52, 0x9a53, 0x9a5b, 0x9a5a, 0x985a, 0xcffd])
    const driver = createArduinoProgramDriver(firmware, {
      actuators: [{ id: "axis", kind: "stepper", stepPin: 2, directionPin: 3 }],
    })
    driver.start()
    const first = driver.advance(60 / 16_000_000)
    expect(first.commands).toHaveLength(11)
    expect(first.commands.at(-1)).toMatchObject({ deltaSteps: 1, targetSteps: 11 })
    expect(driver.advance(60 / 16_000_000).commands.at(-1)).toMatchObject({ targetSteps: 23 })
    driver.dispose()
  })

  it("validates before advancing and propagates compiler failures", async () => {
    const driver = createArduinoProgramDriver(servo.hex)
    driver.start()
    for (const dt of [-1, NaN, Infinity, 0.2]) expect(() => driver.advance(dt)).toThrow()
    expect(() => driver.advance(0.01, { digital: [{ pin: 30, value: true }] })).toThrow()
    expect(driver.advance(0).timeSeconds).toBe(0)
    await expect(compileArduinoProgramDriver("bad", async () => ({ success: false, error: "compile failed" }))).rejects.toThrow("compile failed")
    await expect(compileArduinoProgramDriver("pico", async () => ({ success: true, format: "uf2" }))).rejects.toThrow("ATmega328P")
    driver.dispose()
  })
})
