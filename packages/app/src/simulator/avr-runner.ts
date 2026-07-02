// ── AVR Runner (low-level avr8js wrapper) ──────────────────────────────────
//
// Wraps the avr8js emulator (CPU, GPIO, Timers, USART) into a simple
// interface that the `AvrSketchRunner` (in runners/avr-runner.ts) can drive
// frame-by-frame.

import {
  CPU,
  avrInstruction,
  avrInterrupt,
  AVRTimer,
  AVRIOPort,
  AVRUSART,
  AVRTWI,
  AVRADC,
  AVRClock,
  AVRSPI,
  AVREEPROM,
  EEPROMMemoryBackend,
  AVRWatchdog,
  ADCMuxInputType,
  adcConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  portBConfig,
  portCConfig,
  portDConfig,
  usart0Config,
  twiConfig,
  spiConfig,
  watchdogConfig,
  PinState,
} from "avr8js"

const AVR_FREQ_HZ = 16_000_000 // 16 MHz (Arduino Uno)

// ATmega328P has 1 KB of EEPROM. The backend is a plain byte buffer that
// persists for the lifetime of a run (cleared on reset()), so EEPROM.read /
// EEPROM.write round-trip correctly within a session.
const ATMEGA328P_EEPROM_BYTES = 1024

// Idle MISO reads back as 0xFF (line pulled high) when no SPI slave is wired.
// Returning this from the transfer callback lets SPI.transfer() see SPIF set
// and complete instead of spinning forever waiting on the flag.
const SPI_IDLE_MISO_BYTE = 0xff

export type AVRRunnerCallbacks = {
  /**
   * Fires whenever a pin's state transitions between Low / High / Input /
   * InputPullUp. Covers both OUTPUT writes (so the VM can mirror digital
   * levels) and DDR/PORT transitions that change the pin's *mode* (so the
   * pin-state-store can track INPUT / INPUT_PULLUP, which is what
   * components like buttons need to decide how to drive a line).
   */
  onPinChange: (port: string, pin: number, state: PinState) => void
  onSerialOutput: (char: string) => void
  readAnalogInput?: (arduinoPin: number) => number
}

export type AVRRunner = {
  load: (program: Uint16Array) => void
  /**
   * Run up to `cycles` worth of instructions. Returns `true` if execution
   * stopped early because the program counter reached an armed breakpoint
   * (see `setBreakpoints`), `false` if the full cycle budget was consumed.
   */
  execute: (cycles: number) => boolean
  writeSerialInput: (text: string) => void
  setExternalPin: (port: string, pin: number, value: boolean) => void
  getPin: (port: string, pin: number) => PinState
  stop: () => void
  reset: () => void
  getCycleCount: () => number
  getFrequencyHz: () => number
  /**
   * Returns the current AVRTWI instance. NOTE: this changes on every `reset()`
   * — callers (sketch-runner / peripheral-bus) must re-fetch and reinstall
   * any `eventHandler` after reset, otherwise I²C peripherals will be bound
   * to a dead TWI instance ("works once, dead after Stop/Run" bug).
   */
  getTwi: () => AVRTWI

  // ── Debug-control surface ──────────────────────────────────────────────
  /** Arm the set of WORD program addresses that should halt `execute`. */
  setBreakpoints: (addresses: readonly number[]) => void
  /**
   * Mark the next `execute`/`step` so it runs the instruction at the current
   * pc before re-checking breakpoints — otherwise resuming from a breakpoint
   * would immediately re-halt on the same instruction.
   */
  prepareResume: () => void
  /** Execute exactly one instruction (single-step), ignoring breakpoints. */
  step: () => void
  /** Current program counter (WORD address; same unit as breakpoints). */
  getPc: () => number
  /** Current stack pointer (SPH:SPL). */
  getSp: () => number
  /**
   * Copy of the full AVR data space: R0–R31 at 0x00–0x1F, I/O registers at
   * 0x20–0xFF, SRAM from 0x100. Taken on halt only, so the copy is cheap.
   */
  getDataSpace: () => Uint8Array
}

/**
 * Map from port name to the avr8js port config and the Arduino pin number
 * offset for that port.
 *
 * Arduino Uno pin mapping:
 *   D0–D7  = PORTD pins 0–7
 *   D8–D13 = PORTB pins 0–5
 *   A0–A5  = PORTC pins 0–5  (Arduino pins 14–19)
 */
