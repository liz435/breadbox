import { useCallback, useMemo } from "react"
import type { BoardComponent, PinState } from "@dreamer/schemas"
import { analyzeButtonWiring, type ButtonWiringAnalysis } from "@/breadboard/component-pin-resolver"
import { useBoardSelector } from "@/store/board-context"
import { buttonPressStore } from "./button-press-store"
import { writeWithContactBounce } from "./contact-bounce"
import { pinStateStore } from "./pin-state-store"
import { simulationRef } from "./simulation-ref"
import { isStrictHardwareEnabled } from "./strict-hardware-flag"
import { usePinState } from "./use-pin-state"

export type ButtonInputDrive = {
  inputPin: number | null
  canDrivePress: boolean
  pressedValue: 0 | 1
  releasedValue: 0 | 1
}

/**
 * Decide whether a button has a real Arduino input to drive, and which level
 * represents pressed/released for that input mode. Kept pure so the electrical
 * contract can be tested without rendering either the 2D or 3D button.
 */
export function getButtonInputDrive(
  wiring: ButtonWiringAnalysis,
  inputPinState: Pick<PinState, "mode"> | null,
): ButtonInputDrive {
  const { inputPin } = wiring
  const isPullup = inputPinState?.mode === "INPUT_PULLUP"
  const pressedValue: 0 | 1 = isPullup ? 0 : 1
  const releasedValue: 0 | 1 = isPullup ? 1 : 0
  const canDrivePress =
    inputPin != null &&
    !wiring.hasSignalOnBothSides &&
    ((isPullup && wiring.hasGroundReference) ||
      (!isPullup && inputPinState?.mode === "INPUT" && wiring.hasPowerReference))

  return { inputPin, canDrivePress, pressedValue, releasedValue }
}

function driveButtonInput(pin: number, value: 0 | 1): void {
  const runner = simulationRef.current?.runner ?? null
  if (isStrictHardwareEnabled() && runner) {
    writeWithContactBounce(pin, value, {
      bus: runner.getPeripheralBus(),
      nowSimMs: runner.getMillis(),
      writeNow: (p, v) => pinStateStore.writeExternal(p, { digitalValue: v }),
    })
    return
  }
  pinStateStore.writeExternal(pin, { digitalValue: value })
}

/**
 * Shared electrical behavior for the 2D SVG button and the interactive 3D
 * button. Both views therefore use the same wire analysis, INPUT mode rules,
 * external pin injection, and strict-hardware contact bounce.
 */
export function useButtonInputController(component: BoardComponent): {
  press: () => void
  release: () => void
} {
  const wires = useBoardSelector((state) => state.wires)
  const wiring = useMemo(
    () => analyzeButtonWiring(component, wires),
    [component, wires],
  )
  const inputPinState = usePinState(wiring.inputPin ?? -1)
  const drive = getButtonInputDrive(wiring, inputPinState)

  const press = useCallback(() => {
    buttonPressStore.press(component.id)
    if (drive.canDrivePress && drive.inputPin != null) {
      driveButtonInput(drive.inputPin, drive.pressedValue)
    }
  }, [component.id, drive.canDrivePress, drive.inputPin, drive.pressedValue])

  const release = useCallback(() => {
    buttonPressStore.release(component.id)
    // Restore the released state whenever this button has a resolved input.
    // This also clears a stale external value if wiring changed while held.
    if (drive.inputPin != null) {
      driveButtonInput(drive.inputPin, drive.releasedValue)
    }
  }, [component.id, drive.inputPin, drive.releasedValue])

  return { press, release }
}
