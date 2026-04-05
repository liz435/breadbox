// ── Arduino Standard Library (injectable globals for transpiled sketches) ───

export type StdlibCallbacks = {
  onPinWrite: (pin: number, value: number, isPwm: boolean) => void
  onPinMode: (pin: number, mode: number) => void
  onSerialPrint: (text: string) => void
  onTone: (pin: number, frequency: number, duration?: number) => void
  onNoTone: (pin: number) => void
}

export type StdlibState = {
  pins: number[] // 20 pins, digital values
  pinModes: number[] // 20 pins, modes (0=INPUT, 1=OUTPUT, 2=INPUT_PULLUP)
  analogValues: number[] // 20 pins, analog input values (0-1023)
  pwmValues: number[] // 20 pins, PWM output values (0-255)
  serialBuffer: string[] // incoming serial data
  startTime: number // simulation start timestamp
  servos: Map<string, { pin: number; angle: number }>
  lcd: {
    cols: number
    rows: number
    cursorCol: number
    cursorRow: number
    buffer: string[]
  } | null
  delayUntil: number // set by delay(), checked by VM
  serialBaud: number
}

export function createStdlibState(startTime: number): StdlibState {
  return {
    pins: new Array(20).fill(0),
    pinModes: new Array(20).fill(0),
    analogValues: new Array(20).fill(0),
    pwmValues: new Array(20).fill(0),
    serialBuffer: [],
    startTime,
    servos: new Map(),
    lcd: null,
    delayUntil: 0,
    serialBaud: 0,
  }
}

/**
 * Create the full set of Arduino globals that get injected into the
 * transpiled sketch's execution scope.
 */
