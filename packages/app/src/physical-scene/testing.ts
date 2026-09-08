import { physicalSceneSchema, physicalTestCaseSchema } from "@dreamer/schemas"
import type { PhysicalScene, PhysicalTestCase } from "@dreamer/schemas"
import { PhysicalRuntime, runPhysicalInputs, type PhysicalSnapshot } from "./runtime"

export type PhysicalAssertionResult = {
  kind: PhysicalTestCase["assertions"][number]["kind"]
  targetId: string
  expected: number | readonly [number, number, number]
  actual: number | readonly [number, number, number] | null
  tolerance: number
  passed: boolean
}

export type PhysicalTestResult = {
  testCaseId: string
  passed: boolean
  final: PhysicalSnapshot
  assertions: PhysicalAssertionResult[]
}

/** Run a persisted test case without React, WebGL, wall-clock time, or MCU state. */
export async function runPhysicalTestCase(scene: PhysicalScene, testCase: PhysicalTestCase): Promise<PhysicalTestResult> {
  const initial = physicalSceneSchema.parse(scene)
  const definition = physicalTestCaseSchema.parse(testCase)
  const runtime = await PhysicalRuntime.create(initial)
  try {
    const snapshots = runPhysicalInputs(runtime, definition.duration, definition.inputs.map((input) => ({
      time: input.time,
      actuatorId: input.actuatorId,
      target: input.target,
    })))
    const final = snapshots.at(-1) ?? runtime.snapshot()
    const assertions = definition.assertions.map((assertion): PhysicalAssertionResult => {
      if (assertion.kind === "joint-position") {
        const actual = final.joints[assertion.jointId]?.position ?? null
        return { kind: assertion.kind, targetId: assertion.jointId, expected: assertion.expected, actual, tolerance: assertion.tolerance,
          passed: actual !== null && Math.abs(actual - assertion.expected) <= assertion.tolerance }
      }
      if (assertion.kind === "sensor-value") {
        const sensor = initial.sensors[assertion.sensorId]
        const value = final.sensors[assertion.sensorId]
        const actual = sensor?.kind === "contact" ? (value?.active ? 1 : 0) : (value?.distanceMm ?? null)
        return { kind: assertion.kind, targetId: assertion.sensorId, expected: assertion.expected, actual, tolerance: assertion.tolerance,
          passed: actual !== null && Math.abs(actual - assertion.expected) <= assertion.tolerance }
      }
      const actual = final.bodies[assertion.bodyId]?.position
      const expected = assertion.expected
      const distance = actual
        ? Math.hypot(actual.x - expected[0], actual.y - expected[1], actual.z - expected[2])
        : Infinity
      return { kind: assertion.kind, targetId: assertion.bodyId, expected, actual: actual ? [actual.x, actual.y, actual.z] : null,
        tolerance: assertion.tolerance, passed: distance <= assertion.tolerance }
    })
    return { testCaseId: definition.id, passed: assertions.every((assertion) => assertion.passed), final, assertions }
  } finally {
    runtime.dispose()
  }
}