const PORT_MAP = {
  D: { config: portDConfig, offset: 0 },
  B: { config: portBConfig, offset: 8 },
  C: { config: portCConfig, offset: 14 },
} as const

/**
 * Convert an Arduino pin number (0–19) to a port name and pin index.
 */
export function arduinoPinToPort(arduinoPin: number): { port: string; pin: number } | null {
  if (arduinoPin >= 0 && arduinoPin <= 7) {
    return { port: "D", pin: arduinoPin }
  }
  if (arduinoPin >= 8 && arduinoPin <= 13) {
    return { port: "B", pin: arduinoPin - 8 }
  }
  if (arduinoPin >= 14 && arduinoPin <= 19) {
    return { port: "C", pin: arduinoPin - 14 }
  }
  return null
}

/**
 * Convert a port name + pin index to an Arduino pin number.
 */
export function portToArduinoPin(port: string, pin: number): number | null {
  const entry = PORT_MAP[port as keyof typeof PORT_MAP]
  if (!entry) return null
  return entry.offset + pin
}

export function createAVRRunner(callbacks: AVRRunnerCallbacks): AVRRunner {
  // ATmega328P: 32KB flash = 0x4000 16-bit words, 2KB SRAM
  let cpu = new CPU(new Uint16Array(0x4000), 0x800)

  let portB = new AVRIOPort(cpu, portBConfig)
  let portC = new AVRIOPort(cpu, portCConfig)
  let portD = new AVRIOPort(cpu, portDConfig)

  let timer0 = new AVRTimer(cpu, timer0Config)
  let timer1 = new AVRTimer(cpu, timer1Config)
  let timer2 = new AVRTimer(cpu, timer2Config)

  let usart = new AVRUSART(cpu, usart0Config, AVR_FREQ_HZ)
  let twi = new AVRTWI(cpu, twiConfig, AVR_FREQ_HZ)
  let adc = new AVRADC(cpu, adcConfig)

  // The system clock drives CLKPR prescaling and, crucially, feeds the
  // watchdog its timeout base — AVRWatchdog needs a live AVRClock reference.
  let clock = new AVRClock(cpu, AVR_FREQ_HZ)
  // SPI, EEPROM and the watchdog install their own CPU register write-hooks in
  // their constructors. Before they were wired, SPDR writes were ignored (so
  // SPIF never set and SPI.transfer() spun forever), EEPROM.read/write were
  // no-ops, and WDT registers did nothing. They must be recreated on reset()
  // alongside the CPU they hook into.
  let spi = new AVRSPI(cpu, spiConfig, AVR_FREQ_HZ)
  let eeprom = new AVREEPROM(cpu, new EEPROMMemoryBackend(ATMEGA328P_EEPROM_BYTES))
  let watchdog = new AVRWatchdog(cpu, watchdogConfig, clock)

  // Bytes waiting to be delivered to the AVR USART RX line.
  const serialInputQueue: number[] = []
  let serialInputReadIdx = 0

  // ── Debug state ──────────────────────────────────────────────────────────
  // WORD program addresses that halt execution; empty in the common (non-debug)
  // path so `execute` pays only a `.size` check per instruction.
  let breakpoints = new Set<number>()
  // When resuming from a breakpoint, run one instruction before re-checking so
  // we don't immediately re-halt on the instruction we're parked on.
  let skipBreakpointOnce = false

  function getPortInstance(portName: string): AVRIOPort | null {
    switch (portName) {
      case "B":
        return portB
      case "C":
        return portC
      case "D":
        return portD
      default:
        return null
    }
  }

  // Per-port cache of the last reported PinState for each of the 8 bits.
  // We can't rely on the (value, oldValue) diff alone because DDR changes
  // also toggle the *mode* (Input ↔ InputPullUp ↔ High/Low) without
  // necessarily flipping the PORT bits the listener receives.
  const lastPinState: Record<string, PinState[]> = {
    B: Array(8).fill(PinState.Input),
    C: Array(8).fill(PinState.Input),
    D: Array(8).fill(PinState.Input),
  }

  function defaultAdcResult(input: Parameters<typeof adc.onADCRead>[0]): number {
    let voltage = 0
    switch (input.type) {
      case ADCMuxInputType.Constant:
        voltage = input.voltage
        break
      case ADCMuxInputType.Differential:
        voltage = input.gain *
          ((adc.channelValues[input.positiveChannel] || 0) -
            (adc.channelValues[input.negativeChannel] || 0))
        break
      case ADCMuxInputType.Temperature:
        voltage = 0.378125
        break
      case ADCMuxInputType.SingleEnded:
        voltage = adc.channelValues[input.channel] ?? 0
        break
    }
    return Math.min(Math.max(Math.floor((voltage / adc.referenceVoltage) * 1024), 0), 1023)
  }

  function wireAdc(): void {
    adc.onADCRead = (input) => {
      const result =
        input.type === ADCMuxInputType.SingleEnded
          ? callbacks.readAnalogInput?.(14 + input.channel) ?? 0
          : defaultAdcResult(input)
      const clamped = Math.min(Math.max(Math.round(result), 0), 1023)
      cpu.addClockEvent(() => adc.completeADCRead(clamped), adc.sampleCycles)
    }
  }

  function wireSpi(): void {
    // No SPI slave device is modeled, so satisfy the transfer ourselves.
    // avr8js's default `onByte` already schedules completion, but it reads
    // back 0x00; a floating/unselected MISO line idles HIGH, so real sketches
    // probing for a chip (or SD/flash libraries) expect 0xFF. Complete after
    // the hardware-accurate `transferCycles` so SPIF timing stays realistic
    // and `SPI.transfer()` sees the flag instead of spinning forever.
    spi.onByte = () => {
      cpu.addClockEvent(
        () => spi.completeTransfer(SPI_IDLE_MISO_BYTE),
        spi.transferCycles,
      )
    }
  }

  function wireListeners(): void {
    // The avr8js port listener fires on both DDR and PORT writes (see
    // writeGpio in avr8js/gpio.js). That means one callback covers the
    // full state machine: OUTPUT level flips, pinMode() transitions, and
    // INPUT_PULLUP enable/disable.
    for (const [portName, port] of Object.entries({ B: portB, C: portC, D: portD })) {
      port.addListener(() => {
        const entry = PORT_MAP[portName as keyof typeof PORT_MAP]
        if (!entry) return
        const cache = lastPinState[portName]
        for (let i = 0; i < 8; i++) {
          const next = port.pinState(i)
          if (cache[i] === next) continue
          const prev = cache[i]
          cache[i] = next

          // Simulate the internal pull-up resistor: avr8js's PIN register
          // only reflects pinValue (set via setPin), so an INPUT_PULLUP pin
          // would read LOW by default. Seed it HIGH when the mode becomes
          // InputPullUp so digitalRead matches real-Arduino behavior.
          if (next === PinState.InputPullUp && prev !== PinState.InputPullUp) {
            port.setPin(i, true)
          } else if (next === PinState.Input && prev === PinState.InputPullUp) {
            // Pullup disabled → release the line LOW.
            port.setPin(i, false)
          }

          callbacks.onPinChange(portName, i, next)
        }
      })
    }

    // USART transmit callback
    usart.onByteTransmit = (value) => {
      callbacks.onSerialOutput(String.fromCharCode(value))
    }
  }

  function clearSerialInputQueue(): void {
    serialInputQueue.length = 0
    serialInputReadIdx = 0
  }

  function compactSerialInputQueue(): void {
    if (serialInputReadIdx === 0) return
    if (serialInputReadIdx === serialInputQueue.length) {
      clearSerialInputQueue()
      return
    }
    // Compact occasionally so we don't grow unbounded indices.
    if (serialInputReadIdx >= 64 || serialInputReadIdx * 2 >= serialInputQueue.length) {
      serialInputQueue.splice(0, serialInputReadIdx)
      serialInputReadIdx = 0
    }
  }

  function drainSerialInputQueue(): void {
    while (serialInputReadIdx < serialInputQueue.length) {
      const nextByte = serialInputQueue[serialInputReadIdx]
      // writeByte returns false when RX is busy or disabled.
      if (!usart.writeByte(nextByte)) break
      serialInputReadIdx++
    }
    compactSerialInputQueue()
  }

  wireListeners()
  wireAdc()
  wireSpi()

  function load(program: Uint16Array): void {
    cpu.reset()
    clearSerialInputQueue()
    // Copy program into CPU memory
    const len = Math.min(program.length, cpu.progMem.length)
    for (let i = 0; i < len; i++) {
      cpu.progMem[i] = program[i]
    }
    cpu.pc = 0
    cpu.cycles = 0
  }

  function execute(cycles: number): boolean {
    drainSerialInputQueue()
    const targetCycles = cpu.cycles + cycles
    const hasBreakpoints = breakpoints.size > 0
    while (cpu.cycles < targetCycles) {
      if (hasBreakpoints) {
        if (skipBreakpointOnce) {
          // Consume the one-shot skip on the instruction we resumed from.
          skipBreakpointOnce = false
        } else if (breakpoints.has(cpu.pc)) {
          drainSerialInputQueue()
          return true
        }
      }
      avrInstruction(cpu)
      cpu.tick()
    }
    drainSerialInputQueue()
    return false
  }

  // ── Debug-control surface ──────────────────────────────────────────────────

  function setBreakpoints(addresses: readonly number[]): void {
    breakpoints = new Set(addresses)
  }

  function prepareResume(): void {
    skipBreakpointOnce = true
  }

  function step(): void {
    drainSerialInputQueue()
    avrInstruction(cpu)
    cpu.tick()
    skipBreakpointOnce = false
    drainSerialInputQueue()
  }

  function getPc(): number {
    return cpu.pc
  }

  function getSp(): number {
    // SPL = 0x5D, SPH = 0x5E in the ATmega328P I/O space.
    return cpu.data[0x5d] | (cpu.data[0x5e] << 8)
  }

  function getDataSpace(): Uint8Array {
    return cpu.data.slice()
  }

  function writeSerialInput(text: string): void {
    if (!text) return
    for (const ch of text) {
      serialInputQueue.push(ch.charCodeAt(0) & 0xff)
    }
    drainSerialInputQueue()
  }

  function setExternalPin(port: string, pin: number, value: boolean): void {
    const portInstance = getPortInstance(port)
    if (!portInstance) return
    portInstance.setPin(pin, value)
  }

  function getPin(port: string, pin: number): PinState {
    const portInstance = getPortInstance(port)
    if (!portInstance) return PinState.Input
    return portInstance.pinState(pin)
  }

  function stop(): void {
    // Nothing to clean up — execution is synchronous
  }

  function reset(): void {
    // Recreate all peripherals for a clean slate
    cpu = new CPU(new Uint16Array(0x4000), 0x800)
    portB = new AVRIOPort(cpu, portBConfig)
    portC = new AVRIOPort(cpu, portCConfig)
    portD = new AVRIOPort(cpu, portDConfig)
    timer0 = new AVRTimer(cpu, timer0Config)
    timer1 = new AVRTimer(cpu, timer1Config)
    timer2 = new AVRTimer(cpu, timer2Config)
    usart = new AVRUSART(cpu, usart0Config, AVR_FREQ_HZ)
    twi = new AVRTWI(cpu, twiConfig, AVR_FREQ_HZ)
    adc = new AVRADC(cpu, adcConfig)
    clock = new AVRClock(cpu, AVR_FREQ_HZ)
    spi = new AVRSPI(cpu, spiConfig, AVR_FREQ_HZ)
    eeprom = new AVREEPROM(cpu, new EEPROMMemoryBackend(ATMEGA328P_EEPROM_BYTES))
    watchdog = new AVRWatchdog(cpu, watchdogConfig, clock)
    for (const port of Object.keys(lastPinState)) {
      lastPinState[port].fill(PinState.Input)
    }
    clearSerialInputQueue()
    skipBreakpointOnce = false
    wireListeners()
    wireAdc()
    wireSpi()
  }

  function getCycleCount(): number {
    return cpu.cycles
  }

  function getFrequencyHz(): number {
    return AVR_FREQ_HZ
  }

  return {
    load,
    execute,
    writeSerialInput,
    setExternalPin,
    getPin,
    stop,
    reset,
    getCycleCount,
    getFrequencyHz,
    getTwi: () => twi,
    setBreakpoints,
    prepareResume,
    step,
    getPc,
    getSp,
    getDataSpace,
  }
}