export function createStdlib(
  state: StdlibState,
  callbacks: StdlibCallbacks,
  getMillis: () => number,
): Record<string, unknown> {
  // ── Pin I/O ──────────────────────────────────────────────────────

  function pinMode(pin: number, mode: number): void {
    if (pin < 0 || pin > 19) return
    state.pinModes[pin] = mode
    callbacks.onPinMode(pin, mode)
  }

  function digitalWrite(pin: number, value: number): void {
    if (pin < 0 || pin > 19) return
    state.pins[pin] = value ? 1 : 0
    state.pwmValues[pin] = 0
    callbacks.onPinWrite(pin, state.pins[pin], false)
  }

  function digitalRead(pin: number): number {
    if (pin < 0 || pin > 19) return 0
    return state.pins[pin]
  }

  function analogWrite(pin: number, value: number): void {
    if (pin < 0 || pin > 19) return
    const clamped = Math.max(0, Math.min(255, Math.round(value)))
    state.pwmValues[pin] = clamped
    state.pins[pin] = clamped > 0 ? 1 : 0
    callbacks.onPinWrite(pin, clamped, true)
  }

  function analogRead(pin: number): number {
    if (pin < 0 || pin > 19) return 0
    return state.analogValues[pin]
  }

  // ── Timing ───────────────────────────────────────────────────────

  function delay(ms: number): void {
    state.delayUntil = getMillis() + ms
  }

  function delayMicroseconds(_us: number): void {
    // In simulation, microsecond delays are effectively instant
  }

  function millis(): number {
    return getMillis()
  }

  function micros(): number {
    return getMillis() * 1000
  }

  // ── Serial ───────────────────────────────────────────────────────

  const Serial = {
    begin(baud: number): void {
      state.serialBaud = baud
    },
    print(value: unknown): void {
      callbacks.onSerialPrint(String(value))
    },
    println(value: unknown = ""): void {
      callbacks.onSerialPrint(String(value) + "\n")
    },
    available(): number {
      return state.serialBuffer.length
    },
    read(): number {
      const ch = state.serialBuffer.shift()
      return ch !== undefined ? ch.charCodeAt(0) : -1
    },
    write(value: number | string): void {
      callbacks.onSerialPrint(
        typeof value === "number" ? String.fromCharCode(value) : value,
      )
    },
  }

  // ── Math helpers ─────────────────────────────────────────────────

  function arduinoMap(
    value: number,
    fromLow: number,
    fromHigh: number,
    toLow: number,
    toHigh: number,
  ): number {
    return ((value - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow) + toLow
  }

  function constrain(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, value))
  }

  function arduinoRandom(minOrMax: number, max?: number): number {
    if (max === undefined) {
      return Math.floor(Math.random() * minOrMax)
    }
    return Math.floor(Math.random() * (max - minOrMax)) + minOrMax
  }

  // ── Tone ─────────────────────────────────────────────────────────

  function tone(pin: number, frequency: number, duration?: number): void {
    callbacks.onTone(pin, frequency, duration)
  }

  function noTone(pin: number): void {
    callbacks.onNoTone(pin)
  }

  // ── Interrupts ───────────────────────────────────────────────────

  const interrupts: Map<number, { mode: number; callback: () => void }> =
    new Map()

  function attachInterrupt(
    interruptNum: number,
    callback: () => void,
    mode: number,
  ): void {
    interrupts.set(interruptNum, { mode, callback })
  }

  function detachInterrupt(interruptNum: number): void {
    interrupts.delete(interruptNum)
  }

  function digitalPinToInterrupt(pin: number): number {
    // Arduino Uno: pin 2 → interrupt 0, pin 3 → interrupt 1
    if (pin === 2) return 0
    if (pin === 3) return 1
    return -1
  }

  // ── Servo class ──────────────────────────────────────────────────

  let servoCounter = 0

  class ServoClass {
    private id: string
    private attachedPin: number
    private currentAngle: number

    constructor() {
      this.id = `servo_${servoCounter++}`
      this.attachedPin = -1
      this.currentAngle = 0
    }

    attach(pin: number): void {
      this.attachedPin = pin
      state.servos.set(this.id, { pin, angle: this.currentAngle })
    }

    write(angle: number): void {
      this.currentAngle = Math.max(0, Math.min(180, angle))
      if (this.attachedPin >= 0) {
        state.servos.set(this.id, {
          pin: this.attachedPin,
          angle: this.currentAngle,
        })
      }
    }

    read(): number {
      return this.currentAngle
    }

    attached(): boolean {
      return this.attachedPin >= 0
    }

    detach(): void {
      state.servos.delete(this.id)
      this.attachedPin = -1
    }
  }

  // ── LiquidCrystal class ──────────────────────────────────────────

  class LiquidCrystalClass {
    constructor(
      _rs: number,
      _enable: number,
      _d4: number,
      _d5: number,
      _d6: number,
      _d7: number,
    ) {
      // Pin assignments are noted but not electrically simulated
    }

    begin(cols: number, rows: number): void {
      state.lcd = {
        cols,
        rows,
        cursorCol: 0,
        cursorRow: 0,
        buffer: Array.from({ length: rows }, () => " ".repeat(cols)),
      }
    }

    setCursor(col: number, row: number): void {
      if (!state.lcd) return
      state.lcd.cursorCol = col
      state.lcd.cursorRow = row
    }

    print(text: unknown): void {
      if (!state.lcd) return
      const str = String(text)
      const row = state.lcd.cursorRow
      const col = state.lcd.cursorCol
      if (row < 0 || row >= state.lcd.rows) return
      const currentRow = state.lcd.buffer[row]
      const before = currentRow.slice(0, col)
      const after = currentRow.slice(col + str.length)
      state.lcd.buffer[row] = (before + str + after).slice(0, state.lcd.cols)
      state.lcd.cursorCol = Math.min(col + str.length, state.lcd.cols)
    }

    clear(): void {
      if (!state.lcd) return
      state.lcd.buffer = Array.from({ length: state.lcd.rows }, () =>
        " ".repeat(state.lcd!.cols),
      )
      state.lcd.cursorCol = 0
      state.lcd.cursorRow = 0
    }
  }

  // ── Return all globals ───────────────────────────────────────────

  return {
    // Pin I/O
    pinMode,
    digitalWrite,
    digitalRead,
    analogWrite,
    analogRead,

    // Timing
    delay,
    delayMicroseconds,
    millis,
    micros,

    // Serial
    Serial,

    // Math (note: `map` is renamed to avoid conflict with Array.map)
    map: arduinoMap,
    constrain,
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    pow: Math.pow,
    sqrt: Math.sqrt,
    random: arduinoRandom,
    randomSeed: () => {
      /* no-op in simulation */
    },

    // Tone
    tone,
    noTone,

    // Interrupts
    attachInterrupt,
    detachInterrupt,
    digitalPinToInterrupt,

    // Library classes
    Servo: ServoClass,
    LiquidCrystal: LiquidCrystalClass,

    // Constants
    HIGH: 1,
    LOW: 0,
    INPUT: 0,
    OUTPUT: 1,
    INPUT_PULLUP: 2,
    LED_BUILTIN: 13,
    A0: 14,
    A1: 15,
    A2: 16,
    A3: 17,
    A4: 18,
    A5: 19,

    // Interrupt modes
    RISING: 1,
    FALLING: 2,
    CHANGE: 3,
  }
}
