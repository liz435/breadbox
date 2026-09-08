import { describe, expect, test } from "bun:test"
import { createEmptyPhysicalScene, type PhysicalScene } from "@dreamer/schemas"
import { runPhysicalTestCase } from "../testing"

function scene(): PhysicalScene {
  const empty = createEmptyPhysicalScene()
  return {
    ...empty,
    bodies: {
      floor: {
        id: "floor", name: "Floor", kind: "fixed", position: [0, 0, 0], rotation: [0, 0, 0], mass: 1,
        colliders: [{ shape: "box", size: [500, 20, 500], offset: [0, -10, 0], rotation: [0, 0, 0], friction: 0.5, restitution: 0 }],
      },
      block: {
        id: "block", name: "Block", kind: "dynamic", position: [0, 300, 0], rotation: [0, 0, 0], mass: 0.2,
        colliders: [{ shape: "box", size: [40, 40, 40], offset: [0, 0, 0], rotation: [0, 0, 0], friction: 0.5, restitution: 0 }],
      },
    },
  }
}

describe("physical test runner", () => {
  test("runs deterministic cases and evaluates body-position assertions", async () => {
    const value = scene()
    const result = await runPhysicalTestCase(value, {
      id: "drop", name: "Drop", duration: 1 / 120, inputs: [],
      assertions: [{ kind: "body-position", bodyId: "block", expected: [0, 300, 0], tolerance: 1 }],
    })
    expect(result.final.time).toBeCloseTo(1 / 120, 8)
    expect(result.assertions[0]?.passed).toBe(true)
    expect(result.passed).toBe(true)
  })
})
