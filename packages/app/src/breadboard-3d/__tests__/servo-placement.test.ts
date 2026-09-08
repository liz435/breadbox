import { describe, expect, test } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { GLB_PARTS } from "../glb-parts"
import { getPinCalibration } from "../component-pin-calibration"
import { computePinFit } from "../part-frame"

describe("3D servo placement", () => {
  const component = {
    id: "servo-placement-test",
    type: "servo",
    name: "Servo",
    x: 0,
    y: 0,
    rotation: 0,
    pins: {},
    properties: {},
  } as unknown as BoardComponent

  test("faces the correct end of the pin row without reversing horn motion", () => {
    expect(GLB_PARTS.servo?.rotation).toEqual([0, Math.PI, 0])

    const calibration = getPinCalibration("servo")
    expect(calibration?.pins.map((pin) => pin.z)).toEqual([-43.3, -40.8, -38.3])
    const fit = computePinFit(component, calibration)
    expect(fit).not.toBeNull()
    expect(fit?.rotation).toBeCloseTo(0)
  })
})
