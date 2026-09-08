import { describe, expect, test } from "bun:test"
import { createEmptyPhysicalScene, type PhysicalScene } from "@dreamer/schemas"
import { PhysicalRuntime } from "../runtime"

function dropScene(): PhysicalScene {
  const empty = createEmptyPhysicalScene()
  return {
    ...empty,
    bodies: {
      floor: {
        id: "floor",
        name: "Floor",
        kind: "fixed",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        mass: 1,
        colliders: [{
          shape: "box",
          size: [1000, 20, 1000],
          offset: [0, -10, 0],
          rotation: [0, 0, 0],
          friction: 0.7,
          restitution: 0,
        }],
      },
      block: {
        id: "block",
        name: "Block",
        kind: "dynamic",
        position: [0, 300, 0],
        rotation: [0, 0, 0],
        mass: 0.2,
        colliders: [{
          shape: "box",
          size: [40, 40, 40],
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          friction: 0.5,
          restitution: 0,
        }],
      },
      probe: {
        id: "probe",
        name: "Probe",
        kind: "fixed",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        mass: 1,
        colliders: [{
          shape: "box",
          size: [10, 10, 10],
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          friction: 0,
          restitution: 0,
        }],
      },
    },
    sensors: {
      distance: {
        id: "distance",
        name: "Distance",
        kind: "distance",
        bodyId: "probe",
        origin: [0, 0, 0],
        direction: [0, 1, 0],
        range: 500,
      },
    },
  }
}

function actuatedScene(): PhysicalScene {
  const scene = dropScene()
  return {
    ...scene,
    bodies: {
      ...scene.bodies,
      arm: {
        id: "arm",
        name: "Servo arm",
        kind: "dynamic",
        position: [0, 60, 0],
        rotation: [0, 0, 0],
        mass: 0.12,
        colliders: [{
          shape: "box",
          size: [18, 120, 18],
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          friction: 0.55,
          restitution: 0,
        }],
      },
    },
    joints: {
      hinge: {
        id: "hinge",
        name: "Hinge",
        kind: "revolute",
        bodyA: "floor",
        bodyB: "arm",
        anchorA: [0, 0, 0],
        anchorB: [0, -60, 0],
        axis: [0, 1, 0],
        limits: { min: -1.2, max: 1.2 },
      },
    },
    actuators: {
      servo: {
        id: "servo",
        name: "Servo",
        jointId: "hinge",
        kind: "servo",
        target: 0.7,
        kp: 8,
        kd: 1.2,
        maxForce: 0.8,
        speedLimit: 2.5,
      },
    },
  }
}

describe("PhysicalRuntime", () => {
  test("uses fixed SI steps, collides, measures sensors, and resets", async () => {
    const runtime = await PhysicalRuntime.create(dropScene())
    const initial = runtime.snapshot()
    expect(initial.time).toBe(0)
    expect(initial.bodies.block.position.y).toBeCloseTo(300, 4)

    for (let index = 0; index < 240; index += 1) runtime.step()

    const settled = runtime.snapshot()
    expect(settled.time).toBeCloseTo(2, 8)
    expect(settled.bodies.block.position.y).toBeGreaterThan(15)
    expect(settled.bodies.block.position.y).toBeLessThan(40)
    expect(settled.sensors.distance.distanceMm).not.toBeNull()

    runtime.reset()
    const reset = runtime.snapshot()
    expect(reset.time).toBe(0)
    expect(reset.bodies.block.position.y).toBeCloseTo(300, 4)
    runtime.dispose()
  })

  test("rejects an invalid command without advancing the world", async () => {
    const runtime = await PhysicalRuntime.create(dropScene())
    expect(() => runtime.step([{ actuatorId: "missing", target: 1 }])).toThrow("Unknown physical actuator")
    expect(runtime.snapshot().time).toBe(0)
    runtime.dispose()
  })

  test("drives a revolute joint with bounded effort", async () => {
    const runtime = await PhysicalRuntime.create(actuatedScene())
    const initial = runtime.snapshot()
    for (let index = 0; index < 240; index += 1) {
      runtime.step([{ actuatorId: "servo", target: 0.7 }])
    }
    const final = runtime.snapshot()
    expect(final.joints.hinge.position).toBeGreaterThan(initial.joints.hinge.position + 0.05)
    expect(Math.abs(final.actuators.servo.effort)).toBeLessThanOrEqual(0.8)
    runtime.dispose()
  })
})
