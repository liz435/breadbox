// ── Component Behavior ─────────────────────────────────────────────────────
//
// Pure functions that map pin states and library state to visual behavior
// values. These bridge the VM output to the rendering layer.

import type { BoardComponent, PinState, LibraryState } from "@dreamer/schemas"

/**
 * Get the brightness of an LED component (0–1) based on its connected pin state.
 *
 * - Digital HIGH → 1
 * - PWM value → mapped from 0–255 to 0–1
 * - Otherwise → 0
 */
export function getLedBrightness(
  component: BoardComponent,
  pinStates: PinState[],
): number {
  const anodePin = component.pins["anode"]
  if (anodePin === null || anodePin === undefined) return 0

  const pin = pinStates[anodePin]
  if (!pin) return 0

  if (pin.isPwm) {
    return pin.pwmValue / 255
  }

  return pin.digitalValue
}

/**
 * Get the current angle of a servo component (0–180) from library state.
 */
export function getServoAngle(
  component: BoardComponent,
  libraryState: LibraryState,
): number {
  const signalPin = component.pins["signal"]
  if (signalPin === null || signalPin === undefined) return 0

  // Search for a servo attached to this pin
  for (const servo of Object.values(libraryState.servos)) {
    if (servo.pin === signalPin) {
      return servo.angle
    }
  }

  return 0
}

/**
 * Get the text buffer rows from the LCD library state, or null if no LCD is active.
 */
export function getLcdText(libraryState: LibraryState): string[] | null {
  if (!libraryState.lcd) return null
  return [...libraryState.lcd.textBuffer]
}

/**
 * Get the full LCD display state for rendering (backlight, cursor, CGRAM, etc.).
 */
export function getLcdDisplayState(libraryState: LibraryState) {
  if (!libraryState.lcd) return null
  const lcd = libraryState.lcd
  return {
    textBuffer: [...lcd.textBuffer],
    cols: lcd.cols,
    rows: lcd.rows,
    cursorCol: lcd.cursorCol,
    cursorRow: lcd.cursorRow,
    backlight: lcd.backlight,
    displayOn: lcd.displayOn,
    cursorVisible: lcd.cursorVisible,
    cursorBlink: lcd.cursorBlink,
    scrollOffset: lcd.scrollOffset,
    cgram: lcd.cgram,
  }
}
