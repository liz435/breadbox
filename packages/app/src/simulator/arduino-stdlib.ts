// ── Arduino Standard Library (injectable globals for transpiled sketches) ───

import type { PinStateStore } from "./pin-state-store"
import {
  DEFAULT_BOARD_TARGET,
  MAX_ARDUINO_PIN,
  getBoardAnalogPins,
  type BoardTarget,
  type PinMode,
} from "@dreamer/schemas"
import { ultrasonicDistanceBus, ultrasonicTriggerPinBus, dhtSensorBus, irReceiverBus } from "./sensor-inputs"

/** Virtual I2C device that can be registered on the bus. */
export type I2CDevice = {
  address: number
  onWrite: (data: number[]) => void
  onRead: (count: number) => number[]
}

export type StdlibCallbacks = {
  onSerialPrint: (text: string) => void
  onTone: (pin: number, frequency: number, duration?: number) => void
  onNoTone: (pin: number) => void
}

/**
 * Non-pin runtime state. Pin values live in the PinStateStore.
 * This struct keeps everything else (serial buffers, LCD state, servos, etc.)
 * that's private to the VM and not part of the cross-component pin state model.
 */
export type StdlibState = {
  serialBuffer: string[] // incoming serial data
  startTime: number // simulation start timestamp
  servos: Map<string, { pin: number; angle: number }>
  lcd: {
    cols: number
    rows: number
    cursorCol: number
    cursorRow: number
    buffer: string[]          // 40-char DDRAM rows (HD44780 internal width)
    backlight: boolean
    displayOn: boolean
    cursorVisible: boolean
    cursorBlink: boolean
    direction: 1 | -1         // entry mode: left-to-right or right-to-left
    autoscroll: boolean
    scrollOffset: number       // display shift offset
    cgram: number[][]          // 8 custom chars, each 8 bytes of 5-bit pixel data
  } | null
  delayUntil: number // set by delay(), checked by VM
  serialBaud: number
  eeprom: Uint8Array // 1KB EEPROM
  i2cBus: Map<number, I2CDevice> // address → device
  toneOscillators: Map<number, { stop: () => void }> // pin → active oscillator
}

