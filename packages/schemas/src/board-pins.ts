import { MAX_ARDUINO_PIN } from "./arduino";
import { DEFAULT_BOARD_TARGET, type BoardTarget } from "./board-targets";

const BOARD_ANALOG_PIN_NUMBERS: Record<BoardTarget, readonly number[]> = {
  arduino_uno: [14, 15, 16, 17, 18, 19],
  arduino_nano: [14, 15, 16, 17, 18, 19, 20, 21],
  arduino_mega_2560: Array.from({ length: 16 }, (_, i) => 54 + i),
  // Pico exposes three ADCs on GP26/27/28 (ADC0/1/2). GP29 maps to the
  // internal VSYS divider and is typically unavailable to user sketches.
  rpi_pico: [26, 27, 28],
};

const POWER_PIN_LABELS: Record<number, string> = {
  [-1]: "5V",
  [-12]: "5V2", // second usable 5V (Uno corner socket)
  [-2]: "3V3",
  [-3]: "GND",
  [-4]: "GND",
  [-5]: "VIN",
  [-6]: "GND",
  [-7]: "AREF",
  [-8]: "IOREF",
  [-9]: "RESET",
};

export function getBoardAnalogPins(boardTarget: BoardTarget = DEFAULT_BOARD_TARGET): readonly number[] {
  return BOARD_ANALOG_PIN_NUMBERS[boardTarget] ?? BOARD_ANALOG_PIN_NUMBERS[DEFAULT_BOARD_TARGET];
}

export function getArduinoPinFromAnalogIndex(
  analogIndex: number,
  boardTarget: BoardTarget = DEFAULT_BOARD_TARGET,
): number | null {
  if (!Number.isInteger(analogIndex) || analogIndex < 0) return null;
  const pins = getBoardAnalogPins(boardTarget);
  return pins[analogIndex] ?? null;
}

export function parseArduinoPinToken(
  token: string,
  boardTarget: BoardTarget = DEFAULT_BOARD_TARGET,
): number | null {
  const raw = token.trim();
  const analogMatch = raw.match(/^A(\d{1,2})$/i);
  if (analogMatch) {
    return getArduinoPinFromAnalogIndex(parseInt(analogMatch[1], 10), boardTarget);
  }

  const digitalMatch = raw.match(/^D(\d{1,2})$/i);
  if (digitalMatch) {
    const pin = parseInt(digitalMatch[1], 10);
    return isArduinoSignalPin(pin) ? pin : null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

export function isArduinoSignalPin(pin: number): boolean {
  return Number.isInteger(pin) && pin >= 0 && pin <= MAX_ARDUINO_PIN;
}

// PWM-capable output pins per board, matching each board's silkscreen (~) marks.
const BOARD_PWM_PINS: Record<BoardTarget, readonly number[]> = {
  arduino_uno: [3, 5, 6, 9, 10, 11],
  arduino_nano: [3, 5, 6, 9, 10, 11],
  arduino_mega_2560: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46],
  // RP2040: every GPIO is backed by one of eight PWM slices.
  rpi_pico: Array.from({ length: 30 }, (_, i) => i),
};

/**
 * Whether a digital pin can output a hardware PWM (analogWrite / Servo) signal
 * on the given board — the pins the physical board marks with a `~`.
 */
export function isPwmCapablePin(
  pin: number,
  boardTarget: BoardTarget = DEFAULT_BOARD_TARGET,
): boolean {
  const pins = BOARD_PWM_PINS[boardTarget] ?? BOARD_PWM_PINS[DEFAULT_BOARD_TARGET];
  return pins.includes(pin);
}

export function formatArduinoPin(
  pin: number,
  boardTarget: BoardTarget = DEFAULT_BOARD_TARGET,
): string {
  const powerLabel = POWER_PIN_LABELS[pin];
  if (powerLabel != null) return powerLabel;
  if (!isArduinoSignalPin(pin)) return `pin ${pin}`;

  const analogPins = getBoardAnalogPins(boardTarget);
  const analogIndex = analogPins.indexOf(pin);
  if (analogIndex >= 0) return `A${analogIndex}`;
  return `D${pin}`;
}
