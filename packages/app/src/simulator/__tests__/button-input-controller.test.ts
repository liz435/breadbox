import { describe, expect, test } from "bun:test"
import { getButtonInputDrive } from "../button-input-controller"

describe("button input controller", () => {
  test("drives an INPUT_PULLUP button low when pressed", () => {
    const drive = getButtonInputDrive(
      {
        inputPin: 7,
        hasGroundReference: true,
        hasPowerReference: false,
        hasSignalOnBothSides: false,
      },
      { mode: "INPUT_PULLUP" },
    )

    expect(drive).toEqual({
      inputPin: 7,
      canDrivePress: true,
      pressedValue: 0,
      releasedValue: 1,
    })
  })

  test("drives a floating INPUT button high only with a power reference", () => {
    const drive = getButtonInputDrive(
      {
        inputPin: 4,
        hasGroundReference: false,
        hasPowerReference: true,
        hasSignalOnBothSides: false,
      },
      { mode: "INPUT" },
    )

    expect(drive.canDrivePress).toBe(true)
    expect(drive.pressedValue).toBe(1)
    expect(drive.releasedValue).toBe(0)
  })

  test("does not electrically drive ambiguous or unconfigured buttons", () => {
    const ambiguous = getButtonInputDrive(
      {
        inputPin: 3,
        hasGroundReference: true,
        hasPowerReference: true,
        hasSignalOnBothSides: true,
      },
      { mode: "INPUT_PULLUP" },
    )
    const unconfigured = getButtonInputDrive(
      {
        inputPin: 3,
        hasGroundReference: true,
        hasPowerReference: false,
        hasSignalOnBothSides: false,
      },
      { mode: "UNSET" },
    )

    expect(ambiguous.canDrivePress).toBe(false)
    expect(unconfigured.canDrivePress).toBe(false)
  })
})