export function createStdlibState(startTime: number): StdlibState {
  return {
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

/** Map Arduino's numeric pinMode values to our PinMode enum. */
function arduinoModeToPinMode(mode: number): PinMode {
  switch (mode) {
    case 0: return "INPUT"
    case 1: return "OUTPUT"
    case 2: return "INPUT_PULLUP"
    default: return "UNSET"
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
  pinStore: PinStateStore,
  boardTarget: BoardTarget = DEFAULT_BOARD_TARGET,
): Record<string, unknown> {
  const analogPinConstants = Object.fromEntries(
    getBoardAnalogPins(boardTarget).map((pin, idx) => [`A${idx}`, pin]),
  ) as Record<string, number>

  // ── Pin I/O ──────────────────────────────────────────────────────
  //
  // All pin reads/writes go through the PinStateStore — single source of truth.

  function pinMode(pin: number, mode: number): void {
    pinStore.writeFromSketch(pin, { mode: arduinoModeToPinMode(mode) })
  }

  function digitalWrite(pin: number, value: number): void {
    const v: 0 | 1 = value ? 1 : 0
    pinStore.writeFromSketch(pin, { digitalValue: v, pwmValue: 0, isPwm: false })
  }

  function digitalRead(pin: number): number {
    return pinStore.readDigital(pin)
  }

  function analogWrite(pin: number, value: number): void {
    const clamped = Math.max(0, Math.min(255, Math.round(value)))
    pinStore.writeFromSketch(pin, {
      pwmValue: clamped,
      isPwm: true,
      digitalValue: clamped > 0 ? 1 : 0,
    })
  }

  function analogRead(pin: number): number {
    return pinStore.readAnalog(pin)
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
    // Arduino's map() returns long (integer). Truncate toward zero to match.
    return Math.trunc(((value - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow) + toLow)
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
  //
  // Interrupt registration is delegated to the PinStateStore, which fires
  // edge-detection callbacks atomically whenever any write changes a digital
  // value. No manual checkInterrupts() loop needed.

  function interruptModeFromArduino(mode: number): "RISING" | "FALLING" | "CHANGE" | "LOW" | "NONE" {
    switch (mode) {
      case 1: return "RISING"
      case 2: return "FALLING"
      case 3: return "CHANGE"
      case 0: return "LOW"
      default: return "NONE"
    }
  }

  function attachInterrupt(
    interruptNum: number,
    callback: () => void,
    mode: number,
  ): void {
    const pin = interruptNum === 0 ? 2 : interruptNum === 1 ? 3 : -1
    if (pin < 0) return
    pinStore.attachInterrupt(pin, interruptModeFromArduino(mode), callback)
  }

  function detachInterrupt(interruptNum: number): void {
    const pin = interruptNum === 0 ? 2 : interruptNum === 1 ? 3 : -1
    if (pin < 0) return
    pinStore.detachInterrupt(pin)
  }

  function digitalPinToInterrupt(pin: number): number {
    if (pin === 2) return 0
    if (pin === 3) return 1
    return -1
  }

  // ── pulseIn ─────────────────────────────────────────────────────

  function pulseIn(pin: number, _value: number, timeout?: number): number {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return 0

    const cm = ultrasonicDistanceBus.get(pin)
    if (cm != null) {
      // Validate: sketch must have set the trigger pin to OUTPUT mode
      const trigPin = ultrasonicTriggerPinBus.get(pin)
      if (trigPin != null) {
        const trigState = pinStore.getPin(trigPin)
        if (!trigState || trigState.mode !== "OUTPUT") return 0
      }

      // Out of range (> 400 cm or Infinity) → return 0 (timeout)
      if (!isFinite(cm) || cm > 400) return 0

      const us = Math.round(cm * 58)

      // Respect timeout parameter (in microseconds)
      if (timeout != null && us > timeout) return 0

      return us
    }

    // Legacy fallback: some sketches reuse analog values to fake a pulse width.
    const distance = pinStore.readAnalog(pin) || 50
    return distance * 58
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
        const dir: 0 | 1 = steps > 0 ? 1 : 0
        for (const p of this.pins) {
          pinStore.writeFromSketch(p, { digitalValue: dir })
        }
      }
    }
  }

  // ── Adafruit_NeoPixel ──────────────────────────────────────────

  class Adafruit_NeoPixelClass {
    private numPixels_: number
    private pin: number
    private pixels: Array<{ r: number; g: number; b: number }>

    constructor(numPixels: number, pin: number, _type?: number) {
      this.numPixels_ = numPixels
      this.pin = pin
      this.pixels = Array.from({ length: numPixels }, () => ({ r: 0, g: 0, b: 0 }))
    }

    begin(): void {
      pinStore.writeFromSketch(this.pin, { digitalValue: 1 })
    }

    show(): void { /* visual update would happen via libraryState */ }
    setBrightness(_b: number): void { /* no-op in simulation */ }

    setPixelColor(n: number, r: number, g?: number, b?: number): void {
      if (n < 0 || n >= this.numPixels_) return
      if (g !== undefined && b !== undefined) {
        this.pixels[n] = { r, g, b }
      } else {
        // packed color: 0xRRGGBB
        this.pixels[n] = { r: (r >> 16) & 0xff, g: (r >> 8) & 0xff, b: r & 0xff }
      }
    }

    numPixels(): number { return this.numPixels_ }

    getPixelColor(n: number): number {
      if (n < 0 || n >= this.numPixels_) return 0
      const p = this.pixels[n]
      return (p.r << 16) | (p.g << 8) | p.b
    }

    Color(r: number, g: number, b: number): number {
      return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
    }

    clear(): void {
      for (let i = 0; i < this.numPixels_; i++) {
        this.pixels[i] = { r: 0, g: 0, b: 0 }
      }
    }

    fill(color: number, first = 0, count?: number): void {
      const end = count !== undefined ? first + count : this.numPixels_
      for (let i = first; i < end && i < this.numPixels_; i++) {
        this.setPixelColor(i, color)
      }
    }
  }

  // ── DHT Sensor ────────────────────────────────────────────────────

  class DHTClass {
    private pin: number
    constructor(pin: number, _type: number | string) {
      this.pin = pin
    }
    begin(): void { /* no-op */ }
    readTemperature(isFahrenheit?: boolean): number {
      const entry = dhtSensorBus.get(this.pin)
      const c = entry?.temperatureC ?? 25
      return isFahrenheit ? c * 9 / 5 + 32 : c
    }
    readHumidity(): number {
      return dhtSensorBus.get(this.pin)?.humidity ?? 50
    }
    computeHeatIndex(temp: number, hum: number): number { return temp + hum * 0.01 }
  }

  // ── IR Receiver ───────────────────────────────────────────────────

  class IRrecvClass {
    private enabled = false
    private pin: number
    constructor(pin: number) {
      this.pin = pin
    }
    enableIRIn(): void { this.enabled = true }
    decode(results: { value: number }): boolean {
      if (!this.enabled) return false
      const entry = irReceiverBus.get(this.pin)
      if (!entry) return false
      if (Date.now() > entry.expiresAt) {
        irReceiverBus.delete(this.pin)
        return false
      }
      results.value = entry.code
      // Consume the code so each Inspector Send button press is one event.
      irReceiverBus.delete(this.pin)
      return true
    }
    resume(): void { /* no-op */ }
  }

  // ── Adafruit SSD1306 OLED ─────────────────────────────────────────

  class Adafruit_SSD1306Class {
    constructor(_w: number, _h: number, _wire?: unknown, _rst?: number) { /* no-op */ }
    begin(_vcs: number, _addr: number): boolean { return true }
    clearDisplay(): void { /* no-op */ }
    display(): void { /* no-op */ }
    setTextSize(_s: number): void { /* no-op */ }
    setTextColor(_c: number): void { /* no-op */ }
    setCursor(_x: number, _y: number): void { /* no-op */ }
    println(text: string | number): void { callbacks.onSerialPrint(`[OLED] ${text}\n`) }
    print(text: string | number): void { callbacks.onSerialPrint(`[OLED] ${text}`) }
    drawPixel(_x: number, _y: number, _c: number): void { /* no-op */ }
    drawLine(_x0: number, _y0: number, _x1: number, _y1: number, _c: number): void { /* no-op */ }
    drawRect(_x: number, _y: number, _w: number, _h: number, _c: number): void { /* no-op */ }
    fillRect(_x: number, _y: number, _w: number, _h: number, _c: number): void { /* no-op */ }
    drawCircle(_x: number, _y: number, _r: number, _c: number): void { /* no-op */ }
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
  //
  // Full HD44780 simulation: 40-char DDRAM per row, display/cursor/blink
  // control, entry mode, display shift, CGRAM custom characters, raw
  // command() access, and read-back support.

  const LCD_DDRAM_WIDTH = 40 // HD44780 internal row width

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
        buffer: Array.from({ length: rows }, () => " ".repeat(LCD_DDRAM_WIDTH)),
        backlight: true,
        displayOn: true,
        cursorVisible: false,
        cursorBlink: false,
        direction: 1,
        autoscroll: false,
        scrollOffset: 0,
        cgram: Array.from({ length: 8 }, () => Array<number>(8).fill(0)),
      }
    }

    setCursor(col: number, row: number): void {
      if (!state.lcd) return
      state.lcd.cursorCol = col
      state.lcd.cursorRow = row
    }

    home(): void {
      if (!state.lcd) return
      state.lcd.cursorCol = 0
      state.lcd.cursorRow = 0
      state.lcd.scrollOffset = 0
    }

    print(text: unknown): void {
      if (!state.lcd) return
      const str = String(text)
      for (let i = 0; i < str.length; i++) {
        this.writeChar(str.charCodeAt(i))
      }
    }

    /** Write a single character code at the cursor and advance. */
    write(value: number): void {
      if (!state.lcd) return
      this.writeChar(value)
    }

    private writeChar(code: number): void {
      const lcd = state.lcd!
      const row = lcd.cursorRow
      const col = lcd.cursorCol
      if (row < 0 || row >= lcd.rows) return
      if (col < 0 || col >= LCD_DDRAM_WIDTH) return

      const ch = String.fromCharCode(code)
      const currentRow = lcd.buffer[row]
      lcd.buffer[row] =
        currentRow.slice(0, col) + ch + currentRow.slice(col + 1)

      if (lcd.autoscroll) {
        lcd.scrollOffset += lcd.direction
      } else {
        lcd.cursorCol += lcd.direction
      }
    }

    clear(): void {
      if (!state.lcd) return
      state.lcd.buffer = Array.from({ length: state.lcd.rows }, () =>
        " ".repeat(LCD_DDRAM_WIDTH),
      )
      state.lcd.cursorCol = 0
      state.lcd.cursorRow = 0
      state.lcd.scrollOffset = 0
    }

    // ── Display on/off control ──────────────────────────────────────

    display(): void {
      if (state.lcd) state.lcd.displayOn = true
    }

    noDisplay(): void {
      if (state.lcd) state.lcd.displayOn = false
    }

    // ── Cursor visibility ───────────────────────────────────────────

    cursor(): void {
      if (state.lcd) state.lcd.cursorVisible = true
    }

    noCursor(): void {
      if (state.lcd) state.lcd.cursorVisible = false
    }

    blink(): void {
      if (state.lcd) state.lcd.cursorBlink = true
    }

    noBlink(): void {
      if (state.lcd) state.lcd.cursorBlink = false
    }

    // ── Backlight ───────────────────────────────────────────────────

    backlight(): void {
      if (state.lcd) state.lcd.backlight = true
    }

    noBacklight(): void {
      if (state.lcd) state.lcd.backlight = false
    }

    // ── Entry mode ──────────────────────────────────────────────────

    leftToRight(): void {
      if (state.lcd) state.lcd.direction = 1
    }

    rightToLeft(): void {
      if (state.lcd) state.lcd.direction = -1
    }

    autoscroll(): void {
      if (state.lcd) state.lcd.autoscroll = true
    }

    noAutoscroll(): void {
      if (state.lcd) state.lcd.autoscroll = false
    }

    // ── Display shift ───────────────────────────────────────────────

    scrollDisplayLeft(): void {
      if (state.lcd) state.lcd.scrollOffset--
    }

    scrollDisplayRight(): void {
      if (state.lcd) state.lcd.scrollOffset++
    }

    // ── CGRAM custom characters ─────────────────────────────────────

    createChar(index: number, charmap: number[]): void {
      if (!state.lcd) return
      if (index < 0 || index > 7) return
      state.lcd.cgram[index] = charmap.slice(0, 8)
      while (state.lcd.cgram[index].length < 8) {
        state.lcd.cgram[index].push(0)
      }
    }

    // ── Read operations ─────────────────────────────────────────────

    /** Read character at current cursor position from DDRAM. */
    read(): number {
      if (!state.lcd) return 0x20
      const row = state.lcd.cursorRow
      const col = state.lcd.cursorCol
      if (row < 0 || row >= state.lcd.rows) return 0x20
      if (col < 0 || col >= LCD_DDRAM_WIDTH) return 0x20
      return state.lcd.buffer[row].charCodeAt(col) || 0x20
    }

    /** Busy flag — always false in simulation (operations are instant). */
    busy(): boolean {
      return false
    }

    // ── Raw HD44780 command register ────────────────────────────────

    command(value: number): void {
      if (!state.lcd) return

      // Clear display
      if (value === 0x01) {
        this.clear()
        return
      }

      // Return home
      if (value === 0x02 || value === 0x03) {
        this.home()
        return
      }

      // Entry mode set (0b0000_01DS)
      if ((value & 0xfc) === 0x04) {
        state.lcd.direction = (value & 0x02) ? 1 : -1
        state.lcd.autoscroll = !!(value & 0x01)
        return
      }

      // Display on/off control (0b0000_1DCB)
      if ((value & 0xf8) === 0x08) {
        state.lcd.displayOn = !!(value & 0x04)
        state.lcd.cursorVisible = !!(value & 0x02)
        state.lcd.cursorBlink = !!(value & 0x01)
        return
      }

      // Cursor / display shift (0b0001_SRXX)
      if ((value & 0xf0) === 0x10) {
        const shiftDisplay = !!(value & 0x08)
        const shiftRight = !!(value & 0x04)
        if (shiftDisplay) {
          if (shiftRight) this.scrollDisplayRight()
          else this.scrollDisplayLeft()
        } else {
          state.lcd.cursorCol += shiftRight ? 1 : -1
        }
        return
      }

      // Set CGRAM address (0b01AA_AAAA) — no-op, createChar handles this
      if ((value & 0xc0) === 0x40) {
        return
      }

      // Set DDRAM address (0b1AAA_AAAA)
      if ((value & 0x80) === 0x80) {
        const addr = value & 0x7f
        state.lcd.cursorRow = addr >= 0x40 ? 1 : 0
        state.lcd.cursorCol = addr >= 0x40 ? addr - 0x40 : addr
        return
      }
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
    Adafruit_NeoPixel: Adafruit_NeoPixelClass,
    DHT: DHTClass,
    IRrecv: IRrecvClass,
    Adafruit_SSD1306: Adafruit_SSD1306Class,

    // Library constants
    NEO_GRB: 0x01,
    NEO_KHZ800: 0x02,
    DHT11: 11,
    DHT22: 22,
    SSD1306_SWITCHCAPVCC: 0x02,
    SSD1306_WHITE: 1,

    // Library objects
    EEPROM,
    Wire,
    SPI,

    // Constants
    HIGH: 1,
    LOW: 0,
    INPUT: 0,
    OUTPUT: 1,
    INPUT_PULLUP: 2,
    LED_BUILTIN: 13,
    ...analogPinConstants,
    MSBFIRST: 1,
    LSBFIRST: 0,

    // Interrupt modes
    RISING: 1,
    FALLING: 2,
    CHANGE: 3,
  }
}
