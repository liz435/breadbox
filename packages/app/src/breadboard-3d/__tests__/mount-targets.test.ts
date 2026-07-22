import { describe, expect, test } from "bun:test"
import { movingMountOptions } from "../mount-targets"

describe("movingMountOptions", () => {
  // The reported bug: a stepper registers its rotating output as an angle node
  // but the mount picker never offered it, so no body could ride the shaft.
  test("offers the stepper's rotating shaft when it has an angle node", () => {
    expect(movingMountOptions("stepper_motor", { angle: true, spin: false })).toEqual([
      { node: "angle", label: "shaft (rotates)" },
    ])
  })

  test("labels the servo horn and the DC-motor shaft by type", () => {
    expect(movingMountOptions("servo", { angle: true, spin: false })).toEqual([
      { node: "angle", label: "horn (moves)" },
    ])
    expect(movingMountOptions("dc_motor", { angle: false, spin: true })).toEqual([
      { node: "spin", label: "shaft (spins)" },
    ])
  })

  test("falls back to generic labels for any other animated part", () => {
    expect(movingMountOptions("custom:turntable", { angle: true, spin: true })).toEqual([
      { node: "angle", label: "moving part" },
      { node: "spin", label: "spinning shaft" },
    ])
  })

  test("offers nothing for a part with no moving nodes", () => {
    expect(movingMountOptions("led", { angle: false, spin: false })).toEqual([])
  })
})
