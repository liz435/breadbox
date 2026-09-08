import { describe, expect, test } from "bun:test"
import { createEmptyPhysicalScene, type PhysicalScene } from "@dreamer/schemas"
import type { ArduinoAdvanceResult, ArduinoFeedback, ArduinoProgramDriver } from "../arduino-adapter"
import { arduinoBindingsForScene, PhysicalSimulationCoordinator } from "../coordinator"
import { PhysicalRuntime } from "../runtime"

function scene(): PhysicalScene {
  const empty = createEmptyPhysicalScene()
  return {
    ...empty,
    bodies: {
      base: {
        id: "base", name: "Base", kind: "fixed", position: [0, 0, 0], rotation: [0, 0, 0], mass: 1,
        colliders: [{ shape: "box", size: [300, 20, 300], offset: [0, -10, 0], rotation: [0, 0, 0], friction: 0.5, restitution: 0 }],
      },
      arm: {
        id: "arm", name: "Arm", kind: "dynamic", position: [0, 50, 0], rotation: [0, 0, 0], mass: 0.1,
        colliders: [{ shape: "box", size: [20, 100, 20], offset: [0, 0, 0], rotation: [0, 0, 0], friction: 0.5, restitution: 0 }],
      },
    },
    joints: {
      hinge: {
        id: "hinge", name: "Hinge", kind: "revolute", bodyA: "base", bodyB: "arm",
        anchorA: [0, 0, 0], anchorB: [0, -50, 0], axis: [0, 1, 0], limits: { min: -1, max: 1 },
      },
    },
    actuators: {
      servo: { id: "servo", name: "Servo", jointId: "hinge", kind: "servo", target: 0, kp: 4, kd: 0.5, maxForce: 1, speedLimit: 2 },
    },
  }
}

function fakeDriver(): ArduinoProgramDriver & { advances: number; steps: number; feedback: ArduinoFeedback[] } {
  let status: ArduinoProgramDriver["status"] = "paused"
  const driver = {
    advances: 0,
    steps: 0,
    feedback: [] as ArduinoFeedback[],
    get status() { return status },
    start() { status = "running" },
    pause() { status = "paused" },
    reset() { status = "paused" },
    dispose() { status = "disposed" },
    advance(dtSeconds: number, feedback: ArduinoFeedback = {}): ArduinoAdvanceResult {
      driver.advances += 1
      driver.feedback.push(feedback)
      return { timeSeconds: dtSeconds, mcuTimeSeconds: dtSeconds, serialOutput: "", commands: [{ id: "servo", kind: "servo", targetAngleRadians: 0.6, pulseWidthUs: 1500, timeSeconds: dtSeconds }] }
    },
    step(dtSeconds: number, feedback: ArduinoFeedback = {}): ArduinoAdvanceResult {
      driver.steps += 1
      driver.feedback.push(feedback)
      return { timeSeconds: dtSeconds, mcuTimeSeconds: dtSeconds, serialOutput: "", commands: [{ id: "servo", kind: "servo", targetAngleRadians: 0.2, pulseWidthUs: 1000, timeSeconds: dtSeconds }] }
    },
  }
  return driver
}

describe("PhysicalSimulationCoordinator", () => {
  test("keeps Arduino and physics clocks in lockstep and uses previous sensor feedback", async () => {
    const runtime = await PhysicalRuntime.create(scene())
    const driver = fakeDriver()
    const coordinator = new PhysicalSimulationCoordinator(runtime, driver, scene())
    coordinator.start()
    const snapshot = coordinator.step()
    expect(snapshot.time).toBeCloseTo(runtime.timestep, 8)
    expect(driver.advances).toBe(1)
    expect(driver.steps).toBe(0)
    expect(driver.feedback).toHaveLength(1)
    coordinator.pause()
    const stepped = coordinator.singleStep()
    expect(stepped.time).toBeCloseTo(runtime.timestep * 2, 8)
    expect(driver.steps).toBe(1)
    expect(coordinator.reset().time).toBe(0)
    expect(driver.status).toBe("paused")
    coordinator.dispose()
  })

  test("maps persisted Uno pin sources to explicit adapter bindings", () => {
    const value = scene()
    value.actuators.servo.source = { pin: "D9" }
    value.actuators.stepper = {
      id: "stepper", name: "Stepper", jointId: "hinge", kind: "stepper", target: 0, kp: 1, kd: 0, maxForce: 1, speedLimit: 20,
      source: { pin: "2", directionPin: "3", enablePin: "4" },
    }
    const bindings = arduinoBindingsForScene(value)
    expect(bindings.actuators).toEqual([
      { id: "servo", kind: "servo", pin: 9 },
      { id: "stepper", kind: "stepper", stepPin: 2, directionPin: 3, enablePin: 4 },
    ])
  })
})
