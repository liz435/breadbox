import { describe, expect, test } from "bun:test"
import { ARDUINO_MODEL, shiftArduinoPoint } from "../arduino-placement"

describe("Arduino 3D placement", () => {
  test("nudges the Arduino left by about 2 cm", () => {
    expect(ARDUINO_MODEL.nudge).toEqual({ x: -20, z: 0 })
    expect(shiftArduinoPoint({ x: 10, z: 20 })).toEqual({ x: -10, z: 20 })
  })
})
