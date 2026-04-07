// ── Arduino Standard Library (injectable globals for transpiled sketches) ───

/** Virtual I2C device that can be registered on the bus. */
export type I2CDevice = {
  address: number
  onWrite: (data: number[]) => void
  onRead: (count: number) => number[]
}

export type StdlibCallbacks = {
  onPinWrite: (pin: number, value: number, isPwm: boolean) => void
  onPinMode: (pin: number, mode: number) => void
  onSerialPrint: (text: string) => void
  onTone: (pin: number, frequency: number, duration?: number) => void
  onNoTone: (pin: number) => void
}

export type StdlibState = {
  pins: number[] // 20 pins, digital values
  prevPins: number[] // previous digital values (for edge detection)
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
  eeprom: Uint8Array // 1KB EEPROM
  i2cBus: Map<number, I2CDevice> // address → device
  toneOscillators: Map<number, { stop: () => void }> // pin → active oscillator
}

export function createStdlibState(startTime: number): StdlibState {
  return {
    pins: new Array(20).fill(0),
    prevPins: new Array(20).fill(0),
    pinModes: new Array(20).fill(0),
    analogValues: new Array(20).fill(0),
    pwmValues: new Array(20).fill(0),
    serialBuffer: [],
    startTime,
    servos: new Map(),
    lcd: null,
    delayUntil: 0,
    serialBaud: 0,
    eeprom: new Uint8Array(1024),
    i2cBus: new Map(),
    toneOscillators: new Map(),
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

  const interrupts: Map<number, { pin: number; mode: number; callback: () => void }> =
    new Map()

  function attachInterrupt(
    interruptNum: number,
    callback: () => void,
    mode: number,
  ): void {
    const pin = interruptNum === 0 ? 2 : interruptNum === 1 ? 3 : -1
    interrupts.set(interruptNum, { pin, mode, callback })
  }

  function detachInterrupt(interruptNum: number): void {
    interrupts.delete(interruptNum)
  }

  function digitalPinToInterrupt(pin: number): number {
    if (pin === 2) return 0
    if (pin === 3) return 1
    return -1
  }

  /** Check interrupt edges — called by VM after external pin updates. */
  function checkInterrupts(): void {
    for (const [, entry] of interrupts) {
      if (entry.pin < 0 || entry.pin > 19) continue
      const prev = state.prevPins[entry.pin]
      const curr = state.pins[entry.pin]
      if (prev === curr) continue
      const shouldFire =
        (entry.mode === 1 /* RISING */ && prev === 0 && curr === 1) ||
        (entry.mode === 2 /* FALLING */ && prev === 1 && curr === 0) ||
        (entry.mode === 3 /* CHANGE */)
      if (shouldFire) {
        try { entry.callback() } catch { /* ISR errors silenced */ }
      }
    }
    for (let i = 0; i < 20; i++) state.prevPins[i] = state.pins[i]
  }

  // ── pulseIn ─────────────────────────────────────────────────────

  function pulseIn(pin: number, _value: number, _timeout?: number): number {
    if (pin < 0 || pin > 19) return 0
    // Simulated: analogValues can encode distance (cm) for ultrasonic sensors
    const distance = state.analogValues[pin] || 50
    return distance * 58 // 58 µs per cm round-trip
  }

  // ── EEPROM ──────────────────────────────────────────────────────

  const EEPROM = {
    read(addr: number): number {
      if (addr < 0 || addr >= 1024) return 0
      return state.eeprom[addr]
    },
    write(addr: number, val: number): void {
      if (addr < 0 || addr >= 1024) return
      state.eeprom[addr] = val & 0xff
    },
    update(addr: number, val: number): void {
      if (addr < 0 || addr >= 1024) return
      if (state.eeprom[addr] !== (val & 0xff)) state.eeprom[addr] = val & 0xff
    },
    length(): number { return 1024 },
    get(addr: number): number { return this.read(addr) },
    put(addr: number, val: number): void { this.write(addr, val) },
  }

  // ── Wire (I2C) ─────────────────────────────────────────────────

  let wireAddress = 0
  let wireTxBuf: number[] = []
  let wireRxBuf: number[] = []

  const Wire = {
    begin(addr?: number): void {
      if (addr !== undefined) wireAddress = addr
    },
    beginTransmission(addr: number): void {
      wireAddress = addr
      wireTxBuf = []
    },
    write(data: number | number[]): number {
      if (Array.isArray(data)) {
        wireTxBuf.push(...data)
        return data.length
      }
      wireTxBuf.push(data & 0xff)
      return 1
    },
    endTransmission(_stop?: boolean): number {
      const device = state.i2cBus.get(wireAddress)
      if (!device) return 2 // NACK on address
      device.onWrite(wireTxBuf)
      wireTxBuf = []
      return 0 // success
    },
    requestFrom(addr: number, count: number): number {
      const device = state.i2cBus.get(addr)
      if (!device) { wireRxBuf = []; return 0 }
      wireRxBuf = device.onRead(count)
      return wireRxBuf.length
    },
    available(): number { return wireRxBuf.length },
    read(): number {
      return wireRxBuf.shift() ?? -1
    },
  }

  // ── SPI ─────────────────────────────────────────────────────────

  let spiSettings = { bitOrder: 1, clockDiv: 4, dataMode: 0 }

  const SPI = {
    begin(): void { /* SS pin config — no-op in simulation */ },
    end(): void { /* no-op */ },
    setBitOrder(order: number): void { spiSettings.bitOrder = order },
    setClockDivider(div: number): void { spiSettings.clockDiv = div },
    setDataMode(mode: number): void { spiSettings.dataMode = mode },
    transfer(data: number): number {
      // In simulation, SPI transfer returns the sent byte (loopback)
      return data & 0xff
    },
    beginTransaction(_settings: unknown): void { /* no-op */ },
    endTransaction(): void { /* no-op */ },
  }

  // ── Stepper ─────────────────────────────────────────────────────

  class StepperClass {
    private stepsPerRev: number
    private pins: number[]
    private speed: number
    private position: number

    constructor(stepsPerRev: number, ...pins: number[]) {
      this.stepsPerRev = stepsPerRev
      this.pins = pins
      this.speed = 0
      this.position = 0
    }

    setSpeed(rpm: number): void {
      this.speed = rpm
    }

    step(steps: number): void {
      this.position += steps
      // In simulation, energize pins in sequence to indicate movement
      if (this.pins.length >= 2 && this.speed > 0) {
        const dir = steps > 0 ? 1 : 0
        for (const p of this.pins) {
          if (p >= 0 && p <= 19) {
            state.pins[p] = dir
            callbacks.onPinWrite(p, dir, false)
          }
        }
      }
    }
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
    ) {}

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

  // ── shiftOut / shiftIn ──────────────────────────────────────────

  function shiftOut(dataPin: number, clockPin: number, bitOrder: number, value: number): void {
    for (let i = 0; i < 8; i++) {
      const bit = bitOrder === 1 /* MSBFIRST */
        ? (value >> (7 - i)) & 1
        : (value >> i) & 1
      digitalWrite(dataPin, bit)
      digitalWrite(clockPin, 1)
      digitalWrite(clockPin, 0)
    }
  }

  function shiftIn(dataPin: number, clockPin: number, bitOrder: number): number {
    let value = 0
    for (let i = 0; i < 8; i++) {
      digitalWrite(clockPin, 1)
      const bit = digitalRead(dataPin)
      if (bitOrder === 1 /* MSBFIRST */) {
        value |= bit << (7 - i)
      } else {
        value |= bit << i
      }
      digitalWrite(clockPin, 0)
    }
    return value
  }

  // ── Return all globals ───────────────────────────────────────────

  return {
    // Pin I/O
    pinMode,
    digitalWrite,
    digitalRead,
    analogWrite,
    analogRead,
    pulseIn,
    shiftOut,
    shiftIn,

    // Timing
    delay,
    delayMicroseconds,
    millis,
    micros,

    // Serial
    Serial,

    // Math
    map: arduinoMap,
    constrain,
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    pow: Math.pow,
    sqrt: Math.sqrt,
    random: arduinoRandom,
    randomSeed: () => { /* no-op */ },

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
    Stepper: StepperClass,

    // Library objects
    EEPROM,
    Wire,
    SPI,

    // Internal (used by VM, not by user sketches)
    __checkInterrupts: checkInterrupts,

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
    MSBFIRST: 1,
    LSBFIRST: 0,

    // Interrupt modes
    RISING: 1,
    FALLING: 2,
    CHANGE: 3,
  }
}
